#!/usr/bin/env node
/**
 * Attach verified YouTube playlists (grade+subject playlists) as materials to
 * the matching class+subject syllabi. One playlist material per subject-grade
 * (first topic). Idempotent by title match.
 *
 * Usage: node scripts/db/attach-playlist-materials.mjs <playlists.json> [--org=my-school-days]
 */
import { readFileSync } from "node:fs";
import pg from "pg";

const ORG_SLUG = (process.argv.find((a) => a.startsWith("--org=")) ?? "--org=my-school-days").slice(6);
const file = process.argv[2];
if (!file || !/playlists.*\.json$/.test(file)) {
  console.error("Usage: node scripts/db/attach-playlist-materials.mjs <playlists.json>");
  process.exit(1);
}
const MIGRATOR_URL = (process.env.MIGRATOR_DATABASE_URL ?? "").replace(/([?&])sslmode=[^&]*/, "");
if (!MIGRATOR_URL) {
  console.error("MIGRATOR_DATABASE_URL is required (load .env first).");
  process.exit(1);
}
const playlists = JSON.parse(readFileSync(file, "utf8"));

// subject keywords in playlist titles -> our subject names
const subjectMatchers = [
  { subject: "Mathematics", keys: /maths|mathematics/i },
  { subject: "Science", keys: /\bscience\b|evs|environment/i },
  { subject: "Social Studies", keys: /social science|social studies|sst/i },
  { subject: "History & Civics", keys: /history|civics/i },
  { subject: "Geography", keys: /geography/i },
  { subject: "Physics", keys: /physics/i },
  { subject: "Chemistry", keys: /chemistry/i },
  { subject: "Biology", keys: /biology/i },
  { subject: "English", keys: /\benglish\b|grammar/i },
  { subject: "Hindi", keys: /hindi|sanskrit/i },
  { subject: "Computer Studies", keys: /computer/i },
];

const pool = new pg.Pool({ connectionString: MIGRATOR_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 60000 });
const client = await pool.connect();

try {
  await client.query("BEGIN");
  await client.query("SELECT set_config('app.org_id', (SELECT id::text FROM identity.organizations WHERE slug = $1), true)", [ORG_SLUG]);
  const orgId = (await client.query("SELECT id FROM identity.organizations WHERE slug = $1", [ORG_SLUG])).rows[0].id;
  const actor = (await client.query("SELECT id FROM identity.users WHERE org_id = $1 AND email = 'admin@myschooldays.school'", [orgId])).rows[0].id;

  let attached = 0;
  for (const playlist of playlists) {
    const gradeMatch = /class\s*(\d{1,2})(?:st|nd|rd|th)?\b/i.exec(playlist.title);
    if (!gradeMatch) continue;
    const grade = Number(gradeMatch[1]);
    if (grade < 1 || grade > 10) continue;
    const matcher = subjectMatchers.find((m) => m.keys.test(playlist.title));
    if (!matcher) continue;

    const cls = (await client.query("SELECT id FROM academic.classes WHERE org_id = $1 AND name = $2 AND grade_level = $3", [orgId, `Grade ${grade}`, grade])).rows[0];
    if (!cls) continue;
    const subject = (await client.query("SELECT id FROM academic.subjects WHERE org_id = $1 AND name = $2", [orgId, matcher.subject])).rows[0];
    if (!subject) continue;
    const syllabus = (await client.query("SELECT id FROM learning.syllabi WHERE org_id = $1 AND class_id = $2 AND subject_id = $3", [orgId, cls.id, subject.id])).rows[0];
    if (!syllabus) continue;
    const firstLesson = (await client.query("SELECT id FROM learning.syllabus_lessons WHERE org_id = $1 AND syllabus_id = $2 ORDER BY position LIMIT 1", [orgId, syllabus.id])).rows[0];
    if (!firstLesson) continue;
    const topic = (await client.query("SELECT id FROM learning.syllabus_topics WHERE org_id = $1 AND lesson_id = $2 ORDER BY position LIMIT 1", [orgId, firstLesson.id])).rows[0];
    if (!topic) continue;

    const url = `https://www.youtube.com/playlist?list=${playlist.id}`;
    const title = `🎬 Video course: ${playlist.title}`.slice(0, 180);
    const result = await client.query(
      `INSERT INTO learning.syllabus_materials (org_id, topic_id, title, kind, url, description, position, created_by, updated_by)
       SELECT $1, $2, $3, 'video', $4, $5,
              (SELECT COALESCE(max(position) + 1, 0) FROM learning.syllabus_materials WHERE org_id = $1 AND topic_id = $2), $6, $6
       WHERE NOT EXISTS (SELECT 1 FROM learning.syllabus_materials WHERE org_id = $1 AND topic_id = $2 AND url = $4)
       ON CONFLICT (org_id, topic_id, position) DO NOTHING
       RETURNING id`,
      [orgId, topic.id, title, url, `Full video course playlist — plays inside the app.`, actor],
    );
    attached += result.rowCount;
    if (result.rowCount) console.log(`attached: Grade ${grade} ${matcher.subject} ← ${playlist.title.slice(0, 70)}`);
  }

  await client.query("COMMIT");
  console.log("playlists attached:", attached);
} catch (error) {
  await client.query("ROLLBACK");
  console.error("FAILED:", error.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
