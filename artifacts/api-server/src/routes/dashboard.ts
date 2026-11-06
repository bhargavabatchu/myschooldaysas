import type { FastifyPluginAsync } from "fastify";
import { withOrg } from "@workspace/db";
import { createRouteRegistrar } from "../lib/fastify-routes";
import { requireAuth, type CampusRole } from "../lib/auth";
import { summarizeFeeCollections } from "../lib/fee-collection-policy";

const routes: FastifyPluginAsync = async (fastify) => {
const router = createRouteRegistrar(fastify);
const adminRoles: CampusRole[] = ["super_admin", "org_admin", "campus_admin"];
const teacherRoles: CampusRole[] = ["teacher", "class_teacher", "hod"];

function errorBody(code: string, message: string) {
  return { error: { code, message } };
}

router.get("/dashboard/overview", requireAuth, async (req, res, next) => {
  const user = req.campusUser;
  if (!user) return void res.status(401).json(errorBody("UNAUTHENTICATED", "Sign in to continue."));
  const rawAcademicYear = (req.query as { academicYear?: unknown }).academicYear;
  if (
    rawAcademicYear !== undefined &&
    (typeof rawAcademicYear !== "string" || rawAcademicYear.trim().length < 4 || rawAcademicYear.trim().length > 24)
  ) {
    return void res.status(400).json(errorBody("INVALID_ACADEMIC_YEAR", "Choose a valid academic year."));
  }
  const requestedAcademicYear = typeof rawAcademicYear === "string" ? rawAcademicYear.trim() || undefined : undefined;

  const isAdmin = user.roles.some((role) => adminRoles.includes(role));
  const isTeacher = user.roles.some((role) => teacherRoles.includes(role));
  const isStudent = user.roles.includes("student");
  const isParent = user.roles.includes("parent");

  try {
    const dashboard = await withOrg(user.orgId, async (client) => {
      if (isAdmin && requestedAcademicYear) {
        const configuredYear = await client.query(
          "SELECT 1 FROM academic.academic_years WHERE org_id = $1 AND academic_year = $2",
          [user.orgId, requestedAcademicYear],
        );
        if (!configuredYear.rowCount) return { invalidAcademicYear: true as const };
      }

      const stats = await client.query<{
        students: number;
        classes: number;
        sections: number;
        teachers: number;
      }>(
        `WITH visible_sections AS (
           SELECT s.id, s.class_id
             FROM academic.sections s
            WHERE s.org_id = $1
              AND (
                $2::boolean
                OR ($3::boolean AND EXISTS (
                  SELECT 1 FROM academic.section_teachers st
                   WHERE st.org_id = s.org_id AND st.section_id = s.id
                     AND st.teacher_user_id = $4
                ))
                OR ($5::boolean AND EXISTS (
                  SELECT 1 FROM academic.enrollments mine
                   WHERE mine.org_id = s.org_id AND mine.section_id = s.id
                     AND mine.student_user_id = $4 AND mine.status = 'active'
                ))
                OR ($6::boolean AND EXISTS (
                  SELECT 1 FROM academic.enrollments child
                  JOIN identity.guardian_links gl
                    ON gl.org_id = child.org_id AND gl.student_user_id = child.student_user_id
                   WHERE child.org_id = s.org_id AND child.section_id = s.id
                     AND gl.guardian_user_id = $4 AND gl.can_view_live = true AND child.status = 'active'
                ))
              )
         )
         SELECT
           (SELECT COUNT(DISTINCT e.student_user_id)::int
              FROM academic.enrollments e
              JOIN visible_sections vs ON vs.id = e.section_id
             WHERE e.org_id = $1 AND e.status = 'active') AS students,
           (SELECT COUNT(DISTINCT vs.class_id)::int FROM visible_sections vs) AS classes,
           (SELECT COUNT(*)::int FROM visible_sections) AS sections,
           (SELECT COUNT(DISTINCT st.teacher_user_id)::int
              FROM academic.section_teachers st
             WHERE st.org_id = $1
               AND ($2::boolean OR st.teacher_user_id = $4)) AS teachers`,
        [user.orgId, isAdmin, isTeacher, user.id, isStudent, isParent],
      );

      const sessions = await client.query(
        `SELECT s.id, s.title, teacher.name AS teacher_name, s.mode, s.status,
                s.starts_at, s.parent_view,
                COALESCE(array_remove(array_agg(DISTINCT sec.name), NULL), '{}') AS sections
           FROM live.sessions s
           JOIN identity.users teacher
             ON teacher.id = s.teacher_user_id AND teacher.org_id = s.org_id
           LEFT JOIN live.session_sections ss
             ON ss.session_id = s.id AND ss.org_id = s.org_id
           LEFT JOIN academic.sections sec
             ON sec.id = ss.section_id AND sec.org_id = ss.org_id
          WHERE s.org_id = $1 AND s.status IN ('scheduled', 'live')
            AND s.starts_at >= now() - interval '2 hours'
            AND (
              $2::boolean OR s.teacher_user_id = $3
              OR ($4::boolean AND EXISTS (
                SELECT 1 FROM academic.section_teachers st
                 WHERE st.org_id = s.org_id AND st.section_id = ss.section_id
                   AND st.teacher_user_id = $3
              ))
              OR ($5::boolean AND EXISTS (
                SELECT 1 FROM academic.enrollments e
                 WHERE e.org_id = s.org_id AND e.section_id = ss.section_id
                   AND e.student_user_id = $3 AND e.status = 'active'
              ))
              OR ($6::boolean AND s.parent_view AND EXISTS (
                SELECT 1 FROM academic.enrollments e
                JOIN identity.guardian_links gl
                  ON gl.org_id = e.org_id AND gl.student_user_id = e.student_user_id
                 WHERE e.org_id = s.org_id AND e.section_id = ss.section_id
                   AND gl.guardian_user_id = $3 AND gl.can_view_live = true AND e.status = 'active'
              ))
            )
          GROUP BY s.id, teacher.name
          ORDER BY s.starts_at
          LIMIT 6`,
        [user.orgId, isAdmin, user.id, isTeacher, isStudent, isParent],
      );

      const activity = await client.query(
        `SELECT id, label, description, occurred_at
           FROM (
             SELECT 'attendance-' || audit.id::text AS id,
                    'Attendance recorded'::text AS label,
                    classes.name || ' · ' || sections.name || ' · ' ||
                      COALESCE(audit.metadata->>'markCount', '0') || ' students marked' AS description,
                    audit.created_at AS occurred_at
               FROM school.attendance_audit_log audit
               JOIN school.attendance_sessions attendance
                 ON attendance.org_id = audit.org_id AND attendance.id = audit.session_id
               JOIN academic.sections sections
                 ON sections.org_id = attendance.org_id AND sections.id = attendance.section_id
               JOIN academic.classes classes
                 ON classes.org_id = sections.org_id AND classes.id = sections.class_id
              WHERE audit.org_id = $1
                AND (
                  $2::boolean
                  OR ($3::boolean AND EXISTS (
                    SELECT 1 FROM academic.section_teachers assigned
                     WHERE assigned.org_id = attendance.org_id
                       AND assigned.section_id = attendance.section_id
                       AND assigned.teacher_user_id = $4
                  ))
                )
             UNION ALL
             SELECT 'payment-' || payment.id::text AS id,
                    'Fee payment received'::text AS label,
                    COALESCE(student.name, 'Student') || ' · ' || invoice.description AS description,
                    payment.captured_at AS occurred_at
               FROM fees.payments payment
               JOIN fees.invoices invoice
                 ON invoice.org_id = payment.org_id AND invoice.id = payment.invoice_id
               JOIN identity.users student
                 ON student.org_id = invoice.org_id AND student.id = invoice.student_user_id
              WHERE payment.org_id = $1 AND payment.status = 'captured' AND $2::boolean
           ) school_activity
          ORDER BY occurred_at DESC
          LIMIT 8`,
        [user.orgId, isAdmin, isTeacher, user.id],
      );

      let adminInsights;
      if (isAdmin) {
        const attendance = await client.query(
          `SELECT CURRENT_DATE::text AS attendance_date,
                  COUNT(marks.id)::int AS marked_students,
                  COUNT(*) FILTER (WHERE marks.status IN ('present', 'late'))::int AS present_students,
                  ROUND(
                    100.0 * COUNT(*) FILTER (WHERE marks.status IN ('present', 'late'))
                    / NULLIF(COUNT(marks.id), 0),
                    1
                  ) AS attendance_percent
             FROM school.attendance_sessions attendance
             JOIN school.attendance_marks marks
               ON marks.org_id = attendance.org_id AND marks.session_id = attendance.id
            WHERE attendance.org_id = $1
              AND attendance.attendance_date = CURRENT_DATE
              AND attendance.period IS NULL`,
          [user.orgId],
        );
        const fees = await client.query<{
          academic_year: string;
          total_fees_this_year_paise: string;
          collected_this_year_paise: string;
          outstanding_this_year_paise: string;
          collection_percent_this_year: string | null;
          collected_this_month_paise: string;
          outstanding_paise: string;
          overdue_invoice_count: number;
        }>(
          `WITH school_date AS (
             SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date AS today
           ),
           current_academic_year AS (
              SELECT COALESCE(
                (SELECT academic_year
                   FROM academic.academic_years
                  WHERE org_id = $1
                    AND (
                      ($2::text IS NOT NULL AND academic_year = $2)
                      OR ($2::text IS NULL AND status = 'current')
                    )
                  LIMIT 1),
                CASE
                  WHEN EXTRACT(MONTH FROM today) >= 4
                    THEN to_char(today, 'YYYY') || '-' || to_char(today + interval '1 year', 'YY')
                  ELSE to_char(today - interval '1 year', 'YYYY') || '-' || to_char(today, 'YY')
                END
              ) AS academic_year
                FROM school_date
           ),
           invoice_balances AS (
             SELECT invoice.id, invoice.academic_year, invoice.status, invoice.due_date,
                    GREATEST(invoice.amount_paise - invoice.concession_paise, 0)::bigint AS net_fee_paise,
                    COALESCE(SUM(payment.amount_paise) FILTER (WHERE payment.status = 'captured'), 0)::bigint AS paid_paise
               FROM fees.invoices invoice
               LEFT JOIN fees.payments payment
                 ON payment.org_id = invoice.org_id AND payment.invoice_id = invoice.id
              WHERE invoice.org_id = $1 AND invoice.status <> 'void'
              GROUP BY invoice.id
           )
           SELECT year.academic_year,
                  COALESCE(SUM(balance.net_fee_paise)
                    FILTER (WHERE balance.academic_year = year.academic_year), 0)::text
                    AS total_fees_this_year_paise,
                  COALESCE(SUM(LEAST(balance.net_fee_paise, balance.paid_paise))
                    FILTER (WHERE balance.academic_year = year.academic_year), 0)::text
                    AS collected_this_year_paise,
                  COALESCE(SUM(GREATEST(balance.net_fee_paise - balance.paid_paise, 0))
                    FILTER (WHERE balance.academic_year = year.academic_year), 0)::text
                    AS outstanding_this_year_paise,
                  ROUND(
                    100.0 * SUM(LEAST(balance.net_fee_paise, balance.paid_paise))
                      FILTER (WHERE balance.academic_year = year.academic_year)
                    / NULLIF(SUM(balance.net_fee_paise)
                      FILTER (WHERE balance.academic_year = year.academic_year), 0),
                    1
                  )::text AS collection_percent_this_year,
                  COALESCE((
                    SELECT SUM(payment.amount_paise)
                      FROM fees.payments payment
                     WHERE payment.org_id = $1
                       AND payment.status = 'captured'
                       AND payment.received_on >= date_trunc('month', now())::date
                       AND payment.received_on < (date_trunc('month', now()) + interval '1 month')::date
                  ), 0)::text AS collected_this_month_paise,
                  COALESCE(SUM(GREATEST(balance.net_fee_paise - balance.paid_paise, 0)), 0)::text
                    AS outstanding_paise,
                  COUNT(*) FILTER (
                    WHERE balance.academic_year = year.academic_year
                      AND balance.status = 'unpaid'
                      AND balance.due_date < school_date.today
                  )::int AS overdue_invoice_count
             FROM current_academic_year year
             CROSS JOIN school_date
             LEFT JOIN invoice_balances balance ON true
            GROUP BY year.academic_year`,
          [user.orgId, requestedAcademicYear ?? null],
        );
        const collectionTrend = await client.query(
          `SELECT to_char(months.month_start, 'YYYY-MM') AS month,
                  COALESCE(SUM(payment.amount_paise), 0)::text AS collected_paise
             FROM generate_series(
                    date_trunc('month', now()) - interval '5 months',
                    date_trunc('month', now()),
                    interval '1 month'
                  ) AS months(month_start)
             LEFT JOIN fees.payments payment
               ON payment.org_id = $1
              AND payment.status = 'captured'
              AND payment.received_on >= months.month_start::date
              AND payment.received_on < (months.month_start + interval '1 month')::date
            GROUP BY months.month_start
            ORDER BY months.month_start`,
          [user.orgId],
        );
        const attendanceRow = attendance.rows[0];
        const feeRow = fees.rows[0];
        const todayCollectionRows = await client.query<{
          gateway: string;
          payment_method: string | null;
          payment_count: number;
          amount_paise: string;
        }>(
          `SELECT gateway, payment_method, COUNT(*)::int AS payment_count,
                  COALESCE(SUM(amount_paise), 0)::text AS amount_paise
             FROM fees.payments
            WHERE org_id = $1 AND status = 'captured'
              AND received_on = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date
            GROUP BY gateway, payment_method`,
          [user.orgId],
        );
        const todayCollection = summarizeFeeCollections(todayCollectionRows.rows);
        adminInsights = {
          attendanceToday: {
            attendanceDate: attendanceRow.attendance_date,
            markedStudents: Number(attendanceRow.marked_students),
            presentStudents: Number(attendanceRow.present_students),
            attendancePercent: attendanceRow.attendance_percent === null
              ? null
              : Number(attendanceRow.attendance_percent),
          },
          fees: {
            academicYear: String(feeRow.academic_year),
            totalFeesThisYearPaise: Number(feeRow.total_fees_this_year_paise),
            collectedThisYearPaise: Number(feeRow.collected_this_year_paise),
            outstandingThisYearPaise: Number(feeRow.outstanding_this_year_paise),
            collectionPercentThisYear: feeRow.collection_percent_this_year === null
              ? null
              : Number(feeRow.collection_percent_this_year),
            collectedThisMonthPaise: Number(feeRow.collected_this_month_paise),
            outstandingPaise: Number(feeRow.outstanding_paise),
            overdueInvoiceCount: Number(feeRow.overdue_invoice_count),
            todayCollection,
            collectionTrend: collectionTrend.rows.map((row: any) => ({
              month: row.month,
              collectedPaise: Number(row.collected_paise),
            })),
          },
        };
      }

      return {
        invalidAcademicYear: false as const,
        stats: stats.rows[0],
        sessions: sessions.rows,
        activity: activity.rows,
        adminInsights,
      };
    });

    if (dashboard.invalidAcademicYear) {
      return void res.status(400).json(errorBody("INVALID_ACADEMIC_YEAR", "That academic year is not configured for this school."));
    }

    const stats = dashboard.stats ?? { students: 0, classes: 0, sections: 0, teachers: 0 };
    const sessionCount = dashboard.sessions.length;
    const metrics = isAdmin
      ? [
          { label: "Total students", value: String(stats.students), change: "Active enrollments", tone: "positive" },
          { label: "Classes", value: String(stats.classes), change: `${stats.sections} active sections`, tone: "neutral" },
          { label: "Upcoming live classes", value: String(sessionCount), change: "Next sessions", tone: "neutral" },
          { label: "Teaching staff", value: String(stats.teachers), change: "Assigned to sections", tone: "positive" },
        ]
      : [
          { label: isParent ? "Linked students" : isStudent ? "Your student record" : "Students in your sections", value: String(stats.students), change: "Based on your access", tone: "positive" },
          { label: "Classes", value: String(stats.classes), change: `${stats.sections} accessible sections`, tone: "neutral" },
          { label: "Upcoming live classes", value: String(sessionCount), change: "Next sessions", tone: "neutral" },
          { label: "Your role", value: user.roles[0]?.replaceAll("_", " ") ?? "Member", change: "School workspace", tone: "neutral" },
        ];

    res.json({
      userName: user.name,
      role: user.roles[0] ?? "student",
      metrics,
      upcomingSessions: dashboard.sessions.map((row) => ({
        id: row.id,
        title: row.title,
        teacherName: row.teacher_name,
        mode: row.mode,
        status: row.status,
        startAt: row.starts_at,
        parentView: row.parent_view,
        sections: row.sections,
      })),
      recentActivity: dashboard.activity.map((row: any) => ({
        id: row.id,
        label: row.label,
        description: row.description,
        occurredAt: row.occurred_at,
      })),
      ...(dashboard.adminInsights ? { adminInsights: dashboard.adminInsights } : {}),
    });
  } catch (error) {
    next(error);
  }
});
};

export default routes;
