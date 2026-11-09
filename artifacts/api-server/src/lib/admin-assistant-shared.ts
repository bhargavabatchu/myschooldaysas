import { withOrg } from "@workspace/db";

export type AssistantDbClient = Parameters<Parameters<typeof withOrg>[1]>[0];

export type AssistantAnswer = {
  answer: string;
  topic: "fees" | "students" | "attendance" | "help";
  sourceLabel: string | null;
  sourceHref: string | null;
  facts: { label: string; value: string }[];
  students: {
    name: string;
    admissionNo: string;
    className: string;
    sectionName: string;
    outstandingPaise: number | null;
  }[];
  suggestedQuestions: string[];
};

export const feeSuggestions = [
  "How much did we collect today by payment method?",
  "What is the outstanding fee balance?",
  "Which students have overdue fees?",
  "Show fee collection this month",
];

export const studentSuggestions = [
  "Show active student counts by class",
  "How many active students are in Grade 5?",
  "Find student by name or admission number",
  "Which students have overdue fees?",
];

export const money = (paise: number | string) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(paise) / 100);

export async function getCurrentAcademicYear(client: AssistantDbClient, orgId: string) {
  const result = await client.query<{ academic_year: string }>(
    `WITH school_date AS (
       SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date AS today
     )
     SELECT COALESCE(
       (SELECT academic_year
          FROM academic.academic_years
         WHERE org_id = $1 AND status = 'current'
         LIMIT 1),
       CASE
         WHEN EXTRACT(MONTH FROM today) >= 4
           THEN to_char(today, 'YYYY') || '-' || to_char(today + interval '1 year', 'YY')
         ELSE to_char(today - interval '1 year', 'YYYY') || '-' || to_char(today, 'YY')
       END
     ) AS academic_year
       FROM school_date`,
    [orgId],
  );
  return result.rows[0]?.academic_year ?? "";
}

export async function getIndiaDates(client: AssistantDbClient) {
  const result = await client.query<{ today: string; month_label: string }>(
    `SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date::text AS today,
            to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata', 'FMMonth YYYY') AS month_label`,
  );
  return result.rows[0]!;
}

export function helpAnswer(): AssistantAnswer {
  return {
    answer: "I can answer read-only questions about today's or this month's fee collection, current-year outstanding or overdue invoices, active student counts, student lookup, and today's attendance. Historical date ranges aren't supported yet, and I can't change school records.",
    topic: "help",
    sourceLabel: null,
    sourceHref: null,
    facts: [],
    students: [],
    suggestedQuestions: feeSuggestions,
  };
}
