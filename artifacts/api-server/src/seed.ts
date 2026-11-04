import { createPool } from "@workspace/db";
import { hashPassword } from "./lib/auth.ts";
import { addDefaultSectionSubjects } from "./lib/section-subjects.ts";

if (process.env.NODE_ENV !== "development") {
  throw new Error("Development seeds are disabled outside NODE_ENV=development.");
}

const migratorUrl = process.env.MIGRATOR_DATABASE_URL;
if (!migratorUrl) throw new Error("MIGRATOR_DATABASE_URL is required to seed the development database.");

const migrator = createPool(migratorUrl);
const demoPasswordHash = await hashPassword("Passw0rd!");
let seededStudentCount = 0;
let seededTimetableSlotCount = 0;
let seededCalendarEventCount = 0;

const users: Array<{ email: string; name: string; role: string; kind: "student" | "teacher" | "parent" | "other" }> = [
  { email: "admin@demo.edu", name: "Aarav Nair", role: "org_admin", kind: "other" },
  { email: "teacher@demo.edu", name: "Ananya Rao", role: "teacher", kind: "teacher" },
  { email: "student1@demo.edu", name: "Student 001", role: "student", kind: "student" },
  { email: "parent@demo.edu", name: "Parent 001", role: "parent", kind: "parent" },
  { email: "hod@demo.edu", name: "Meera Iyer", role: "hod", kind: "teacher" },
  { email: "classteacher@demo.edu", name: "Rohan Das", role: "class_teacher", kind: "teacher" },
  { email: "superadmin@demo.edu", name: "Campus Operator", role: "super_admin", kind: "other" },
];

