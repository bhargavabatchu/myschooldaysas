#!/usr/bin/env node
/**
 * ICSE syllabus preloader (Grades 1-10), CISCE-aligned.
 *
 * Creates per-grade subjects, links them to every active section of the
 * matching grade, and seeds learning.syllabi with units (as lessons) and
 * chapters (as topics). Idempotent: subjects with existing lessons are
 * skipped, so re-running never duplicates content.
 *
 * Usage (repo root, .env loaded):
 *   set -a; . ./.env; set +a; node scripts/db/seed-icse-syllabus.mjs [--org=my-school-days]
 */
import { readFileSync } from "node:fs";
import pg from "pg";

const ORG_SLUG = (process.argv.find((a) => a.startsWith("--org=")) ?? "--org=my-school-days").slice(6);
const MIGRATOR_URL = (process.env.MIGRATOR_DATABASE_URL ?? "").replace(/([?&])sslmode=[^&]*/, "");
if (!MIGRATOR_URL) {
  console.error("MIGRATOR_DATABASE_URL is required (load .env first).");
  process.exit(1);
}

const curriculum = JSON.parse(readFileSync(new URL("./icse-curriculum.json", import.meta.url), "utf8"));

const pool = new pg.Pool({ connectionString: MIGRATOR_URL, ssl: { rejectUnauthorized: false } });
const client = await pool.connect();

