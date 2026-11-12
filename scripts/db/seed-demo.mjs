#!/usr/bin/env node
/**
 * Demo data seeder for the Campus Live single deployment.
 * Creates Supabase auth users + identity/academic rows + one live session
 * for the organization owned by admin@myschooldays.school.
 *
 * Run from the repo root with the root .env loaded:
 *   set -a; . ./.env; set +a; node scripts/db/seed-demo.mjs
 * Idempotent: re-running upserts and skips existing auth users.
 */
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import pg from "pg";

const env = process.env;
const SUPABASE_URL = env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = env.SUPABASE_SECRET_KEY;
const MIGRATOR_URL = (env.MIGRATOR_DATABASE_URL ?? "").replace(/([?&])sslmode=[^&]*/, "");
const ADMIN_EMAIL = "admin@myschooldays.school";

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY || !MIGRATOR_URL) {
  console.error("SUPABASE_URL, SUPABASE_SECRET_KEY and MIGRATOR_DATABASE_URL are required.");
  process.exit(1);
}

const adminApi = (path, init = {}) =>
  fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      apikey: SUPABASE_SECRET_KEY,
      authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
      ...(init.headers ?? {}),
    },
  });

let authUserCache = null;
async function listAllAuthUsers() {
  if (authUserCache) return authUserCache;
  const users = [];
  let page = 1;
  while (true) {
    const body = await adminApi(`/auth/v1/admin/users?per_page=100&page=${page}`).then((r) => r.json());
    if (!body.users?.length) break;
    users.push(...body.users);
    if (body.users.length < 100) break;
    page += 1;
  }
  authUserCache = users;
  return users;
}

async function ensureSupabaseUser(email, password) {
  // The GoTrue admin list endpoint ignores the email filter for addresses
  // containing '@', so page through users and match client-side.
  const existing = (await listAllAuthUsers()).find(
    (user) => user.email?.toLowerCase() === email.toLowerCase(),
  );
  if (existing) return existing.id;
  const created = await adminApi("/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({ email, password, email_confirm: true }),
  }).then((r) => r.json());
  if (!created.id) throw new Error(`could not create Supabase user ${email}: ${JSON.stringify(created)}`);
  authUserCache?.push(created);
  return created.id;
}

const DEMO_PASSWORD = "Campus@Demo2026";

const people = {
  teacher1: { email: "meera@myschooldays.school", name: "Meera Krishnan", role: "teacher" },
  teacher2: { email: "arjun@myschooldays.school", name: "Arjun Rao", role: "teacher" },
  admin2: { email: "priya.admin@myschooldays.school", name: "Priya Subramaniam", role: "org_admin" },
  hod1: { email: "ramesh@myschooldays.school", name: "Ramesh Iyer", role: "hod" },
  students: [
    { email: "aadhya.s@myschooldays.school", name: "Aadhya Sharma", grade: 5, section: "A", guardian: "sunita.parent@myschooldays.school|Sunita Sharma" },
    { email: "vihaan.p@myschooldays.school", name: "Vihaan Patel", grade: 5, section: "A", guardian: "anita.parent@myschooldays.school|Anita Patel" },
    { email: "diya.m@myschooldays.school", name: "Diya Menon", grade: 5, section: "A", guardian: "sunita.parent@myschooldays.school|Sunita Sharma" },
    { email: "kabir.s@myschooldays.school", name: "Kabir Singh", grade: 6, section: "A", guardian: "gurpreet.parent@myschooldays.school|Gurpreet Kaur" },
    { email: "ananya.r@myschooldays.school", name: "Ananya Reddy", grade: 6, section: "A", guardian: "lakshmi.parent@myschooldays.school|Lakshmi Reddy" },
    { email: "ishaan.k@myschooldays.school", name: "Ishaan Kumar", grade: 6, section: "B", guardian: "gurpreet.parent@myschooldays.school|Gurpreet Kaur" },
    { email: "sara.t@myschooldays.school", name: "Sara Thomas", grade: 7, section: "A", guardian: "farah.parent@myschooldays.school|Farah Thomas" },
    { email: "advait.n@myschooldays.school", name: "Advait Nair", grade: 7, section: "A", guardian: "farah.parent@myschooldays.school|Farah Thomas" },
  ],
};

const pool = new pg.Pool({ connectionString: MIGRATOR_URL, ssl: { rejectUnauthorized: false } });
const client = await pool.connect();