for (let index = 2; index <= 1860; index += 1) {
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
    await client.query(
      `INSERT INTO academic.academic_years (org_id, academic_year, status)
       SELECT $1, '2026-27',
              CASE WHEN EXISTS (
                SELECT 1 FROM academic.academic_years
                 WHERE org_id = $1 AND status = 'current'
              ) THEN 'completed' ELSE 'current' END
       ON CONFLICT (org_id, academic_year) DO NOTHING`,
      [orgId],
    );
    await client.query(
      `INSERT INTO academic.academic_years (org_id, academic_year, status)
       VALUES ($1, '2027-28', 'planned')
       ON CONFLICT (org_id, academic_year) DO NOTHING`,
      [orgId],
    );

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
      { code: null, name: "Hindi" },
      { code: null, name: "Computer Science" },
      { code: null, name: "Physical Education" },
      { code: null, name: "Arts" },
    ];
    const subjectIds: string[] = [];
    for (const subject of demoSubjects) {
      const result = await client.query<{ id: string; is_active: boolean }>(
        `INSERT INTO academic.subjects (org_id, code, name)
         VALUES ($1,$2,$3)
         ON CONFLICT (org_id, name) DO UPDATE
           SET code=COALESCE(EXCLUDED.code, academic.subjects.code), updated_at=now()
         RETURNING id, is_active`,
        [orgId, subject.code, subject.name],
      );
      if (!result.rows[0]?.id) throw new Error(`Could not seed ${subject.name}.`);
      if (result.rows[0].is_active) subjectIds.push(result.rows[0].id);
    }
    const allSectionIds = [...new Set([...sectionIds, ...gradeOneSectionIds.values()])];
    for (const sectionId of allSectionIds) {
      await addDefaultSectionSubjects(client, orgId, sectionId);
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

    const studentCount = await client.query<{ count: number }>(
      `SELECT COUNT(DISTINCT enrollment.student_user_id)::int AS count
         FROM academic.enrollments enrollment
         JOIN identity.user_roles role
           ON role.org_id = enrollment.org_id
          AND role.user_id = enrollment.student_user_id
        WHERE enrollment.org_id = $1
          AND enrollment.academic_year = '2026-27'
          AND enrollment.status = 'active'
          AND role.role = 'student'`,
      [orgId],
    );
    seededStudentCount = studentCount.rows[0]?.count ?? 0;

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

    const timetableTeacherIds = teacherUsers
      .map((teacher) => userIds.get(teacher.email))
      .filter((teacherId): teacherId is string => Boolean(teacherId));
    const schoolDays = [1, 2, 3, 4, 5];
    const periods = [
      { startTime: "08:00", endTime: "08:45" },
      { startTime: "08:50", endTime: "09:35" },
      { startTime: "09:45", endTime: "10:30" },
      { startTime: "10:50", endTime: "11:35" },
      { startTime: "11:40", endTime: "12:25" },
      { startTime: "13:00", endTime: "13:45" },
    ];
    const timetableRows: Array<{
      sectionId: string;
      subjectId: string;
      teacherId: string;
      weekday: number;
      startTime: string;
      endTime: string;
      room: string;
    }> = [];
    if (subjectIds.length && timetableTeacherIds.length) {
      allSectionIds.forEach((sectionId, sectionIndex) => {
        schoolDays.forEach((weekday, dayIndex) => {
          periods.forEach((period, periodIndex) => {
            timetableRows.push({
              sectionId,
              subjectId: subjectIds[(sectionIndex + dayIndex * periods.length + periodIndex) % subjectIds.length]!,
              teacherId: timetableTeacherIds[(sectionIndex + dayIndex + periodIndex) % timetableTeacherIds.length]!,
              weekday,
              startTime: period.startTime,
              endTime: period.endTime,
              room: `Room ${101 + sectionIndex}`,
            });
          });
        });
      });
    }

    const sectionTeacherAssignments = new Map<string, { sectionId: string; teacherId: string }>();
    const subjectTeacherAssignments = new Map<string, { sectionId: string; subjectId: string; teacherId: string }>();
    for (const slot of timetableRows) {
      sectionTeacherAssignments.set(`${slot.sectionId}:${slot.teacherId}`, {
        sectionId: slot.sectionId,
        teacherId: slot.teacherId,
      });
      subjectTeacherAssignments.set(`${slot.sectionId}:${slot.subjectId}:${slot.teacherId}`, {
        sectionId: slot.sectionId,
        subjectId: slot.subjectId,
        teacherId: slot.teacherId,
      });
    }

    const sectionTeacherRows = [...sectionTeacherAssignments.values()];
    if (sectionTeacherRows.length) {
      await client.query(
        `INSERT INTO academic.section_teachers (org_id, section_id, teacher_user_id, is_class_teacher)
         SELECT $1, assignment.section_id, assignment.teacher_id, false
           FROM unnest($2::uuid[], $3::uuid[]) AS assignment(section_id, teacher_id)
         ON CONFLICT (org_id, section_id, teacher_user_id) DO NOTHING`,
        [
          orgId,
          sectionTeacherRows.map((assignment) => assignment.sectionId),
          sectionTeacherRows.map((assignment) => assignment.teacherId),
        ],
      );
    }

    const subjectTeacherRows = [...subjectTeacherAssignments.values()];
    if (subjectTeacherRows.length) {
      await client.query(
        `INSERT INTO academic.teacher_assignments (org_id, section_id, subject_id, teacher_user_id, is_class_teacher)
         SELECT $1, assignment.section_id, assignment.subject_id, assignment.teacher_id, false
           FROM unnest($2::uuid[], $3::uuid[], $4::uuid[]) AS assignment(section_id, subject_id, teacher_id)
         ON CONFLICT (org_id, section_id, subject_id, teacher_user_id) DO NOTHING`,
        [
          orgId,
          subjectTeacherRows.map((assignment) => assignment.sectionId),
          subjectTeacherRows.map((assignment) => assignment.subjectId),
          subjectTeacherRows.map((assignment) => assignment.teacherId),
        ],
      );
    }

    if (timetableRows.length) {
      await client.query(
        `INSERT INTO academic.timetable_slots
           (org_id, section_id, subject_id, teacher_user_id, weekday, start_time, end_time, room)
         SELECT $1, slot.section_id, slot.subject_id, slot.teacher_id, slot.weekday,
                slot.start_time::time, slot.end_time::time, slot.room
           FROM unnest(
             $2::uuid[], $3::uuid[], $4::uuid[], $5::smallint[],
             $6::text[], $7::text[], $8::text[]
           ) AS slot(section_id, subject_id, teacher_id, weekday, start_time, end_time, room)
          WHERE NOT EXISTS (
            SELECT 1
              FROM academic.timetable_slots existing
             WHERE existing.org_id = $1
               AND existing.weekday = slot.weekday
               AND (existing.section_id = slot.section_id OR existing.teacher_user_id = slot.teacher_id)
               AND existing.start_time < slot.end_time::time
               AND existing.end_time > slot.start_time::time
          )`,
        [
          orgId,
          timetableRows.map((slot) => slot.sectionId),
          timetableRows.map((slot) => slot.subjectId),
          timetableRows.map((slot) => slot.teacherId),
          timetableRows.map((slot) => slot.weekday),
          timetableRows.map((slot) => slot.startTime),
          timetableRows.map((slot) => slot.endTime),
          timetableRows.map((slot) => slot.room),
        ],
      );
    }
    const timetableCount = await client.query<{ count: number }>(
      "SELECT COUNT(*)::int AS count FROM academic.timetable_slots WHERE org_id = $1 AND section_id = ANY($2::uuid[])",
      [orgId, allSectionIds],
    );
    seededTimetableSlotCount = timetableCount.rows[0]?.count ?? 0;

    const demoCalendarEvents = [
      {
        title: "Children's Day Celebration",
        kind: "event",
        startDate: "2026-11-14",
        endDate: "2026-11-14",
        description: "School-wide celebration and student activities.",
      },
      {
        title: "Winter Break",
        kind: "holiday",
        startDate: "2026-12-24",
        endDate: "2027-01-02",
        description: "School holiday period.",
      },
      {
        title: "School Reopens",
        kind: "working_day",
        startDate: "2027-01-04",
        endDate: "2027-01-04",
        description: "Classes resume after winter break.",
      },
      {
        title: "Republic Day",
        kind: "holiday",
        startDate: "2027-01-26",
        endDate: "2027-01-26",
        description: "Republic Day school holiday.",
      },
      {
        title: "Term 2 Examinations",
        kind: "exam",
        startDate: "2027-02-15",
        endDate: "2027-02-20",
        description: "School-wide Term 2 examination period.",
      },
      {
        title: "Annual Day",
        kind: "event",
        startDate: "2027-03-12",
        endDate: "2027-03-12",
        description: "Annual school celebration.",
      },
      {
        title: "Parent-Teacher Meeting",
        kind: "ptm",
        startDate: "2027-03-27",
        endDate: "2027-03-27",
        description: "School-wide parent-teacher meetings.",
      },
    ] as const;
    const calendarCreatorId = userIds.get("admin@demo.edu");
    if (calendarCreatorId) {
      for (const event of demoCalendarEvents) {
        await client.query(
          `INSERT INTO school.calendar_events
             (org_id, title, kind, start_date, end_date, scope, scope_id, description, created_by)
           SELECT $1, $2, $3, $4::date, $5::date, 'org', NULL, $6, $7
            WHERE NOT EXISTS (
              SELECT 1
                FROM school.calendar_events existing
               WHERE existing.org_id = $1 AND existing.scope = 'org'
                 AND existing.title = $2 AND existing.kind = $3
                 AND existing.start_date = $4::date AND existing.end_date = $5::date
            )`,
          [orgId, event.title, event.kind, event.startDate, event.endDate, event.description, calendarCreatorId],
        );
      }
    }
    const calendarCount = await client.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count
         FROM school.calendar_events
        WHERE org_id = $1 AND scope = 'org'
          AND start_date >= '2026-06-01'::date AND start_date <= '2027-03-31'::date`,
      [orgId],
    );
    seededCalendarEventCount = calendarCount.rows[0]?.count ?? 0;

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

  console.log(
    `Development demo seed ready: ${seededStudentCount} active student enrollments for 2026-27; `
    + `${seededTimetableSlotCount} timetable slots across seeded sections; `
    + `${seededCalendarEventCount} whole-school events in 2026-27.`
  );
} finally {
  await migrator.end();
}
