import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { withOrg } from "@workspace/db";
import { requireAuth, requireRoles } from "../lib/auth";
import { createRouteRegistrar } from "../lib/fastify-routes";

/**
 * Staff payroll: monthly salary structures, payment recording, and printable
 * payslips. Administrators only.
 */

const periodSchema = z.string().regex(/^\d{4}-\d{2}$/, "Period must be YYYY-MM.");
const paramsSchema = z.object({ userId: z.string().uuid() });

const salaryInput = z.object({
  monthlyAmountPaise: z.number().int().min(0),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const payInput = z.object({
  userId: z.string().uuid(),
  period: periodSchema,
  amountPaise: z.number().int().min(0),
  paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  mode: z.enum(["bank", "cash", "cheque", "other"]),
  notes: z.string().trim().max(300).nullish(),
});

const MODE_LABELS: Record<string, string> = {
  bank: "Bank transfer",
  cash: "Cash",
  cheque: "Cheque",
  other: "Other",
};

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function rupees(paise: number | string | null): string {
  const value = Number(paise ?? 0) / 100;
  return value.toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
}

function renderPayslipHtml(data: {
  schoolName: string;
  staffName: string;
  employeeCode: string;
  designation: string;
  period: string;
  amountPaise: number;
  paidOn: string;
  mode: string;
  notes: string;
  issuedBy: string;
}): string {
  const [year, month] = data.period.split("-");
  const monthLabel = new Date(Number(year), Number(month) - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/>
<title>Payslip ${escapeHtml(data.period)} — ${escapeHtml(data.staffName)}</title>
<style>
  @page { size: A4; margin: 18mm; }
  body { font-family: 'DM Sans', Arial, sans-serif; color: #1c2b26; }
  .sheet { max-width: 178mm; margin: 0 auto; }
  header { text-align: center; border-bottom: 3px double #1c2b26; padding-bottom: 12px; margin-bottom: 8px; }
  .school { font-size: 24px; font-weight: 700; letter-spacing: .04em; margin: 0; }
  .motto { font-size: 12px; letter-spacing: .2em; text-transform: uppercase; color: #55685f; margin: 6px 0 0; }
  h1 { text-align: center; font-size: 17px; letter-spacing: .24em; text-transform: uppercase; margin: 24px 0 6px; }
  .period { text-align: center; font-size: 14px; font-weight: 700; margin: 0 0 20px; }
  table.details, table.earnings { width: 100%; border-collapse: collapse; font-size: 14px; margin-bottom: 18px; }
  table.details td { padding: 6px 4px; }
  table.details td:first-child { width: 220px; color: #55685f; }
  table.earnings td, table.earnings th { border: 1px solid #d5d9d3; padding: 9px 12px; text-align: left; }
  table.earnings th { background: #eef2ee; font-size: 12px; letter-spacing: .08em; text-transform: uppercase; }
  table.earnings td.amount, table.earnings th.amount { text-align: right; }
  table.earnings tr.total td { font-weight: 700; background: #f4f6f2; }
  .sign { display: flex; justify-content: space-between; margin-top: 70px; font-size: 13px; }
  .sign div { text-align: center; }
  .sign .line { border-top: 1px solid #1c2b26; padding-top: 6px; min-width: 200px; }
  @media print { .noprint { display: none; } }
  .noprint { text-align: center; margin: 18px 0; }
  .noprint button { font-size: 14px; padding: 10px 26px; border-radius: 999px; border: none; background: #173e38; color: #f6f3e9; cursor: pointer; }
</style></head>
<body><div class="sheet">
  <header>
    <p class="school">${escapeHtml(data.schoolName)}</p>
    <p class="motto">Salary payslip</p>
  </header>
  <h1>Payslip</h1>
  <p class="period">${escapeHtml(monthLabel)}</p>
  <table class="details">
    <tr><td>Employee name</td><td><strong>${escapeHtml(data.staffName)}</strong></td></tr>
    <tr><td>Employee code</td><td>${escapeHtml(data.employeeCode || "—")}</td></tr>
    <tr><td>Designation</td><td>${escapeHtml(data.designation)}</td></tr>
    <tr><td>Payment date</td><td>${escapeHtml(data.paidOn)}</td></tr>
    <tr><td>Payment mode</td><td>${escapeHtml(data.mode)}</td></tr>
  </table>
  <table class="earnings">
    <tr><th>Earnings</th><th class="amount">Amount</th></tr>
    <tr><td>Monthly salary — ${escapeHtml(monthLabel)}</td><td class="amount">${escapeHtml(rupees(data.amountPaise))}</td></tr>
    <tr class="total"><td>Total net pay</td><td class="amount">${escapeHtml(rupees(data.amountPaise))}</td></tr>
  </table>
  ${data.notes ? `<p style="font-size:13px;color:#41564e;">Notes: ${escapeHtml(data.notes)}</p>` : ""}
  <div class="sign">
    <div><div class="line">Employee signature</div></div>
    <div><div class="line">${escapeHtml(data.issuedBy)}<br/>Principal / School Administrator</div></div>
  </div>
  <div class="noprint"><button onclick="window.print()">Print / Save as PDF</button></div>
</div></body></html>`;
}

const routes: FastifyPluginAsync = async (fastify) => {
  const router = createRouteRegistrar(fastify);

  router.get("/identity/payroll", requireAuth, requireRoles("super_admin", "org_admin", "campus_admin"), async (req, res, next) => {
    const user = req.campusUser;
    if (!user) return void res.status(401).send({ error: { code: "UNAUTHENTICATED", message: "Sign in to continue." } });
    const query = z.object({ month: periodSchema }).safeParse(req.query);
    if (!query.success) return void res.status(400).send({ error: { code: "INVALID_REQUEST", message: "Provide a valid month (YYYY-MM)." } });
    const period = query.data.month;

    try {
      const items = await withOrg(user.orgId, async (client) => {
        const rows = await client.query<{
          user_id: string; name: string; email: string; roles: string[];
          employee_code: string | null; monthly_amount_paise: string | null;
          paid_amount_paise: string | null; paid_on: string | null; mode: string | null; notes: string | null;
        }>(
          `SELECT u.id AS user_id, u.name, u.email,
                  COALESCE(array_agg(DISTINCT r.role) FILTER (WHERE r.role IN ('teacher','class_teacher','hod','campus_admin','org_admin','super_admin')), '{}') AS roles,
                  sp.employee_code,
                  ss.monthly_amount_paise::text AS monthly_amount_paise,
                  pay.amount_paise::text AS paid_amount_paise,
                  pay.paid_on::text AS paid_on, pay.mode, pay.notes
             FROM identity.users u
             JOIN identity.user_roles r ON r.org_id = u.org_id AND r.user_id = u.id
             LEFT JOIN identity.staff_profiles sp ON sp.org_id = u.org_id AND sp.user_id = u.id
             LEFT JOIN identity.salary_structures ss ON ss.org_id = u.org_id AND ss.user_id = u.id
             LEFT JOIN identity.salary_payments pay ON pay.org_id = u.org_id AND pay.user_id = u.id AND pay.period = $2
            WHERE u.org_id = $1 AND u.status = 'active'
            GROUP BY u.id, sp.org_id, sp.user_id, sp.employee_code, ss.monthly_amount_paise,
                     pay.amount_paise, pay.paid_on, pay.mode, pay.notes
            HAVING count(*) FILTER (WHERE r.role IN ('teacher','class_teacher','hod','campus_admin','org_admin','super_admin')) > 0
            ORDER BY lower(u.name)`,
          [user.orgId, period],
        );
        return rows.rows.map((row) => {
          const monthly = row.monthly_amount_paise ? Number(row.monthly_amount_paise) : null;
          const paidAmount = row.paid_amount_paise ? Number(row.paid_amount_paise) : null;
          return {
            userId: row.user_id,
            name: row.name,
            email: row.email,
            roles: row.roles ?? [],
            employeeCode: row.employee_code,
            monthlyAmountPaise: monthly,
            paid: paidAmount != null,
            paidAmountPaise: paidAmount,
            paidOn: row.paid_on,
            mode: row.mode,
            notes: row.notes,
          };
        });
      });
      const summary = {
        staff: items.length,
        withSalary: items.filter((item) => item.monthlyAmountPaise != null).length,
        paid: items.filter((item) => item.paid).length,
        unpaid: items.filter((item) => !item.paid).length,
        totalMonthlyPaise: items.reduce((sum, item) => sum + (item.monthlyAmountPaise ?? 0), 0),
        paidPaise: items.reduce((sum, item) => sum + (item.paidAmountPaise ?? 0), 0),
      };
      res.send({ period, items, summary });
    } catch (error) {
      next(error);
    }
  });

  router.put("/identity/payroll/:userId/salary", requireAuth, requireRoles("super_admin", "org_admin", "campus_admin"), async (req, res, next) => {
    const user = req.campusUser;
    if (!user) return void res.status(401).send({ error: { code: "UNAUTHENTICATED", message: "Sign in to continue." } });
    const params = paramsSchema.safeParse(req.params);
    const body = salaryInput.safeParse(req.body);
    if (!params.success || !body.success) {
      return void res.status(400).send({ error: { code: "INVALID_REQUEST", message: "Provide a valid staff member and salary amount." } });
    }

    try {
      const saved = await withOrg(user.orgId, async (client) => {
        const target = await client.query(
          `SELECT u.id FROM identity.users u
            WHERE u.org_id = $1 AND u.id = $2 AND u.status = 'active'
              AND EXISTS (SELECT 1 FROM identity.user_roles r WHERE r.org_id = u.org_id AND r.user_id = u.id AND r.role IN ('teacher','class_teacher','hod','campus_admin','org_admin','super_admin'))`,
          [user.orgId, params.data.userId],
        );
        if (!target.rowCount) return null;
        await client.query(
          `INSERT INTO identity.salary_structures (org_id, user_id, monthly_amount_paise, effective_from)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (org_id, user_id) DO UPDATE SET
             monthly_amount_paise = EXCLUDED.monthly_amount_paise,
             effective_from = EXCLUDED.effective_from,
             updated_at = now()`,
          [user.orgId, params.data.userId, body.data.monthlyAmountPaise, body.data.effectiveFrom ?? new Date().toISOString().slice(0, 10)],
        );
        return { userId: params.data.userId, monthlyAmountPaise: body.data.monthlyAmountPaise };
      });
      if (!saved) return void res.status(404).send({ error: { code: "NOT_FOUND", message: "Staff member not found." } });
      res.send(saved);
    } catch (error) {
      next(error);
    }
  });

  router.post("/identity/payroll/pay", requireAuth, requireRoles("super_admin", "org_admin", "campus_admin"), async (req, res, next) => {
    const user = req.campusUser;
    if (!user) return void res.status(401).send({ error: { code: "UNAUTHENTICATED", message: "Sign in to continue." } });
    const body = payInput.safeParse(req.body);
    if (!body.success) {
      return void res.status(400).send({ error: { code: "INVALID_REQUEST", message: "Provide valid salary payment details." } });
    }

    try {
      const paid = await withOrg(user.orgId, async (client) => {
        const inserted = await client.query<{ period: string; amount_paise: string; paid_on: string; mode: string; notes: string | null }>(
          `INSERT INTO identity.salary_payments
             (org_id, user_id, period, amount_paise, paid_on, mode, notes, paid_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (org_id, user_id, period) DO UPDATE SET
             amount_paise = EXCLUDED.amount_paise,
             paid_on = EXCLUDED.paid_on,
             mode = EXCLUDED.mode,
             notes = EXCLUDED.notes
           RETURNING period, amount_paise::text, paid_on::text, mode, notes`,
          [
            user.orgId,
            body.data.userId,
            body.data.period,
            body.data.amountPaise,
            body.data.paidOn ?? new Date().toISOString().slice(0, 10),
            body.data.mode,
            body.data.notes ?? null,
            user.id,
          ],
        );
        return inserted.rows[0] ?? null;
      });
      if (!paid) return void res.status(500).send({ error: { code: "INTERNAL_ERROR", message: "Payment could not be recorded." } });
      res.send({
        userId: body.data.userId,
        period: paid.period,
        amountPaise: Number(paid.amount_paise),
        paidOn: paid.paid_on,
        mode: paid.mode,
        notes: paid.notes,
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/identity/payroll/:userId/payslip/:period", requireAuth, requireRoles("super_admin", "org_admin", "campus_admin"), async (req, res, next) => {
    const user = req.campusUser;
    if (!user) return void res.status(401).send({ error: { code: "UNAUTHENTICATED", message: "Sign in to continue." } });
    const params = z.object({ userId: z.string().uuid(), period: periodSchema }).safeParse(req.params);
    if (!params.success) {
      return void res.status(400).send({ error: { code: "INVALID_REQUEST", message: "Provide a valid staff member and period." } });
    }

    try {
      const slip = await withOrg(user.orgId, async (client) => {
        const rows = await client.query<{
          name: string; org_name: string; employee_code: string | null;
          roles: string[]; monthly_amount_paise: string | null;
          amount_paise: string | null; paid_on: string | null; mode: string | null; notes: string | null;
        }>(
          `SELECT u.name, o.name AS org_name, sp.employee_code,
                  COALESCE(array_agg(DISTINCT r.role) FILTER (WHERE r.role IN ('teacher','class_teacher','hod','campus_admin','org_admin','super_admin')), '{}') AS roles,
                  ss.monthly_amount_paise::text,
                  pay.amount_paise::text, pay.paid_on::text, pay.mode, pay.notes
             FROM identity.users u
             JOIN identity.organizations o ON o.id = u.org_id
             LEFT JOIN identity.staff_profiles sp ON sp.org_id = u.org_id AND sp.user_id = u.id
             LEFT JOIN identity.salary_structures ss ON ss.org_id = u.org_id AND ss.user_id = u.id
             LEFT JOIN identity.salary_payments pay ON pay.org_id = u.org_id AND pay.user_id = u.id AND pay.period = $3
             JOIN identity.user_roles r ON r.org_id = u.org_id AND r.user_id = u.id
            WHERE u.org_id = $1 AND u.id = $2
            GROUP BY u.id, o.name, sp.employee_code, ss.monthly_amount_paise,
                     pay.amount_paise, pay.paid_on, pay.mode, pay.notes`,
          [user.orgId, params.data.userId, params.data.period],
        );
        return rows.rows[0] ?? null;
      });
      if (!slip || !slip.amount_paise) {
        return void res.status(404).send({ error: { code: "NOT_FOUND", message: "No salary payment recorded for this staff member and period." } });
      }
      const designation = (slip.roles ?? [])
        .filter((role) => role !== "super_admin")
        .sort()
        .join(", ") || "Staff";
      const html = renderPayslipHtml({
        schoolName: slip.org_name,
        staffName: slip.name,
        employeeCode: slip.employee_code ?? "",
        designation,
        period: params.data.period,
        amountPaise: Number(slip.amount_paise),
        paidOn: slip.paid_on ?? "",
        mode: MODE_LABELS[slip.mode ?? ""] ?? slip.mode ?? "",
        notes: slip.notes ?? "",
        issuedBy: user.name,
      });
      res
        .type("text/html; charset=utf-8")
        .header("Cache-Control", "private, no-store")
        .send(html);
    } catch (error) {
      next(error);
    }
  });
};

export default routes;
