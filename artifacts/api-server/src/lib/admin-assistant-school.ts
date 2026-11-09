import {
  getCurrentAcademicYear,
  getIndiaDates,
  studentSuggestions,
  type AssistantAnswer,
  type AssistantDbClient,
} from "./admin-assistant-shared.ts";

export async function answerStudentCount(
  client: AssistantDbClient,
  orgId: string,
  classTerm: string | null,
  classBreakdown: boolean,
): Promise<AssistantAnswer> {
  const academicYear = await getCurrentAcademicYear(client, orgId);
  const rows = await client.query<{
    class_name: string;
    student_count: number;
    section_count: number;
  }>(
    `SELECT class.name AS class_name,
            COUNT(DISTINCT enrollment.student_user_id)::int AS student_count,
            COUNT(DISTINCT section.id)::int AS section_count
       FROM academic.enrollments enrollment
       JOIN academic.sections section
         ON section.org_id = enrollment.org_id AND section.id = enrollment.section_id
       JOIN academic.classes class
         ON class.org_id = section.org_id AND class.id = section.class_id
      WHERE enrollment.org_id = $1
        AND enrollment.academic_year = $2
        AND enrollment.status = 'active'
        AND ($3::text IS NULL OR class.name ILIKE '%' || $3 || '%')
      GROUP BY class.name, class.grade_level
      ORDER BY class.grade_level, class.name`,
    [orgId, academicYear, classTerm],
  );
  const total = rows.rows.reduce((sum, row) => sum + row.student_count, 0);
  const classContext = classTerm ? ` matching ${classTerm}` : "";
  const breakdownNote = classBreakdown && rows.rows.length > 12 ? " Showing counts for the first 12 classes." : "";
  return {
    answer: total
      ? `There are ${total.toLocaleString("en-IN")} active students${classContext} for ${academicYear}.${breakdownNote}`
      : `No active students were found${classContext} for ${academicYear}.`,
    topic: "students",
    sourceLabel: "Open student registry",
    sourceHref: "/admin/students",
    facts: [
      { label: "Active students", value: total.toLocaleString("en-IN") },
      { label: "Classes", value: String(rows.rows.length) },
      ...(classTerm && rows.rows.length === 1
        ? [{ label: "Sections", value: String(rows.rows[0]!.section_count) }]
        : []),
      ...(classBreakdown
        ? rows.rows.slice(0, 12).map((row) => ({
          label: row.class_name,
          value: `${row.student_count.toLocaleString("en-IN")} students`,
        }))
        : []),
    ],
    students: [],
    suggestedQuestions: studentSuggestions,
  };
}

export async function answerStudentLookup(
  client: AssistantDbClient,
  orgId: string,
  term: string,
): Promise<AssistantAnswer> {
  if (term.trim().length < 2) {
    return {
      answer: "Include the student’s name or admission number in your question, for example “Find student A Nair”.",
      topic: "students",
      sourceLabel: "Open student registry",
      sourceHref: "/admin/students",
      facts: [],
      students: [],
      suggestedQuestions: studentSuggestions,
    };
  }
  const academicYear = await getCurrentAcademicYear(client, orgId);
  const escapedTerm = term.replace(/[!%_]/g, (character) => `!${character}`);
  const rows = await client.query<{
    name: string;
    admission_no: string;
    class_name: string;
    section_name: string;
  }>(
    `SELECT student.name, enrollment.admission_no,
            class.name AS class_name, section.name AS section_name
       FROM academic.enrollments enrollment
       JOIN identity.users student
         ON student.org_id = enrollment.org_id AND student.id = enrollment.student_user_id
       JOIN academic.sections section
         ON section.org_id = enrollment.org_id AND section.id = enrollment.section_id
       JOIN academic.classes class
         ON class.org_id = section.org_id AND class.id = section.class_id
      WHERE enrollment.org_id = $1
        AND enrollment.academic_year = $2
        AND enrollment.status = 'active'
        AND (
          student.name ILIKE '%' || $3 || '%' ESCAPE '!'
          OR enrollment.admission_no ILIKE '%' || $3 || '%' ESCAPE '!'
        )
      ORDER BY CASE WHEN lower(enrollment.admission_no) = lower($3) THEN 0 ELSE 1 END,
               student.name
      LIMIT 10`,
    [orgId, academicYear, escapedTerm],
  );
  return {
    answer: rows.rowCount
      ? `Here are up to 10 active students matching “${term}” in ${academicYear}.`
      : `I couldn't find an active student matching “${term}” in ${academicYear}.`,
    topic: "students",
    sourceLabel: "Open student registry",
    sourceHref: "/admin/students",
    facts: [{ label: "Academic year", value: academicYear }],
    students: rows.rows.map((row) => ({
      name: row.name,
      admissionNo: row.admission_no,
      className: row.class_name,
      sectionName: row.section_name,
      outstandingPaise: null,
    })),
    suggestedQuestions: studentSuggestions,
  };
}

export async function answerAttendanceToday(
  client: AssistantDbClient,
  orgId: string,
): Promise<AssistantAnswer> {
  const dates = await getIndiaDates(client);
  const result = await client.query<{
    marked: number;
    counted: number;
    present: number;
    absent: number;
    late: number;
    leave_count: number;
  }>(
    `SELECT COUNT(mark.id)::int AS marked,
            COUNT(*) FILTER (WHERE mark.status IN ('present', 'absent', 'late'))::int AS counted,
            COUNT(*) FILTER (WHERE mark.status IN ('present', 'late'))::int AS present,
            COUNT(*) FILTER (WHERE mark.status = 'absent')::int AS absent,
            COUNT(*) FILTER (WHERE mark.status = 'late')::int AS late,
            COUNT(*) FILTER (WHERE mark.status = 'leave')::int AS leave_count
       FROM school.attendance_sessions session
       JOIN school.attendance_marks mark
         ON mark.org_id = session.org_id AND mark.session_id = session.id
      WHERE session.org_id = $1
        AND session.attendance_date = $2::date
        AND session.period IS NULL`,
    [orgId, dates.today],
  );
  const attendance = result.rows[0]!;
  const percent = attendance.counted
    ? `${((attendance.present / attendance.counted) * 100).toFixed(1)}%`
    : "Not recorded";
  return {
    answer: attendance.marked
      ? `Today's register has ${attendance.marked} students marked; ${attendance.present} are present or late (${percent}).`
      : "Attendance has not been recorded for today yet.",
    topic: "attendance",
    sourceLabel: "Open attendance",
    sourceHref: "/attendance",
    facts: [
      { label: "Date", value: dates.today },
      { label: "Marked", value: String(attendance.marked) },
      { label: "Present or late", value: String(attendance.present) },
      { label: "Absent", value: String(attendance.absent) },
      { label: "Late", value: String(attendance.late) },
      { label: "Leave", value: String(attendance.leave_count) },
      { label: "Attendance rate", value: percent },
    ],
    students: [],
    suggestedQuestions: studentSuggestions,
  };
}
