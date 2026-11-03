import type { PoolClient } from "pg";

export const DEFAULT_COMMON_SUBJECTS = [
  "English",
  "Mathematics",
  "Science",
  "Social Studies",
  "Hindi",
  "Computer Science",
  "Physical Education",
  "Arts",
] as const;

export async function addDefaultSectionSubjects(
  client: PoolClient,
  orgId: string,
  sectionId: string,
) {
  for (const name of DEFAULT_COMMON_SUBJECTS) {
    await client.query(
      `INSERT INTO academic.subjects (org_id, name)
       VALUES ($1, $2)
       ON CONFLICT (org_id, name) DO NOTHING`,
      [orgId, name],
    );
  }

  await client.query(
    `INSERT INTO academic.section_subjects (org_id, section_id, subject_id)
     SELECT $1, $2, subject.id
       FROM academic.subjects subject
      WHERE subject.org_id = $1
        AND subject.name = ANY($3::text[])
        AND subject.is_active = true
     ON CONFLICT (org_id, section_id, subject_id) DO NOTHING`,
    [orgId, sectionId, [...DEFAULT_COMMON_SUBJECTS]],
  );
}
