import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { withOrg } from "@workspace/db";
import { requireAuth, requireRoles } from "../lib/auth";
import { createRouteRegistrar } from "../lib/fastify-routes";

/**
 * Administration reports: enrollment trends (joiners/leavers), fee dues with
 * paid/unpaid filters, and certificate issuance log.
 */

function rupees(paise: number): string {
  return (paise / 100).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
}

const routes: FastifyPluginAsync = async (fastify) => {
  const router = createRouteRegistrar(fastify);

  router.get("/reports/enrollment-trends", requireAuth, requireRoles("super_admin", "org_admin", "campus_admin"), async (req, res, next) => {
    const user = req.campusUser;
    if (!user) return void res.status(401).send({ error: { code: "UNAUTHENTICATED", message: "Sign in to continue." } });
    const query = z.object({ months: z.coerce.number().int().min(1).max(36).default(12) }).safeParse(req.query);

    try {
      const months = query.success ? query.data.months : 12;
      const data = await withOrg(user.orgId, async (client) => {
        const joiners = await client.query<{ month: string; total: number }>(
          `SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month, count(*)::int AS total
             FROM academic.enrollments
            WHERE org_id = $1 AND created_at >= date_trunc('month', now()) - ($2::int * interval '1 month') + interval '1 month'
            GROUP BY 1 ORDER BY 1`,
          [user.orgId, months - 1],
        );
        const leavers = await client.query<{ month: string; total: number; reason: string }>(
          `SELECT to_char(date_trunc('month', ended_at), 'YYYY-MM') AS month, count(*)::int AS total,
                  COALESCE(ended_reason, 'withdrawn') AS reason
             FROM academic.enrollments
            WHERE org_id = $1 AND ended_at IS NOT NULL
              AND ended_at >= date_trunc('month', now()) - ($2::int * interval '1 month') + interval '1 month'
            GROUP BY 1, 3 ORDER BY 1`,
          [user.orgId, months - 1],
        );
        const currentStrength = await client.query<{ total: number }>(
          "SELECT count(DISTINCT student_user_id)::int AS total FROM academic.enrollments WHERE org_id = $1 AND status = 'active'",
          [user.orgId],
        );
        return {
          joiners: joiners.rows,
          leavers: leavers.rows,
          currentStrength: currentStrength.rows[0]?.total ?? 0,
        };
      });

      // Merge into a single month series.
      const seriesMap = new Map<string, { month: string; joiners: number; leavers: number }>();
      for (const row of data.joiners) {
        seriesMap.set(row.month, { month: row.month, joiners: row.total, leavers: 0 });
      }
      for (const row of data.leavers) {
        const existing = seriesMap.get(row.month) ?? { month: row.month, joiners: 0, leavers: 0 };
        existing.leavers += row.total;
        seriesMap.set(row.month, existing);
      }
      const series = [...seriesMap.values()].sort((a, b) => a.month.localeCompare(b.month));
      const reasons: Record<string, number> = {};
      for (const row of data.leavers) reasons[row.reason] = (reasons[row.reason] ?? 0) + row.total;

      res.send({ series, reasons, currentStrength: data.currentStrength });
    } catch (error) {
      next(error);
    }
  });

  router.get("/reports/fees-due", requireAuth, requireRoles("super_admin", "org_admin", "campus_admin"), async (req, res, next) => {
    const user = req.campusUser;
    if (!user) return void res.status(401).send({ error: { code: "UNAUTHENTICATED", message: "Sign in to continue." } });
    const query = z.object({
      academicYear: z.string().trim().min(4).max(24).optional(),
      classId: z.string().uuid().optional(),
      sectionId: z.string().uuid().optional(),
      status: z.enum(["all", "paid", "unpaid", "partial"]).default("all"),
      limit: z.coerce.number().int().min(1).max(200).default(100),
      offset: z.coerce.number().int().min(0).default(0),
    }).safeParse(req.query);

    try {
      const filters = query.success ? query.data : { academicYear: undefined, classId: undefined, sectionId: undefined, status: "all" as const, limit: 100, offset: 0 };
      const params: unknown[] = [user.orgId];
      if (filters.academicYear) params.push(filters.academicYear);
      if (filters.sectionId) params.push(filters.sectionId);
      if (filters.classId) params.push(filters.classId);
      const yearFilter = filters.academicYear ? "AND i.academic_year = $2" : "";
      const sectionFilter = filters.sectionId ? `AND i.section_id = $${filters.academicYear ? 3 : 2}` : "";
      const classFilter = filters.classId ? `AND fs.class_id = $${(filters.academicYear ? 1 : 0) + (filters.sectionId ? 1 : 0) + 2}` : "";
      const statusClause =
        filters.status === "paid" ? "AND l.balance <= 0"
        : filters.status === "unpaid" ? "AND l.balance > 0 AND l.paid_paise = 0"
        : filters.status === "partial" ? "AND l.balance > 0 AND l.paid_paise > 0"
        : "";

      const data = await withOrg(user.orgId, async (client) => {
        const summary = await client.query<{
          paid: number; unpaid: number; partial: number; outstanding_paise: string; billed_paise: string; collected_paise: string;
        }>(
          `WITH ledger AS (
             SELECT i.amount_paise, i.concession_paise,
                    COALESCE(p.paid_paise, 0) AS paid_paise,
                    GREATEST(i.amount_paise - i.concession_paise - COALESCE(p.paid_paise, 0), 0) AS balance
               FROM fees.invoices i
               LEFT JOIN academic.sections s ON s.org_id = i.org_id AND s.id = i.section_id
               LEFT JOIN (
                 SELECT invoice_id, sum(amount_paise) FILTER (WHERE status = 'captured') AS paid_paise
                   FROM fees.payments GROUP BY invoice_id
               ) p ON p.invoice_id = i.id
              WHERE i.org_id = $1 AND i.status <> 'void'
                ${yearFilter}
                ${sectionFilter}
                ${classFilter}
           )
           SELECT
             count(*) FILTER (WHERE balance <= 0)::int AS paid,
             count(*) FILTER (WHERE balance > 0 AND paid_paise = 0)::int AS unpaid,
             count(*) FILTER (WHERE balance > 0 AND paid_paise > 0)::int AS partial,
             COALESCE(sum(balance), 0)::text AS outstanding_paise,
             COALESCE(sum(amount_paise - concession_paise), 0)::text AS billed_paise,
             COALESCE(sum(LEAST(paid_paise, amount_paise - concession_paise)), 0)::text AS collected_paise
           FROM ledger`,
          params,
        );

        const rows = await client.query<{
          invoice_number: string; student_name: string; admission_no: string | null;
          class_name: string | null; section_name: string | null; academic_year: string;
          period: string; amount_paise: string; concession_paise: string; paid_paise: string;
          balance_paise: string; due_date: string | null; status: string;
          total: number;
        }>(
          `WITH ledger AS (
             SELECT i.id AS invoice_id, i.invoice_number, i.student_user_id, i.section_id,
                    i.academic_year, i.period, i.due_date::text AS due_date,
                    i.amount_paise, i.concession_paise,
                    COALESCE(p.paid_paise, 0) AS paid_paise,
                    GREATEST(i.amount_paise - i.concession_paise - COALESCE(p.paid_paise, 0), 0) AS balance
               FROM fees.invoices i
               LEFT JOIN (
                 SELECT invoice_id, sum(amount_paise) FILTER (WHERE status = 'captured') AS paid_paise
                   FROM fees.payments GROUP BY invoice_id
               ) p ON p.invoice_id = i.id
              WHERE i.org_id = $1 AND i.status <> 'void'
                ${filters.academicYear ? "AND i.academic_year = $2" : ""}
                ${filters.sectionId ? `AND i.section_id = $${filters.academicYear ? 3 : 2}` : ""}
           )
           SELECT l.invoice_number, u.name AS student_name, e.admission_no,
                  c.name AS class_name, s.name AS section_name, l.academic_year, l.period,
                  l.amount_paise::text, l.concession_paise::text, l.paid_paise::text,
                  l.balance::text AS balance_paise, l.due_date,
                  CASE WHEN l.balance <= 0 THEN 'paid' WHEN l.paid_paise = 0 THEN 'unpaid' ELSE 'partial' END AS status,
                  count(*) OVER ()::int AS total
             FROM ledger l
             JOIN identity.users u ON u.org_id = $1 AND u.id = l.student_user_id
             LEFT JOIN academic.enrollments e ON e.org_id = $1 AND e.student_user_id = l.student_user_id AND e.status = 'active'
             LEFT JOIN academic.sections s ON s.org_id = $1 AND s.id = l.section_id
             LEFT JOIN academic.classes c ON c.org_id = s.org_id AND c.id = s.class_id
             ${filters.classId ? `JOIN academic.sections fs ON fs.org_id = $1 AND fs.id = l.section_id AND fs.class_id = $${(filters.academicYear ? 1 : 0) + (filters.sectionId ? 1 : 0) + 2}` : ""}
            WHERE 1=1
              ${filters.status === "paid" ? "AND l.balance <= 0" : filters.status === "unpaid" ? "AND l.balance > 0 AND l.paid_paise = 0" : filters.status === "partial" ? "AND l.balance > 0 AND l.paid_paise > 0" : ""}
            ORDER BY l.due_date NULLS LAST, l.invoice_number
            LIMIT ${filters.limit} OFFSET ${filters.offset}`,
          [
            user.orgId,
            ...(filters.academicYear ? [filters.academicYear] : []),
            ...(filters.sectionId ? [filters.sectionId] : []),
            ...(filters.classId ? [filters.classId] : []),
          ],
        );
        return {
          summary: summary.rows[0],
          items: rows.rows.map((row) => ({
            invoiceNumber: row.invoice_number,
            studentName: row.student_name,
            admissionNo: row.admission_no,
            className: row.class_name,
            sectionName: row.section_name,
            academicYear: row.academic_year,
            period: row.period,
            amountPaise: Number(row.amount_paise),
            concessionPaise: Number(row.concession_paise),
            paidPaise: Number(row.paid_paise),
            balancePaise: Number(row.balance_paise),
            dueDate: row.due_date,
            status: row.status,
          })),
          total: rows.rows[0]?.total ?? 0,
        };
      });

      res.send({
        summary: {
          paid: data.summary.paid,
          unpaid: data.summary.unpaid,
          partial: data.summary.partial,
          outstanding: rupees(Number(data.summary.outstanding_paise)),
          billed: rupees(Number(data.summary.billed_paise)),
          collected: rupees(Number(data.summary.collected_paise)),
        },
        items: data.items,
        total: data.total,
        limit: filters.limit,
        offset: filters.offset,
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/reports/certificates", requireAuth, requireRoles("super_admin", "org_admin", "campus_admin"), async (req, res, next) => {
    const user = req.campusUser;
    if (!user) return void res.status(401).send({ error: { code: "UNAUTHENTICATED", message: "Sign in to continue." } });
    const query = z.object({
      limit: z.coerce.number().int().min(1).max(200).default(100),
      offset: z.coerce.number().int().min(0).default(0),
    }).safeParse(req.query);
    const limit = query.success ? query.data.limit : 100;
    const offset = query.success ? query.data.offset : 0;

    try {
      const data = await withOrg(user.orgId, async (client) => {
        const rows = await client.query<{
          id: string; student_name: string; admission_no: string | null; kind: string;
          issued_by: string; created_at: Date; total: number;
        }>(
          `SELECT l.id, u.name AS student_name, e.admission_no, l.kind,
                  au.name AS issued_by, l.created_at,
                  count(*) OVER()::int AS total
             FROM school.certificate_log l
             JOIN identity.users u ON u.org_id = l.org_id AND u.id = l.student_user_id
             JOIN identity.users au ON au.org_id = l.org_id AND au.id = l.actor_user_id
             LEFT JOIN LATERAL (
               SELECT admission_no FROM academic.enrollments
                WHERE org_id = l.org_id AND student_user_id = l.student_user_id
                ORDER BY created_at DESC LIMIT 1
             ) e ON true
            WHERE l.org_id = $1
            ORDER BY l.created_at DESC
            LIMIT $2 OFFSET $3`,
          [user.orgId, limit, offset],
        );
        return rows.rows.map((row) => ({
          id: row.id,
          studentName: row.student_name,
          admissionNo: row.admission_no,
          kind: row.kind,
          issuedBy: row.issued_by,
          issuedAt: row.created_at.toISOString(),
          total: row.total,
        }));
      });
      res.send({ items: data, total: data[0]?.total ?? 0, limit, offset });
    } catch (error) {
      next(error);
    }
  });
};

export default routes;
