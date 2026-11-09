import { summarizeFeeCollections } from "./fee-collection-policy.ts";
import {
  getCurrentAcademicYear,
  getIndiaDates,
  money,
  feeSuggestions,
  type AssistantAnswer,
  type AssistantDbClient,
} from "./admin-assistant-shared.ts";
import type { AdminAssistantIntent } from "./admin-assistant-policy.ts";

export async function answerFeeCollections(
  client: AssistantDbClient,
  orgId: string,
  range: "today" | "month" | "year",
): Promise<AssistantAnswer> {
  const dates = await getIndiaDates(client);
  const academicYear = range === "year" ? await getCurrentAcademicYear(client, orgId) : null;
  const filter = range === "today"
    ? "payment.received_on = $2::date"
    : range === "month"
      ? `payment.received_on >= date_trunc('month', $2::date)::date
         AND payment.received_on < (date_trunc('month', $2::date) + interval '1 month')::date`
      : "invoice.academic_year = $2";
  const filterValue = range === "year" ? academicYear : dates.today;
  const totals = await client.query<{
    gateway: string;
    payment_method: string | null;
    payment_count: number;
    amount_paise: string;
  }>(
    `SELECT payment.gateway, payment.payment_method,
            COUNT(*)::int AS payment_count,
            COALESCE(SUM(payment.amount_paise), 0)::text AS amount_paise
       FROM fees.payments payment
       JOIN fees.invoices invoice
         ON invoice.org_id = payment.org_id AND invoice.id = payment.invoice_id
      WHERE payment.org_id = $1
        AND payment.status = 'captured'
        AND ${filter}
      GROUP BY payment.gateway, payment.payment_method`,
    [orgId, filterValue],
  );
  const summary = summarizeFeeCollections(totals.rows);
  const period = range === "today"
    ? `today (${dates.today})`
    : range === "month"
      ? dates.month_label
      : `academic year ${academicYear}`;
  const facts = [
    { label: "Total received", value: money(summary.totalPaise) },
    { label: "Cash", value: money(summary.cashPaise) },
    { label: "Digital / online", value: money(summary.onlinePaise) },
    { label: "Cheque", value: money(summary.chequePaise) },
    { label: "Other", value: money(summary.otherPaise) },
    { label: "Payments", value: String(summary.paymentCount) },
  ];
  if (summary.testCount) facts.push({ label: "Test payments", value: money(summary.testPaise) });
  return {
    answer: summary.paymentCount
      ? `For ${period}, the school received ${money(summary.totalPaise)} across ${summary.paymentCount} recorded payments.`
      : `No fee payments were recorded for ${period}.`,
    topic: "fees",
    sourceLabel: "Open fee collections",
    sourceHref: "/fees#collections",
    facts,
    students: [],
    suggestedQuestions: feeSuggestions,
  };
}

const feeBalancesCte = `WITH balances AS (
  SELECT invoice.id, invoice.student_user_id, invoice.section_id, invoice.academic_year,
         invoice.due_date, student.name AS student_name,
         class.name AS class_name, section.name AS section_name,
         enrollment.admission_no,
         GREATEST(
           invoice.amount_paise - invoice.concession_paise
           - COALESCE(SUM(payment.amount_paise) FILTER (WHERE payment.status = 'captured'), 0),
           0
         )::bigint AS outstanding_paise
    FROM fees.invoices invoice
    JOIN identity.users student
      ON student.org_id = invoice.org_id AND student.id = invoice.student_user_id
    JOIN academic.sections section
      ON section.org_id = invoice.org_id AND section.id = invoice.section_id
    JOIN academic.classes class
      ON class.org_id = section.org_id AND class.id = section.class_id
    LEFT JOIN academic.enrollments enrollment
      ON enrollment.org_id = invoice.org_id
     AND enrollment.student_user_id = invoice.student_user_id
     AND enrollment.section_id = invoice.section_id
     AND enrollment.academic_year = invoice.academic_year
    LEFT JOIN fees.payments payment
      ON payment.org_id = invoice.org_id AND payment.invoice_id = invoice.id
   WHERE invoice.org_id = $1
     AND invoice.academic_year = $2
     AND invoice.status = 'unpaid'
     AND ($3::text IS NULL OR class.name ILIKE '%' || $3 || '%')
   GROUP BY invoice.id, student.name, class.name, section.name, enrollment.admission_no
)`;