try {
  await client.query("BEGIN");

  const org = await client.query("SELECT id FROM identity.organizations WHERE slug = $1 FOR UPDATE", [ORG_SLUG]);
  if (!org.rows[0]) throw new Error(`Organization "${ORG_SLUG}" not found.`);
  const orgId = org.rows[0].id;
  await client.query("SELECT set_config('app.org_id', $1, true)", [orgId]);

  const admin = await client.query(
    "SELECT id FROM identity.users WHERE org_id = $1 AND email = 'admin@myschooldays.school' LIMIT 1",
    [orgId],
  );
  if (!admin.rows[0]) throw new Error("admin@myschooldays.school not found in this organization.");
  const actorId = admin.rows[0].id;

  let subjectsCreated = 0;
  let subjectsLinked = 0;
  let syllabiCreated = 0;
  let lessonsCreated = 0;
  let topicsCreated = 0;
  const skipped = [];

  for (const stage of curriculum.stages) {
    for (const grade of stage.grades) {
      const className = `Grade ${grade}`;
      const cls = await client.query(
        "SELECT id FROM academic.classes WHERE org_id = $1 AND name = $2 LIMIT 1",
        [orgId, className],
      );
      if (!cls.rows[0]) {
        skipped.push(`${className} (class missing)`);
        continue;
      }
      const classId = cls.rows[0].id;
      const sections = await client.query(
        "SELECT id FROM academic.sections WHERE org_id = $1 AND class_id = $2 AND is_active",
        [orgId, classId],
      );

      for (const subject of stage.subjects) {
        const subj = await client.query(
          `INSERT INTO academic.subjects (org_id, code, name)
           VALUES ($1, $2, $3)
           ON CONFLICT (org_id, name) DO UPDATE SET code = COALESCE(EXCLUDED.code, academic.subjects.code)
           RETURNING id`,
          [orgId, subject.code, subject.name],
        );
        const subjectId = subj.rows[0].id;
        if (subj.rowCount === 1) subjectsCreated += 1;

        // Link subject to every active section of this grade.
        for (const section of sections.rows) {
          const link = await client.query(
            `INSERT INTO academic.section_subjects (org_id, section_id, subject_id)
             VALUES ($1, $2, $3)
             ON CONFLICT (org_id, section_id, subject_id) DO UPDATE SET is_active = true`,
            [orgId, section.id, subjectId],
          );
          subjectsLinked += link.rowCount;
        }

        // Upsert the syllabus header.
        const syllabus = await client.query(
          `INSERT INTO learning.syllabi (org_id, class_id, subject_id, created_by, updated_by)
           VALUES ($1, $2, $3, $4, $4)
           ON CONFLICT (org_id, class_id, subject_id) DO UPDATE SET updated_by = EXCLUDED.updated_by
           RETURNING id, (xmax = 0) AS inserted`,
          [orgId, classId, subjectId, actorId],
        );
        const syllabusId = syllabus.rows[0].id;
        const wasInserted = syllabus.rows[0].inserted === true;

        // Reference materials (idempotent): CISCE class-video channel + the
        // official curriculum PDF, attached to the first topic. Runs before
        // the lesson-skip so reruns still attach materials to new syllabi.
        const firstLesson = await client.query(
          "SELECT id FROM learning.syllabus_lessons WHERE org_id = $1 AND syllabus_id = $2 ORDER BY position LIMIT 1",
          [orgId, syllabusId],
        );
        if (firstLesson.rows[0]) {
          const firstTopic = await client.query(
            "SELECT id FROM learning.syllabus_topics WHERE org_id = $1 AND lesson_id = $2 ORDER BY position LIMIT 1",
            [orgId, firstLesson.rows[0].id],
          );
          if (firstTopic.rows[0]) {
            await client.query(
              `INSERT INTO learning.syllabus_materials (org_id, topic_id, title, kind, url, description, position, created_by, updated_by)
               SELECT $1, $2, m.title, m.kind, m.url, m.description, m.position, $3, $3
                 FROM (VALUES
                   ($4::text, 'video'::text, $5::text, 'CISCE official class-video channel — curated lesson videos for this subject.', 0),
                   ($6::text, 'document'::text, $7::text, 'Official CISCE curriculum reference document.', 1)
                 ) AS m(title, kind, url, description, position)
               WHERE NOT EXISTS (
                 SELECT 1 FROM learning.syllabus_materials sm
                  WHERE sm.org_id = $1 AND sm.topic_id = $2 AND sm.title = m.title
               )`,
              [
                orgId,
                firstTopic.rows[0].id,
                actorId,
                "CISCE Class Videos (official channel)",
                `https://www.youtube.com/c/cisceclassvideos/search?query=${encodeURIComponent(`ICSE ${className} ${subject.name}`)}`,
                "CISCE Curriculum (official)",
                "https://cisce.org/wp-content/uploads/2025/03/PrimaryCurriculum.pdf",
              ],
            );
          }
        }

        // Idempotency: skip subjects that already have lessons.
        const existingLessons = await client.query(
          "SELECT count(*)::int AS total FROM learning.syllabus_lessons WHERE org_id = $1 AND syllabus_id = $2",
          [orgId, syllabusId],
        );
        if (existingLessons.rows[0].total > 0) continue;
        if (wasInserted) syllabiCreated += 1;

        // Bulk-insert units as lessons with explicit positions.
        const lessonTitles = subject.units.map((u) => u.title);
        const lessonDescs = subject.units.map(() => "");
        const positions = subject.units.map((_, i) => i);
        const lessons = await client.query(
          `INSERT INTO learning.syllabus_lessons (org_id, syllabus_id, title, description, position, created_by, updated_by)
           SELECT $1, $2, title, description, position, $6, $6
             FROM unnest($3::text[], $4::text[], $5::int[]) WITH ORDINALITY AS t(title, description, position, ord)
           ORDER BY ord
           RETURNING id, position`,
          [orgId, syllabusId, lessonTitles, lessonDescs, positions, actorId],
        );
        lessonsCreated += lessons.rowCount;

        // Bulk-insert chapters as topics per lesson.
        for (const [unitIndex, unit] of subject.units.entries()) {
          const lesson = lessons.rows.find((row) => row.position === unitIndex);
          if (!lesson) continue;
          const topicTitles = unit.chapters;
          const topicDescs = unit.chapters.map(() => "");
          const topicPositions = unit.chapters.map((_, i) => i);
          const topics = await client.query(
            `INSERT INTO learning.syllabus_topics (org_id, lesson_id, title, description, position, created_by, updated_by)
             SELECT $1, $2, title, description, position, $6, $6
               FROM unnest($3::text[], $4::text[], $5::int[]) WITH ORDINALITY AS t(title, description, position, ord)
             ORDER BY ord
             RETURNING id`,
            [orgId, lesson.id, topicTitles, topicDescs, topicPositions, actorId],
          );
          topicsCreated += topics.rowCount;
        }

      }
      console.log(`${className}: ${sections.rowCount} sections processed`);
    }
  }

  await client.query("COMMIT");
  console.log("----- ICSE syllabus preload summary -----");
  console.log(`subjects created: ${subjectsCreated}`);
  console.log(`section-subject links upserted: ${subjectsLinked}`);
  console.log(`syllabi created: ${syllabiCreated}`);
  console.log(`lessons created: ${lessonsCreated}`);
  console.log(`topics created: ${topicsCreated}`);
  if (skipped.length) console.log("skipped:", skipped.join(", "));
  console.log(`org: ${ORG_SLUG} (${orgId})`);
} catch (error) {
  await client.query("ROLLBACK");
  console.error("SEED FAILED:", error.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
