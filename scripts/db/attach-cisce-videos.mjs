#!/usr/bin/env node
/**
 * Attach verified CISCE channel videos to Grade 10 Mathematics syllabus
 * units, matched by chapter keywords in the video titles. Also adds the
 * CISCE curriculum PDF (kind document) to the first topic. Idempotent.
 *
 * Usage (repo root, .env loaded):
 *   set -a; . ./.env; set +a; node scripts/db/attach-cisce-videos.mjs [--org=my-school-days]
 */
import { readFileSync } from "node:fs";
import pg from "pg";

const ORG_SLUG = (process.argv.find((a) => a.startsWith("--org=")) ?? "--org=my-school-days").slice(6);
const MIGRATOR_URL = (process.env.MIGRATOR_DATABASE_URL ?? "").replace(/([?&])sslmode=[^&]*/, "");
if (!MIGRATOR_URL) {
  console.error("MIGRATOR_DATABASE_URL is required (load .env first).");
  process.exit(1);
}

const videos = JSON.parse(readFileSync(new URL("./cisce-channel-videos.json", import.meta.url), "utf8"))
  // Only ICSE Class 10 videos; ISC 11/12 are not part of this school's grades.
  .filter((v) => /ICSE/i.test(v.title))
  .map((v) => ({ ...v, url: `https://youtube.com/watch?v=${v.id}` }));

// Match video titles to Grade 10 Maths syllabus units by keywords.
const unitMatchers = [
  { unit: /commercial/i, keys: /gst|banking|shares|dividend/i },
  { unit: /algebra/i, keys: /algebra|linear ineq|matrices|factorisation|quadratic|coordinate/i },
  { unit: /trigonometry/i, keys: /trigono|height|distance/i },
  { unit: /geometry/i, keys: /circle|similar|loci|tangent|construction/i },
  { unit: /mensuration/i, keys: /mensuration|cylinder|cone|sphere|volume|area/i },
  { unit: /statistics/i, keys: /statistic|probability|mean|median|graph/i },
];

const pool = new pg.Pool({ connectionString: MIGRATOR_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 60000 });
const client = await pool.connect();

try {
  await client.query("BEGIN");
  await client.query("SELECT set_config('app.org_id', (SELECT id::text FROM identity.organizations WHERE slug = $1), true)", [ORG_SLUG]);

  const orgId = (await client.query("SELECT id FROM identity.organizations WHERE slug = $1", [ORG_SLUG])).rows[0].id;
  const actor = (await client.query("SELECT id FROM identity.users WHERE org_id = $1 AND email = 'admin@myschooldays.school'", [orgId])).rows[0].id;
  const cls = (await client.query("SELECT id FROM academic.classes WHERE org_id = $1 AND name = 'Grade 10'", [orgId])).rows[0].id;
  const mathSubject = (await client.query("SELECT id FROM academic.subjects WHERE org_id = $1 AND name = 'Mathematics'", [orgId])).rows[0].id;
  const syllabus = (await client.query("SELECT id FROM learning.syllabi WHERE org_id = $1 AND class_id = $2 AND subject_id = $3", [orgId, cls, mathSubject])).rows[0];

  let attached = 0;
  for (const video of videos) {
    // Prefer the matching unit; fall back to the first lesson.
    let target = null;
    for (const matcher of unitMatchers) {
      if (!matcher.keys.test(video.title)) continue;
      const lesson = await client.query(
        "SELECT id FROM learning.syllabus_lessons WHERE org_id = $1 AND syllabus_id = $2 AND title ~* $3 ORDER BY position LIMIT 1",
        [orgId, syllabus.id, matcher.unit.source.replace(/\\/g, "")],
      );
      if (lesson.rows[0]) { target = lesson.rows[0].id; break; }
    }
    if (!target) {
      const first = await client.query(
        "SELECT id FROM learning.syllabus_lessons WHERE org_id = $1 AND syllabus_id = $2 ORDER BY position LIMIT 1",
        [orgId, syllabus.id],
      );
      target = first.rows[0]?.id;
    }
    if (!target) continue;
    // First topic inside the target lesson.
    const topic = await client.query(
      "SELECT id FROM learning.syllabus_topics WHERE org_id = $1 AND lesson_id = $2 ORDER BY position LIMIT 1",
      [orgId, target],
    );
    if (!topic.rows[0]) continue;
    try {
    const result = await client.query(
      `INSERT INTO learning.syllabus_materials (org_id, topic_id, title, kind, url, description, position, created_by, updated_by)
       SELECT $1, $2, $3, 'video', $4, $5,
              (SELECT COALESCE(max(position) + 1, 0) FROM learning.syllabus_materials WHERE org_id = $1 AND topic_id = $2),
              $6, $6
       WHERE NOT EXISTS (SELECT 1 FROM learning.syllabus_materials WHERE org_id = $1 AND topic_id = $2 AND url = $4)
       ON CONFLICT (org_id, topic_id, position) DO NOTHING
       RETURNING id`,
      [orgId, topic.rows[0].id, video.title.slice(0, 180), video.url, "CISCE class-video (plays in-app)", actor],
    );
    attached += result.rowCount;
    } catch (err) {
      if (err.code === "23505") {
        // Concurrent-safe skip: another material claimed this position.
        await client.query("ROLLBACK");
        await client.query("BEGIN");
        await client.query("SELECT set_config('app.org_id', (SELECT id::text FROM identity.organizations WHERE slug = $1), true)", [ORG_SLUG]);
        continue;
      }
      throw err;
    }
  }

  // CISCE curriculum PDF as a document on the first topic (direct-iframe readable).
  const firstLesson = (await client.query("SELECT id FROM learning.syllabus_lessons WHERE org_id = $1 AND syllabus_id = $2 ORDER BY position LIMIT 1", [orgId, syllabus.id])).rows[0];
  if (firstLesson) {
    const topic = (await client.query("SELECT id FROM learning.syllabus_topics WHERE org_id = $1 AND lesson_id = $2 ORDER BY position LIMIT 1", [orgId, firstLesson.id])).rows[0];
    if (topic) {
      await client.query(
        `INSERT INTO learning.syllabus_materials (org_id, topic_id, title, kind, url, description, position, created_by, updated_by)
         SELECT $1, $2, 'CISCE Curriculum (official)', 'document', $3, 'Official CISCE curriculum reference document.',
                (SELECT COALESCE(max(position) + 1, 0) FROM learning.syllabus_materials WHERE org_id = $1 AND topic_id = $2), $4, $4
         WHERE NOT EXISTS (SELECT 1 FROM learning.syllabus_materials WHERE org_id = $1 AND topic_id = $2 AND url = $3)
         ON CONFLICT (org_id, topic_id, position) DO NOTHING`,
        [orgId, topic.id, "https://cisce.org/wp-content/uploads/2025/03/PrimaryCurriculum.pdf", actor],
      );
    }
  }

  await client.query("COMMIT");
  console.log(`attached ${attached} CISCE videos to Grade 10 Mathematics (org ${ORG_SLUG})`);
} catch (error) {
  await client.query("ROLLBACK");
  console.error("FAILED:", error.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