try {
  await client.query("BEGIN");
  const org = await client.query("SELECT id, slug FROM identity.organizations WHERE slug = 'my-school-days' FOR UPDATE");
  if (!org.rows[0]) throw new Error("Organization my-school-days not found.");
  const orgId = org.rows[0].id;
  await client.query("SELECT set_config('app.org_id', $1, true)", [orgId]);
  console.log("org:", orgId);

  const upsertUser = async (email, name, supabaseId, role) => {
    const existing = await client.query("SELECT id FROM identity.users WHERE org_id = $1 AND lower(email) = lower($2)", [orgId, email]);
    let userId = existing.rows[0]?.id;
    if (!userId) {
      const inserted = await client.query(
        "INSERT INTO identity.users (org_id, email, name, supabase_user_id, status) VALUES ($1, $2, $3, $4, 'active') RETURNING id",
        [orgId, email, name, supabaseId],
      );
      userId = inserted.rows[0].id;
    } else {
      await client.query("UPDATE identity.users SET supabase_user_id = $3, status = 'active', name = $2 WHERE id = $1", [userId, name, supabaseId]);
    }
    await client.query(
      "INSERT INTO identity.user_roles (org_id, user_id, role) VALUES ($1, $2, $3) ON CONFLICT (org_id, user_id, role) DO NOTHING",
      [orgId, userId, role],
    );
    return userId;
  };

  // academic years
  await client.query(
    `INSERT INTO academic.academic_years (org_id, academic_year, status) VALUES ($1, '2026-27', 'current')
     ON CONFLICT (org_id, academic_year) DO NOTHING`,
    [orgId],
  );
  await client.query(
    `INSERT INTO academic.academic_years (org_id, academic_year, status) VALUES ($1, '2027-28', 'planned')
     ON CONFLICT (org_id, academic_year) DO NOTHING`,
    [orgId],
  );

  // classes + sections (grades 5-7, A/B)
  const sectionIds = {};
  for (const grade of [5, 6, 7]) {
    const cls = await client.query(
      `INSERT INTO academic.classes (org_id, name, grade_level) VALUES ($1, $2, $3)
       ON CONFLICT (org_id, name) DO UPDATE SET grade_level = EXCLUDED.grade_level RETURNING id`,
      [orgId, `Grade ${grade}`, grade],
    );
    const classId = cls.rows[0].id;
    for (const sectionName of ["A", "B"]) {
      const sec = await client.query(
        `INSERT INTO academic.sections (org_id, class_id, name, capacity) VALUES ($1, $2, $3, 40)
         ON CONFLICT DO NOTHING RETURNING id`,
        [orgId, classId, sectionName],
      );
      if (sec.rows[0]) sectionIds[`${grade}${sectionName}`] = sec.rows[0].id;
      if (!sec.rows[0]) {
        const found = await client.query(
          "SELECT s.id FROM academic.sections s JOIN academic.classes c ON c.org_id = s.org_id AND c.id = s.class_id WHERE s.org_id = $1 AND c.grade_level = $2 AND s.name = $3",
          [orgId, grade, sectionName],
        );
        sectionIds[`${grade}${sectionName}`] = found.rows[0]?.id;
      }
    }
  }
  console.log("classes/sections:", Object.keys(sectionIds).join(","));

  // staff
  const teacher1Id = await upsertUser(people.teacher1.email, people.teacher1.name, await ensureSupabaseUser(people.teacher1.email, DEMO_PASSWORD), "teacher");
  const teacher2Id = await upsertUser(people.teacher2.email, people.teacher2.name, await ensureSupabaseUser(people.teacher2.email, DEMO_PASSWORD), "teacher");
  await upsertUser(people.admin2.email, people.admin2.name, await ensureSupabaseUser(people.admin2.email, DEMO_PASSWORD), "org_admin");
  await upsertUser(people.hod1.email, people.hod1.name, await ensureSupabaseUser(people.hod1.email, DEMO_PASSWORD), "hod");

  // teacher assignments
  for (const key of ["5A", "6A", "7A"]) {
    if (sectionIds[key]) {
      await client.query(
        `INSERT INTO academic.section_teachers (org_id, section_id, teacher_user_id) VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING`,
        [orgId, sectionIds[key], teacher1Id],
      );
    }
  }
  for (const key of ["5B", "6B", "7B"]) {
    if (sectionIds[key]) {
      await client.query(
        `INSERT INTO academic.section_teachers (org_id, section_id, teacher_user_id) VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING`,
        [orgId, sectionIds[key], teacher2Id],
      );
    }
  }

  // parents (unique guardians)
  const guardianIds = {};
  for (const student of people.students) {
    const [gEmail, gName] = student.guardian.split("|");
    if (!guardianIds[gEmail]) {
      guardianIds[gEmail] = await upsertUser(gEmail, gName, await ensureSupabaseUser(gEmail, DEMO_PASSWORD), "parent");
    }
  }

  // students + enrollments + guardian links + profiles
  let admissionSeq = 1;
  for (const student of people.students) {
    const supabaseId = await ensureSupabaseUser(student.email, DEMO_PASSWORD);
    const studentId = await upsertUser(student.email, student.name, supabaseId, "student");
    const sectionId = sectionIds[`${student.grade}${student.section}`];
    const admissionNo = `MSD-2026-${String(admissionSeq++).padStart(4, "0")}`;
    await client.query(
      `INSERT INTO academic.enrollments (org_id, student_user_id, section_id, admission_no, academic_year, status)
       VALUES ($1, $2, $3, $4, '2026-27', 'active') ON CONFLICT DO NOTHING`,
      [orgId, studentId, sectionId, admissionNo],
    );
    const [gEmail] = student.guardian.split("|");
    await client.query(
      `INSERT INTO identity.guardian_links (org_id, guardian_user_id, student_user_id, relationship)
       VALUES ($1, $2, $3, 'guardian') ON CONFLICT (org_id, guardian_user_id, student_user_id) DO NOTHING`,
      [orgId, guardianIds[gEmail], studentId],
    );
    await client.query(
      `INSERT INTO identity.profiles (org_id, user_id, date_of_birth, gender)
       VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
      [orgId, studentId, `20${String(26 - student.grade - 5).padStart(2, "0")}-0${(admissionSeq % 8) + 1}-1${admissionSeq % 9}`, "unspecified"],
    );
  }

  // one scheduled live class for tomorrow morning (board works without LiveKit)
  await client.query(
    `INSERT INTO live.sessions (org_id, title, teacher_user_id, mode, status, starts_at, parent_view)
     SELECT $1, 'Grade 5A · Morning Assembly & Maths', $2, 'section', 'scheduled', (current_date + interval '1 day' + interval '9 hour'), false
     WHERE NOT EXISTS (SELECT 1 FROM live.sessions WHERE org_id = $1 AND title LIKE 'Grade 5A · Morning%')`,
    [orgId, teacher1Id],
  );
  const section5A = sectionIds["5A"];
  await client.query(
    `INSERT INTO live.session_sections (org_id, session_id, section_id)
     SELECT $1, s.id, $2 FROM live.sessions s
      WHERE s.org_id = $1 AND s.title LIKE 'Grade 5A · Morning%'
        AND NOT EXISTS (SELECT 1 FROM live.session_sections ss WHERE ss.org_id = $1 AND ss.session_id = s.id AND ss.section_id = $2)`,
    [orgId, section5A],
  );

  // a welcome announcement
  await client.query(
    `INSERT INTO school.announcements (org_id, created_by, title, body, audience, priority, published_at)
     SELECT $1, $2, 'Welcome to My School Days', 'School is now live on Campus. Explore classes, attendance, learning and live sessions from your dashboard.', 'school', 'normal', now()
      WHERE NOT EXISTS (SELECT 1 FROM school.announcements WHERE org_id = $1 AND title = 'Welcome to My School Days')`,
    [orgId, teacher1Id],
  );

  await client.query("COMMIT");
  console.log("seeded OK");
  console.log(`demo password for every account below: ${DEMO_PASSWORD}`);
  console.log(JSON.stringify({
    organization: "my-school-days",
    admin: ADMIN_EMAIL,
    staff: [people.teacher1, people.teacher2, people.admin2, people.hod1],
    students: people.students.map((s) => ({ email: s.email, name: s.name, class: `Grade ${s.grade}${s.section}` })),
    parents: Object.keys(guardianIds),
  }, null, 2));
} catch (error) {
  await client.query("ROLLBACK");
  console.error("SEED FAILED:", error.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
