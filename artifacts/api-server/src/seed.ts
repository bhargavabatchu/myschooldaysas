import { createPool } from "@workspace/db";
import { hashPassword } from "./lib/auth.ts";

if (process.env.NODE_ENV !== "development") {
  throw new Error("Development seeds are disabled outside NODE_ENV=development.");
}

const migratorUrl = process.env.MIGRATOR_DATABASE_URL;
if (!migratorUrl) throw new Error("MIGRATOR_DATABASE_URL is required to seed the development database.");

const migrator = createPool(migratorUrl);
const demoPasswordHash = await hashPassword("Passw0rd!");

const users: Array<{ email: string; name: string; role: string; kind: "student" | "teacher" | "parent" | "other" }> = [
  { email: "admin@demo.edu", name: "Aarav Nair", role: "org_admin", kind: "other" },
  { email: "teacher@demo.edu", name: "Ananya Rao", role: "teacher", kind: "teacher" },
  { email: "student1@demo.edu", name: "Student 001", role: "student", kind: "student" },
  { email: "parent@demo.edu", name: "Parent 001", role: "parent", kind: "parent" },
  { email: "hod@demo.edu", name: "Meera Iyer", role: "hod", kind: "teacher" },
  { email: "classteacher@demo.edu", name: "Rohan Das", role: "class_teacher", kind: "teacher" },
  { email: "superadmin@demo.edu", name: "Campus Operator", role: "super_admin", kind: "other" },
];

for (let index = 2; index <= 240; index += 1) {
  users.push({
    email: `student${String(index).padStart(3, "0")}@demo.edu`,
    name: `Student ${String(index).padStart(3, "0")}`,
    role: "student",
    kind: "student",
  });
}
for (let index = 2; index <= 33; index += 1) {
  users.push({
    email: `teacher${String(index).padStart(3, "0")}@demo.edu`,
    name: `Teacher ${String(index).padStart(3, "0")}`,
    role: "teacher",
    kind: "teacher",
  });
}
for (let index = 2; index <= 130; index += 1) {
  users.push({
    email: `parent${String(index).padStart(3, "0")}@demo.edu`,
    name: `Parent ${String(index).padStart(3, "0")}`,
    role: "parent",
    kind: "parent",
  });
}

const boardConfig = {
  background: { type: "ruled", color: "#fffdf8", lineColor: "#dce5e2", spacing: 32 },
  canvas: { mode: "fixed", aspect: "16:9", maxPages: 20 },
  tools: ["select", "pen", "highlighter", "eraser", "line", "arrow", "rect", "ellipse", "text", "sticky"],
  defaultTool: "pen",
  palette: ["#173e38", "#2e8b70", "#dc8b43", "#b94f47", "#596f9c"],
  penSizes: [2, 4, 8, 14],
  toolbar: { position: "left", size: "regular", autoHide: false },
  participants: {
    studentsCanView: true,
    studentsCanDraw: false,
    allowDrawGrants: true,
    studentTools: ["pen"],
    followTeacherPage: true,
  },
  features: {
    pressureSensitivity: false,
    palmRejection: true,
    shapeRecognition: true,
    undoRedo: true,
    snapshotIntervalSec: 30,
    exportFormats: ["png", "pdf"],
  },
};