export async function answerFeeOutstanding(
  client: AssistantDbClient,
  orgId: string,
  intent: Extract<AdminAssistantIntent, { kind: "fee_outstanding" }>,
): Promise<AssistantAnswer> {
  const [academicYear, dates] = await Promise.all([
    getCurrentAcademicYear(client, orgId),
    getIndiaDates(client),
  ]);
  const summary = await client.query<{
    invoice_count: number;
    outstanding_paise: string;
    overdue_invoice_count: number;
    overdue_paise: string;
  }>(
    `${feeBalancesCte}
     SELECT COUNT(*)::int AS invoice_count,
            COALESCE(SUM(outstanding_paise), 0)::text AS outstanding_paise,
            COUNT(*) FILTER (WHERE due_date < $4::date)::int AS overdue_invoice_count,
            COALESCE(SUM(outstanding_paise) FILTER (WHERE due_date < $4::date), 0)::text AS overdue_paise
       FROM balances
      WHERE outstanding_paise > 0`,
    [orgId, academicYear, intent.classTerm, dates.today],
  );
  const totals = summary.rows[0]!;
  const amount = intent.overdueOnly ? totals.overdue_paise : totals.outstanding_paise;
  const count = intent.overdueOnly ? totals.overdue_invoice_count : totals.invoice_count;
  let students: AssistantAnswer["students"] = [];

  if (intent.listStudents) {
    const rows = await client.query<{
      student_name: string;
      admission_no: string | null;
      class_name: string;
      section_name: string;
      outstanding_paise: string;
    }>(
      `${feeBalancesCte}
       SELECT student_name, admission_no, class_name, section_name,
              SUM(outstanding_paise)::text AS outstanding_paise
         FROM balances
        WHERE outstanding_paise > 0
          AND (NOT $5::boolean OR due_date < $4::date)
        GROUP BY student_name, admission_no, class_name, section_name
        ORDER BY SUM(outstanding_paise) DESC, student_name
        LIMIT 10`,
      [orgId, academicYear, intent.classTerm, dates.today, intent.overdueOnly],
    );
    students = rows.rows.map((row) => ({
      name: row.student_name,
      admissionNo: row.admission_no ?? "—",
      className: row.class_name,
      sectionName: row.section_name,
      outstandingPaise: Number(row.outstanding_paise),
    }));
  }

  const description = intent.overdueOnly ? "overdue balance" : "unpaid balance";
  const classDescription = intent.classTerm ? ` in class/grade ${intent.classTerm}` : "";
  const answerText = count
    ? `For ${academicYear}, the ${description}${classDescription} is ${money(amount)} across ${count} invoices.`
    : `There are no ${intent.overdueOnly ? "overdue" : "outstanding"} invoices${classDescription} for ${academicYear}.`;
  return {
    answer: intent.listStudents && students.length
      ? `${answerText} Showing up to 10 students with the largest balance.`
      : answerText,
    topic: "fees",
    sourceLabel: "Review invoices",
    sourceHref: "/fees",
    facts: [
      { label: intent.overdueOnly ? "Overdue balance" : "Outstanding balance", value: money(amount) },
      { label: intent.overdueOnly ? "Overdue invoices" : "Unpaid invoices", value: String(count) },
      { label: "Academic year", value: academicYear },
      ...(!intent.overdueOnly
        ? [{ label: "Overdue portion", value: money(totals.overdue_paise) }]
        : []),
    ],
    students,
    suggestedQuestions: feeSuggestions,
  };
}