try {
  const orgResult = await migrator.query<{ id: string }>(
    `INSERT INTO identity.organizations (name, slug)
     VALUES ('Demo School', 'demo')
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
  );
  const orgId = orgResult.rows[0]?.id;
  if (!orgId) throw new Error("Could not create the demo organization.");

  const client = await migrator.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.org_id', $1, true)", [orgId]);

    const userIds = new Map<string, string>();
    for (const user of users) {
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO identity.users (org_id, email, name, password_hash)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (org_id, email) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [orgId, user.email, user.name, demoPasswordHash],
      );
      const id = inserted.rows[0]?.id;
      if (!id) throw new Error(`Could not seed user ${user.email}.`);
      userIds.set(user.email, id);
      await client.query(
        `INSERT INTO identity.user_roles (org_id, user_id, role)
         VALUES ($1, $2, $3)
         ON CONFLICT (org_id, user_id, role) DO NOTHING`,
        [orgId, id, user.role],
      );
    }

    const classIds: string[] = [];
    const sectionIds: string[] = [];
    const gradeOneSectionIds = new Map<string, string>();
    for (let grade = 1; grade <= 12; grade += 1) {
      const classResult = await client.query<{ id: string; is_active: boolean }>(
        `INSERT INTO academic.classes (org_id, name, grade_level)
         VALUES ($1, $2, $3)
         ON CONFLICT (org_id, name) DO UPDATE SET grade_level = EXCLUDED.grade_level
         RETURNING id, is_active`,
        [orgId, `Grade ${grade}`, grade],
      );
      const classRow = classResult.rows[0];
      const classId = classRow?.id;
      if (!classId) throw new Error(`Could not seed Grade ${grade}.`);
      if (grade === 1 && !classRow.is_active) {
        throw new Error("Cannot seed Grade 1 demo students into an archived class.");
      }
      classIds.push(classId);
      const sectionNames = grade === 1 ? ["A", "B", "C", "D", "E"] : ["A", "B"];
      for (const sectionName of sectionNames) {
        const sectionResult = await client.query<{ id: string; is_active: boolean }>(
          `INSERT INTO academic.sections (org_id, class_id, name)
           VALUES ($1, $2, $3)
           ON CONFLICT (org_id, class_id, name) DO NOTHING
           RETURNING id, is_active`,
          [orgId, classId, sectionName],
        );
        let section = sectionResult.rows[0];
        if (!section) {
          const found = await client.query<{ id: string; is_active: boolean }>(
            "SELECT id, is_active FROM academic.sections WHERE org_id = $1 AND class_id = $2 AND name = $3",
            [orgId, classId, sectionName],
          );
          section = found.rows[0];
        }
        if (!section) throw new Error(`Could not seed Grade ${grade} ${sectionName}.`);
        if (grade === 1 && !section.is_active) {
          throw new Error(`Cannot seed demo students into archived Grade 1 ${sectionName}.`);
        }
        if (grade === 1) gradeOneSectionIds.set(sectionName, section.id);
        // Keep the original 24-section distribution for all baseline demo students.
        if (grade !== 1 || sectionName === "A" || sectionName === "B") sectionIds.push(section.id);
      }
    }

    const demoSubjects = [
      { code: "ENG", name: "English" },
      { code: "MATH", name: "Mathematics" },
      { code: "SCI", name: "Science" },
      { code: "SOC", name: "Social Studies" },
    ];
    const subjectIds: string[] = [];
    for (const subject of demoSubjects) {
      const result = await client.query<{ id: string }>(
        `INSERT INTO academic.subjects (org_id, code, name)
         VALUES ($1,$2,$3)
         ON CONFLICT (org_id, name) DO UPDATE SET code=EXCLUDED.code, is_active=true, updated_at=now()
         RETURNING id`,
        [orgId, subject.code, subject.name],
      );
      if (!result.rows[0]?.id) throw new Error(`Could not seed ${subject.name}.`);
      subjectIds.push(result.rows[0].id);
    }

    const studentUsers = users.filter((user) => user.kind === "student");
    const teacherUsers = users.filter((user) => user.kind === "teacher");
    const parentUsers = users.filter((user) => user.kind === "parent");

    for (let index = 0; index < studentUsers.length; index += 1) {
      const student = studentUsers[index]!;
      const sectionId = sectionIds[index % sectionIds.length]!;
      await client.query(
        `INSERT INTO academic.enrollments
           (org_id, student_user_id, section_id, admission_no, academic_year)
         VALUES ($1, $2, $3, $4, '2026-27')
         ON CONFLICT (org_id, student_user_id, academic_year) WHERE status = 'active' DO UPDATE
           SET section_id = EXCLUDED.section_id`,
        [orgId, userIds.get(student.email), sectionId, `ADM2026${String(index + 1).padStart(3, "0")}`],
      );
    }

    for (const sectionName of ["A", "B", "C", "D", "E"]) {
      const sectionId = gradeOneSectionIds.get(sectionName);
      if (!sectionId) throw new Error(`Grade 1 ${sectionName} is missing from the demo seed.`);
      const enrolled = await client.query<{ count: number }>(
        `SELECT COUNT(DISTINCT student_user_id)::int AS count
           FROM academic.enrollments
          WHERE org_id = $1 AND section_id = $2
            AND academic_year = '2026-27' AND status = 'active'`,
        [orgId, sectionId],
      );
      let count = enrolled.rows[0]?.count ?? 0;
      let slot = count + 1;
      while (count < 40) {
        const suffix = String(slot).padStart(3, "0");
        const email = `grade1-${sectionName.toLowerCase()}-${suffix}@demo.edu`;
        const name = `Grade 1 ${sectionName} Student ${suffix}`;
        const studentResult = await client.query<{ id: string }>(
          `INSERT INTO identity.users (org_id, email, name, password_hash)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (org_id, email) DO UPDATE SET name = EXCLUDED.name
           RETURNING id`,
          [orgId, email, name, demoPasswordHash],
        );
        const studentId = studentResult.rows[0]?.id;
        if (!studentId) throw new Error(`Could not seed demo student ${email}.`);
        await client.query(
          `INSERT INTO identity.user_roles (org_id, user_id, role)
           VALUES ($1, $2, 'student')
           ON CONFLICT (org_id, user_id, role) DO NOTHING`,
          [orgId, studentId],
        );
        await client.query(
          `INSERT INTO academic.enrollments
             (org_id, student_user_id, section_id, admission_no, academic_year)
           VALUES ($1, $2, $3, $4, '2026-27')
           ON CONFLICT (org_id, student_user_id, academic_year) WHERE status = 'active'
           DO UPDATE SET section_id = EXCLUDED.section_id`,
          [orgId, studentId, sectionId, `DEMO-G1-${sectionName}-${suffix}`],
        );
        count += 1;
        slot += 1;
      }
    }

    for (let index = 0; index < teacherUsers.length; index += 1) {
      const teacher = teacherUsers[index]!;
      const assignedSection = sectionIds[index % sectionIds.length]!;
      const teacherId = userIds.get(teacher.email);
      if (!teacherId) continue;
      await client.query(
        `INSERT INTO academic.section_teachers (org_id, section_id, teacher_user_id, is_class_teacher)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (org_id, section_id, teacher_user_id) DO UPDATE
           SET is_class_teacher = EXCLUDED.is_class_teacher`,
        [orgId, assignedSection, teacherId, teacher.role === "class_teacher"],
      );
      for (const subjectId of subjectIds) {
        await client.query(
          `INSERT INTO academic.teacher_assignments (org_id, section_id, subject_id, teacher_user_id, is_class_teacher)
           VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (org_id, section_id, subject_id, teacher_user_id)
           DO UPDATE SET is_class_teacher=EXCLUDED.is_class_teacher`,
          [orgId, assignedSection, subjectId, teacherId, teacher.role === "class_teacher"],
        );
      }
    }
    const hodId = userIds.get("hod@demo.edu");
    if (hodId) {
      for (const sectionId of sectionIds) {
        await client.query(
          `INSERT INTO academic.section_teachers (org_id, section_id, teacher_user_id, is_class_teacher)
           VALUES ($1, $2, $3, false)
           ON CONFLICT (org_id, section_id, teacher_user_id) DO NOTHING`,
          [orgId, sectionId, hodId],
        );
        for (const subjectId of subjectIds) {
          await client.query(
            `INSERT INTO academic.teacher_assignments (org_id, section_id, subject_id, teacher_user_id, is_class_teacher)
             VALUES ($1,$2,$3,$4,false)
             ON CONFLICT (org_id, section_id, subject_id, teacher_user_id) DO NOTHING`,
            [orgId, sectionId, subjectId, hodId],
          );
        }
      }
    }

    const studentsByEmail = studentUsers.map((student) => userIds.get(student.email)).filter(Boolean) as string[];
    for (let index = 0; index < parentUsers.length; index += 1) {
      const parent = parentUsers[index]!;
      const guardianId = userIds.get(parent.email);
      const studentId = studentsByEmail[index % studentsByEmail.length];
      if (!guardianId || !studentId) continue;
      await client.query(
        `INSERT INTO identity.guardian_links (org_id, guardian_user_id, student_user_id, relationship)
         VALUES ($1, $2, $3, 'parent')
         ON CONFLICT (org_id, guardian_user_id, student_user_id) DO NOTHING`,
        [orgId, guardianId, studentId],
      );
    }

    const primaryTeacherId = userIds.get("teacher@demo.edu");
    const boardConfigJson = JSON.stringify(boardConfig);
    await client.query(
      `INSERT INTO board.templates (org_id, owner_user_id, name, scope, config, is_default)
       SELECT $1, NULL, 'School default', 'org', $2::jsonb, true
        WHERE NOT EXISTS (
          SELECT 1 FROM board.templates existing
           WHERE existing.org_id = $1 AND existing.is_default = true
        )
       ON CONFLICT (org_id, name) DO NOTHING`,
      [orgId, boardConfigJson],
    );

    if (primaryTeacherId) {
      for (const [title, offsetDays] of [
        ["Fractions: equivalent values", 1],
        ["Plants and their parts", 2],
        ["Reading circle: short stories", 3],
      ] as const) {
        const session = await client.query<{ id: string }>(
          `INSERT INTO live.sessions (org_id, title, teacher_user_id, mode, starts_at, parent_view)
           SELECT $1, $2, $3, 'section', now() + ($4 || ' days')::interval, true
            WHERE NOT EXISTS (
              SELECT 1 FROM live.sessions existing
               WHERE existing.org_id = $1 AND existing.title = $2
                 AND existing.teacher_user_id = $3
            )
           RETURNING id`,
          [orgId, title, primaryTeacherId, offsetDays],
        );
        let sessionId = session.rows[0]?.id;
        if (!sessionId) {
          const existing = await client.query<{ id: string }>(
            `SELECT id FROM live.sessions
              WHERE org_id = $1 AND title = $2 AND teacher_user_id = $3
              ORDER BY created_at LIMIT 1`,
            [orgId, title, primaryTeacherId],
          );
          sessionId = existing.rows[0]?.id;
        }
        if (sessionId) {
          await client.query(
            `INSERT INTO live.session_sections (org_id, session_id, section_id)
             VALUES ($1, $2, $3)
             ON CONFLICT (org_id, session_id, section_id) DO NOTHING`,
            [orgId, sessionId, sectionIds[0]],
          );
        }
      }
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }

  console.log(`Seeded ${users.length} baseline development users; Grade 1 sections A–E now have at least 40 students each.`);
} finally {
  await migrator.end();
}
