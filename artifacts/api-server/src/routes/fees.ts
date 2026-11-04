import { randomUUID } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  GenerateFeeInvoicesBody,
  GetFeeInvoicesQueryParams,
  GetFeeReceiptParams,
  PayFeeInvoiceParams,
  RecordManualFeePaymentBody,
  RecordManualFeePaymentParams,
  UpdateFeeInvoiceConcessionBody,
  UpdateFeeInvoiceConcessionParams,
} from "@workspace/api-zod";
import { withOrg } from "@workspace/db";
import { createRouteRegistrar } from "../lib/fastify-routes";
import { requireAuth, type CampusRole } from "../lib/auth";
import { calculateConcessionBalance } from "../lib/fee-concession-policy";
import { canParentPayInvoice, isMockPaymentEnvironment } from "../lib/fee-payment-policy";
import { canRecordManualFeePayment, evaluateManualFeePayment } from "../lib/manual-fee-payment-policy";
import { buildMyFeeInvoiceQuery } from "../lib/fee-invoice-access";

const adminRoles: CampusRole[] = ["super_admin", "org_admin", "campus_admin"];
const errorBody = (code: string, message: string) => ({ error: { code, message } });

type InvoiceRow = {
  id: string;
  student_user_id: string;
  student_name: string;
  section_id: string;
  invoice_number: string;
  academic_year: string;
  period: string;
  description: string;
  amount_paise: string | number;
  concession_paise: string | number;
  concession_reason?: string | null;
  paid_paise?: string | number | null;
  due_date: string | Date;
  status: "unpaid" | "paid" | "waived" | "void";
  receipt_number: string | null;
  paid_at: Date | null;
  payments?: InvoicePaymentRow[] | string | null;
  can_pay?: boolean;
};

type InvoicePaymentRow = {
  receiptNumber: string;
  amountPaise: string | number;
  paymentDate: string | Date;
  paymentMethod: string;
  paymentReference: string | null;
  collectorName: string | null;
};

function dateValue(value: string | Date): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

function dateTimeValue(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapPaymentHistory(value: InvoiceRow["payments"]): InvoicePaymentRow[] {
  const payments = typeof value === "string" ? JSON.parse(value) as InvoicePaymentRow[] : value ?? [];
  return payments.map((payment) => ({
    receiptNumber: payment.receiptNumber,
    amountPaise: Number(payment.amountPaise),
    paymentDate: dateValue(payment.paymentDate),
    paymentMethod: payment.paymentMethod,
    paymentReference: payment.paymentReference ?? null,
    collectorName: payment.collectorName ?? null,
  }));
}

const paymentHistoryJoin = `
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(recorded.amount_paise), 0)::text AS paid_paise,
           (ARRAY_AGG(recorded.receipt_number ORDER BY recorded.received_on DESC, recorded.captured_at DESC, recorded.id DESC))[1] AS receipt_number,
           MAX(recorded.captured_at) AS paid_at,
           COALESCE(
             JSONB_AGG(
               JSONB_BUILD_OBJECT(
                 'receiptNumber', recorded.receipt_number,
                 'amountPaise', recorded.amount_paise,
                 'paymentDate', TO_CHAR(recorded.received_on, 'YYYY-MM-DD'),
                 'paymentMethod', COALESCE(recorded.payment_method, recorded.gateway),
                  'paymentReference', recorded.payment_reference,
                  'collectorName', CASE WHEN recorded.gateway = 'manual' THEN collector.name ELSE NULL END
               )
               ORDER BY recorded.received_on DESC, recorded.captured_at DESC, recorded.id DESC
             ),
             '[]'::jsonb
           ) AS payments
      FROM fees.payments recorded
       LEFT JOIN identity.users collector
         ON collector.org_id = recorded.org_id AND collector.id = recorded.received_by
     WHERE recorded.org_id = i.org_id
       AND recorded.invoice_id = i.id
       AND recorded.status = 'captured'
  ) payment ON true`;

function mapInvoice(row: InvoiceRow, canPay = false, includeConcessionReason = false) {
  const amountPaise = Number(row.amount_paise);
  const concessionPaise = Number(row.concession_paise);
  const paidPaise = Number(row.paid_paise ?? 0);
  return {
    id: row.id,
    studentId: row.student_user_id,
    studentName: row.student_name,
    sectionId: row.section_id,
    invoiceNumber: row.invoice_number,
    academicYear: row.academic_year,
    period: row.period,
    description: row.description,
    amountPaise,
    concessionPaise,
    paidPaise,
    balancePaise: row.status === "unpaid"
      ? Math.max(0, amountPaise - concessionPaise - paidPaise)
      : 0,
    ...(includeConcessionReason ? { concessionReason: row.concession_reason ?? null } : {}),
    dueDate: dateValue(row.due_date),
    status: row.status,
    receiptNumber: row.receipt_number,
    paidAt: dateTimeValue(row.paid_at),
    canPay,
    payments: mapPaymentHistory(row.payments),
  };
}

const routes: FastifyPluginAsync = async (fastify) => {
  const router = createRouteRegistrar(fastify);

  router.get("/fees/invoices", requireAuth, async (req, res, next) => {
    const user = req.campusUser;
    if (!user) return void res.status(401).json(errorBody("UNAUTHENTICATED", "Sign in to continue."));
    if (!user.roles.some((role) => adminRoles.includes(role))) {
      return void res.status(403).json(errorBody("FORBIDDEN", "Administrator role required."));
    }
    const parsed = GetFeeInvoicesQueryParams.safeParse(req.query);
    if (!parsed.success) return void res.status(400).json(errorBody("INVALID_REQUEST", "Provide valid invoice pagination."));
    const limit = parsed.data.limit ?? 50;
    const offset = parsed.data.offset ?? 0;

    try {
      const page = await withOrg(user.orgId, async (client) => {
        const count = await client.query<{ total: string }>(
          "SELECT COUNT(*)::text AS total FROM fees.invoices WHERE org_id = $1",
          [user.orgId],
        );
        const invoices = await client.query<InvoiceRow>(
          `SELECT i.id, i.student_user_id, student.name AS student_name, i.section_id,
                  i.invoice_number, i.academic_year, i.period, i.description, i.amount_paise,
                  i.concession_paise, i.concession_reason,
                   i.due_date, i.status, payment.paid_paise,
                   payment.receipt_number, payment.paid_at, payment.payments
             FROM fees.invoices i
             JOIN identity.users student
               ON student.org_id = i.org_id AND student.id = i.student_user_id
              ${paymentHistoryJoin}
            WHERE i.org_id = $1
            ORDER BY i.created_at DESC, i.id DESC
            LIMIT $2 OFFSET $3`,
          [user.orgId, limit, offset],
        );
        return {
          items: invoices.rows.map((row) => mapInvoice(row, false, true)),
          total: Number(count.rows[0]?.total ?? 0),
        };
      });
      res.json(page);
    } catch (error) {
      next(error);
    }
  });

  router.post("/fees/invoices/generate", requireAuth, async (req, res, next) => {
    const user = req.campusUser;
    if (!user) return void res.status(401).json(errorBody("UNAUTHENTICATED", "Sign in to continue."));
    if (!user.roles.some((role) => adminRoles.includes(role))) {
      return void res.status(403).json(errorBody("FORBIDDEN", "Administrator role required."));
    }
    const parsed = GenerateFeeInvoicesBody.safeParse(req.body);
    if (!parsed.success) return void res.status(400).json(errorBody("INVALID_REQUEST", "Provide valid invoice details."));
    const input = parsed.data;

    try {
      const result = await withOrg(user.orgId, async (client) => {
        let targetSectionIds: string[];
        if (input.classId) {
          const classSections = await client.query<{ section_id: string | null }>(
            `SELECT s.id AS section_id
               FROM academic.classes c
               LEFT JOIN academic.sections s
                 ON s.org_id = c.org_id AND s.class_id = c.id
              WHERE c.org_id = $1 AND c.id = $2
              ORDER BY s.name`,
            [user.orgId, input.classId],
          );
          if (!classSections.rowCount) return { kind: "class_missing" as const };
          targetSectionIds = classSections.rows
            .map((row) => row.section_id)
            .filter((sectionId): sectionId is string => sectionId !== null);
        } else {
          const section = await client.query<{ id: string }>(
            "SELECT id FROM academic.sections WHERE org_id = $1 AND id = $2",
            [user.orgId, input.sectionId],
          );
          if (!section.rowCount) return { kind: "section_missing" as const };
          targetSectionIds = section.rows.map((row) => row.id);
        }
        if (!targetSectionIds.length) return { kind: "no_students" as const };

        const students = await client.query<{ student_user_id: string; section_id: string }>(
          `WITH current_enrollments AS (
             SELECT DISTINCT ON (e.org_id, e.student_user_id)
                    e.org_id, e.student_user_id, e.section_id, e.academic_year
               FROM academic.enrollments e
              WHERE e.org_id = $1 AND e.status = 'active'
              ORDER BY e.org_id, e.student_user_id, e.academic_year DESC, e.created_at DESC, e.id DESC
           )
           SELECT e.student_user_id, e.section_id
             FROM current_enrollments e
             JOIN identity.users student
               ON student.org_id = e.org_id AND student.id = e.student_user_id
            WHERE e.org_id = $1 AND e.section_id = ANY($2::uuid[])
              AND e.academic_year = $3 AND student.status = 'active'
            ORDER BY e.student_user_id`,
          [user.orgId, targetSectionIds, input.academicYear],
        );
        if (!students.rowCount) return { kind: "no_students" as const };
        const studentIds = students.rows.map((row) => row.student_user_id);

        const existing = await client.query<{
          student_user_id: string;
          section_id: string;
          description: string;
          amount_paise: string | number;
          due_date: string | Date;
        }>(
          `SELECT student_user_id, section_id, description, amount_paise, due_date
             FROM fees.invoices
            WHERE org_id = $1 AND student_user_id = ANY($2::uuid[])
              AND academic_year = $3 AND period = $4
            FOR UPDATE`,
          [user.orgId, studentIds, input.academicYear, input.period],
        );
        const matchesInput = existing.rows.every((invoice) =>
          targetSectionIds.includes(invoice.section_id)
          && invoice.description === input.description.trim()
          && Number(invoice.amount_paise) === input.amountPaise
          && dateValue(invoice.due_date) === dateValue(input.dueDate),
        );
        if (!matchesInput) return { kind: "invoice_conflict" as const };

        let generatedCount = 0;
        for (const student of students.rows) {
          const inserted = await client.query(
            `INSERT INTO fees.invoices
               (org_id, student_user_id, section_id, invoice_number, academic_year, period,
                description, amount_paise, due_date, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             ON CONFLICT (org_id, student_user_id, academic_year, period) DO NOTHING`,
            [
              user.orgId,
              student.student_user_id,
              student.section_id,
              `INV-${randomUUID().slice(0, 12).toUpperCase()}`,
              input.academicYear,
              input.period,
              input.description.trim(),
              input.amountPaise,
              dateValue(input.dueDate),
              user.id,
            ],
          );
          generatedCount += inserted.rowCount ?? 0;
        }

        const rows = await client.query<InvoiceRow>(
          `SELECT i.id, i.student_user_id, student.name AS student_name, i.section_id,
                  i.invoice_number, i.academic_year, i.period, i.description, i.amount_paise,
                  i.concession_paise,
                   i.due_date, i.status, payment.paid_paise,
                   payment.receipt_number, payment.paid_at, payment.payments
             FROM fees.invoices i
             JOIN identity.users student
               ON student.org_id = i.org_id AND student.id = i.student_user_id
              ${paymentHistoryJoin}
            WHERE i.org_id = $1 AND i.student_user_id = ANY($2::uuid[])
              AND i.academic_year = $3 AND i.period = $4
            ORDER BY student.name, i.id`,
          [user.orgId, studentIds, input.academicYear, input.period],
        );
        const allInvoicesMatch = rows.rows.every((invoice) =>
          targetSectionIds.includes(invoice.section_id)
          && invoice.description === input.description.trim()
          && Number(invoice.amount_paise) === input.amountPaise
          && dateValue(invoice.due_date) === dateValue(input.dueDate),
        );
        if (!allInvoicesMatch || (rows.rowCount ?? 0) !== studentIds.length) {
          const conflict = new Error("Invoice generation conflicted with a concurrent request.") as Error & { code: string };
          conflict.code = "FEE_INVOICE_CONFLICT";
          throw conflict;
        }
        return {
          kind: "ok" as const,
          generatedCount,
          items: rows.rows.map((row) => mapInvoice(row)),
        };
      });

      if (result.kind === "section_missing") return void res.status(404).json(errorBody("NOT_FOUND", "Section not found."));
      if (result.kind === "class_missing") return void res.status(404).json(errorBody("NOT_FOUND", "Class not found."));
      if (result.kind === "no_students") return void res.status(409).json(errorBody("NO_ACTIVE_STUDENTS", "No active students are enrolled in the selected class or section for that academic year."));
      if (result.kind === "invoice_conflict") return void res.status(409).json(errorBody("INVOICE_CONFLICT", "An invoice already exists for one or more students in this academic year and billing period with different details. Check Recent invoices."));
      res.json({ generatedCount: result.generatedCount, total: result.items.length, items: result.items });
    } catch (error) {
      if (["23505", "FEE_INVOICE_CONFLICT"].includes((error as { code?: string })?.code ?? "")) {
        return void res.status(409).json(errorBody("INVOICE_CONFLICT", "An invoice was issued for this academic year and billing period while this request was processing. Check Recent invoices."));
      }
      next(error);
    }
  });

  router.patch("/fees/invoices/:invoiceId/concession", requireAuth, async (req, res, next) => {
    const user = req.campusUser;
    if (!user) return void res.status(401).json(errorBody("UNAUTHENTICATED", "Sign in to continue."));
    if (!user.roles.some((role) => adminRoles.includes(role))) {
      return void res.status(403).json(errorBody("FORBIDDEN", "Administrator role required."));
    }
    const params = UpdateFeeInvoiceConcessionParams.safeParse(req.params);
    const body = UpdateFeeInvoiceConcessionBody.safeParse(req.body);
    if (!params.success || !body.success) {
      return void res.status(400).json(errorBody("INVALID_REQUEST", "Provide a valid concession amount and reason."));
    }
    const reason = body.data.reason.trim();
    if (reason.length < 3) {
      return void res.status(400).json(errorBody("INVALID_REQUEST", "The concession reason must contain at least 3 non-space characters."));
    }

    try {
      const result = await withOrg(user.orgId, async (client) => {
        const invoiceResult = await client.query<InvoiceRow>(
          `SELECT i.id, i.student_user_id, student.name AS student_name, i.section_id,
                  i.invoice_number, i.academic_year, i.period, i.description, i.amount_paise,
                  i.concession_paise, i.concession_reason, i.due_date, i.status,
                   payment.paid_paise, payment.receipt_number,
                   payment.paid_at, payment.payments
             FROM fees.invoices i
             JOIN identity.users student
               ON student.org_id = i.org_id AND student.id = i.student_user_id
              ${paymentHistoryJoin}
            WHERE i.org_id = $1 AND i.id = $2
            FOR UPDATE OF i`,
          [user.orgId, params.data.invoiceId],
        );
        const invoice = invoiceResult.rows[0];
        if (!invoice) return { kind: "missing" as const };
        if (invoice.status === "paid") return { kind: "paid" as const };
        if (invoice.status === "void") return { kind: "void" as const };

        const payments = await client.query<{ paid_paise: string }>(
          `SELECT COALESCE(SUM(amount_paise), 0)::text AS paid_paise
             FROM fees.payments
            WHERE org_id = $1 AND invoice_id = $2 AND status = 'captured'`,
          [user.orgId, invoice.id],
        );
        const amountPaise = Number(invoice.amount_paise);
        const paidPaise = Number(payments.rows[0]?.paid_paise ?? 0);
        const concessionBalance = calculateConcessionBalance(amountPaise, paidPaise, body.data.concessionPaise);
        if (!concessionBalance) {
          return { kind: "exceeds_balance" as const };
        }

        const previousConcessionPaise = Number(invoice.concession_paise);
        const concessionReason = body.data.concessionPaise === 0 ? null : reason;
        if (
          previousConcessionPaise === body.data.concessionPaise
          && (invoice.concession_reason ?? null) === concessionReason
        ) {
          return { kind: "ok" as const, invoice };
        }
        const status = concessionBalance.status;
        await client.query(
          `UPDATE fees.invoices
              SET concession_paise = $3, concession_reason = $4, status = $5
            WHERE org_id = $1 AND id = $2`,
          [user.orgId, invoice.id, body.data.concessionPaise, concessionReason, status],
        );
        await client.query(
          `INSERT INTO fees.invoice_concession_audit
             (org_id, invoice_id, previous_concession_paise, new_concession_paise,
              previous_reason, new_reason, reason, actor_user_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            user.orgId,
            invoice.id,
            previousConcessionPaise,
            body.data.concessionPaise,
            invoice.concession_reason ?? null,
            concessionReason,
            reason,
            user.id,
          ],
        );
        return {
          kind: "ok" as const,
          invoice: {
            ...invoice,
            concession_paise: body.data.concessionPaise,
            concession_reason: concessionReason,
            status,
          },
        };
      });

      if (result.kind === "missing") return void res.status(404).json(errorBody("NOT_FOUND", "Invoice not found."));
      if (result.kind === "paid") return void res.status(409).json(errorBody("CONCESSION_AFTER_PAYMENT", "A concession cannot be changed after payment has been recorded."));
      if (result.kind === "void") return void res.status(409).json(errorBody("INVOICE_VOID", "A void invoice cannot be changed."));
      if (result.kind === "exceeds_balance") {
        return void res.status(409).json(errorBody("CONCESSION_EXCEEDS_BALANCE", "The concession cannot exceed the unpaid balance."));
      }
      res.json(mapInvoice(result.invoice, false, true));
    } catch (error) {
      next(error);
    }
  });

  router.get("/fees/invoices/:invoiceId/concession-history", requireAuth, async (req, res, next) => {
    const user = req.campusUser;
    if (!user) return void res.status(401).json(errorBody("UNAUTHENTICATED", "Sign in to continue."));
    if (!user.roles.some((role) => adminRoles.includes(role))) {
      return void res.status(403).json(errorBody("FORBIDDEN", "Administrator role required."));
    }
    const params = UpdateFeeInvoiceConcessionParams.safeParse(req.params);
    if (!params.success) return void res.status(400).json(errorBody("INVALID_REQUEST", "Provide a valid invoice ID."));

    try {
      const result = await withOrg(user.orgId, async (client) => {
        const invoice = await client.query<{ id: string }>(
          "SELECT id FROM fees.invoices WHERE org_id = $1 AND id = $2",
          [user.orgId, params.data.invoiceId],
        );
        if (!invoice.rowCount) return null;

        const history = await client.query<{
          id: string;
          previous_concession_paise: string | number;
          new_concession_paise: string | number;
          reason: string;
          actor_name: string;
          created_at: Date | string;
        }>(
          `SELECT audit.id, audit.previous_concession_paise, audit.new_concession_paise,
                  audit.reason, actor.name AS actor_name, audit.created_at
             FROM fees.invoice_concession_audit audit
             JOIN identity.users actor
               ON actor.org_id = audit.org_id AND actor.id = audit.actor_user_id
            WHERE audit.org_id = $1 AND audit.invoice_id = $2
            ORDER BY audit.created_at DESC, audit.id DESC`,
          [user.orgId, params.data.invoiceId],
        );
        return history.rows.map((entry) => ({
          id: entry.id,
          previousConcessionPaise: Number(entry.previous_concession_paise),
          newConcessionPaise: Number(entry.new_concession_paise),
          reason: entry.reason,
          actorName: entry.actor_name,
          createdAt: dateTimeValue(entry.created_at)!,
        }));
      });

      if (result === null) return void res.status(404).json(errorBody("NOT_FOUND", "Invoice not found."));
      res.json({ items: result });
    } catch (error) {
      next(error);
    }
  });

  router.get("/fees/my-invoices", requireAuth, async (req, res, next) => {
    const user = req.campusUser;
    if (!user) return void res.status(401).json(errorBody("UNAUTHENTICATED", "Sign in to continue."));
    const isParent = user.roles.includes("parent");
    const isStudent = user.roles.includes("student");
    if (!isParent && !isStudent) {
      return void res.status(403).json(errorBody("FORBIDDEN", "Student or parent access required."));
    }

    try {
      const query = buildMyFeeInvoiceQuery(isParent ? "parent" : "student", user.orgId, user.id);
      const items = await withOrg(user.orgId, (client) =>
        client.query<InvoiceRow>(query.text, [...query.values]),
      );
      res.json({
        items: items.rows.map((row) => mapInvoice(
          row,
          query.scope === "parent" &&
            process.env.ENABLE_ONLINE_PAYMENTS !== "false" &&
            canParentPayInvoice(row.can_pay === true, row.status, process.env.NODE_ENV),
        )),
        total: items.rowCount ?? 0,
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/fees/invoices/:invoiceId/payments", requireAuth, async (req, res, next) => {
    const user = req.campusUser;
    if (!user) return void res.status(401).json(errorBody("UNAUTHENTICATED", "Sign in to continue."));
    if (!canRecordManualFeePayment(user.roles)) {
      return void res.status(403).json(errorBody("FORBIDDEN", "Administrator role required."));
    }

    const params = RecordManualFeePaymentParams.safeParse(req.params);
    const body = RecordManualFeePaymentBody.safeParse(req.body);
    const idempotencyKey = z.string().uuid().safeParse(req.headers["idempotency-key"]);
    if (!params.success || !body.success || !idempotencyKey.success) {
      return void res.status(400).json(errorBody("INVALID_REQUEST", "Provide a valid payment amount, method, date, and Idempotency-Key."));
    }

    const reference = body.data.reference?.trim() || null;
    try {
      const result = await withOrg(user.orgId, async (client) => {
        const invoiceResult = await client.query<{
          id: string;
          invoice_number: string;
          amount_paise: string | number;
          concession_paise: string | number;
          status: "unpaid" | "paid" | "waived" | "void";
        }>(
          `SELECT id, invoice_number, amount_paise, concession_paise, status
             FROM fees.invoices
            WHERE org_id = $1 AND id = $2
            FOR UPDATE`,
          [user.orgId, params.data.invoiceId],
        );
        const invoice = invoiceResult.rows[0];
        if (!invoice) return { kind: "missing" as const };

        const paymentKey = `MANUAL:${idempotencyKey.data}`;
        const existing = await client.query<{
          invoice_id: string;
          amount_paise: string | number;
          receipt_number: string;
          status: string;
          captured_at: Date;
          received_on: string | Date;
          payment_method: string | null;
        }>(
          `SELECT invoice_id, amount_paise, receipt_number, status, captured_at,
                  received_on, payment_method
             FROM fees.payments
            WHERE org_id = $1 AND gateway_payment_id = $2`,
          [user.orgId, paymentKey],
        );
        const previous = existing.rows[0];
        if (previous) {
          if (previous.invoice_id !== invoice.id || previous.status !== "captured") {
            return { kind: "idempotency_conflict" as const };
          }
          const paid = await client.query<{ paid_paise: string }>(
            `SELECT COALESCE(SUM(amount_paise), 0)::text AS paid_paise
               FROM fees.payments
              WHERE org_id = $1 AND invoice_id = $2 AND status = 'captured'`,
            [user.orgId, invoice.id],
          );
          const balancePaise = Math.max(
            0,
            Number(invoice.amount_paise) - Number(invoice.concession_paise) - Number(paid.rows[0]?.paid_paise ?? 0),
          );
          return {
            kind: "ok" as const,
            invoiceId: invoice.id,
            invoiceNumber: invoice.invoice_number,
            amountPaise: Number(previous.amount_paise),
            status: invoice.status,
            balancePaise,
            receiptNumber: previous.receipt_number,
            paidAt: dateTimeValue(previous.captured_at)!,
            paymentDate: dateValue(previous.received_on),
            paymentMethod: previous.payment_method ?? "other",
          };
        }

        const paymentTotals = await client.query<{ paid_paise: string }>(
          `SELECT COALESCE(SUM(amount_paise), 0)::text AS paid_paise
             FROM fees.payments
            WHERE org_id = $1 AND invoice_id = $2 AND status = 'captured'`,
          [user.orgId, invoice.id],
        );
        const decision = evaluateManualFeePayment({
          invoiceStatus: invoice.status,
          amountPaise: Number(invoice.amount_paise),
          concessionPaise: Number(invoice.concession_paise),
          paidPaise: Number(paymentTotals.rows[0]?.paid_paise ?? 0),
          paymentPaise: body.data.amountPaise,
        });
        if (decision.kind === "invalid_amount") return { kind: "invalid_amount" as const };
        if (decision.kind === "exceeds_balance") {
          return { kind: "exceeds_balance" as const, balancePaise: decision.balancePaise };
        }
        if (decision.kind === "not_payable") {
          return { kind: "not_payable" as const, invoiceStatus: decision.invoiceStatus };
        }

        const receiptNumber = `RCT-${randomUUID().slice(0, 12).toUpperCase()}`;
        const payment = await client.query<{ captured_at: Date; received_on: string | Date }>(
          `INSERT INTO fees.payments
             (org_id, invoice_id, amount_paise, gateway, gateway_payment_id,
              receipt_number, received_by, payment_method, payment_reference, received_on)
           VALUES ($1, $2, $3, 'manual', $4, $5, $6, $7, $8, $9)
           RETURNING captured_at, received_on`,
          [
            user.orgId,
            invoice.id,
            body.data.amountPaise,
            paymentKey,
            receiptNumber,
            user.id,
            body.data.paymentMethod,
            reference,
            dateValue(body.data.receivedOn),
          ],
        );
        await client.query(
          `UPDATE fees.invoices
              SET status = $3,
                  paid_at = CASE WHEN $3 = 'paid' THEN now() ELSE NULL END
            WHERE org_id = $1 AND id = $2`,
          [user.orgId, invoice.id, decision.nextStatus],
        );
        return {
          kind: "ok" as const,
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoice_number,
          amountPaise: body.data.amountPaise,
          status: decision.nextStatus,
          balancePaise: decision.balanceAfterPaise,
          receiptNumber,
          paidAt: dateTimeValue(payment.rows[0]!.captured_at)!,
          paymentDate: dateValue(payment.rows[0]!.received_on),
          paymentMethod: body.data.paymentMethod,
        };
      });

      if (result.kind === "missing") return void res.status(404).json(errorBody("NOT_FOUND", "Invoice not found."));
      if (result.kind === "idempotency_conflict") {
        return void res.status(409).json(errorBody("IDEMPOTENCY_KEY_REUSED", "This Idempotency-Key was already used for a different or unsuccessful payment."));
      }
      if (result.kind === "invalid_amount") {
        return void res.status(400).json(errorBody("INVALID_REQUEST", "Enter a positive amount in whole paise."));
      }
      if (result.kind === "exceeds_balance") {
        return void res.status(409).json(errorBody(
          "PAYMENT_EXCEEDS_BALANCE",
          `Payment exceeds the current unpaid balance of ₹${(result.balancePaise / 100).toFixed(2)}.`,
        ));
      }
      if (result.kind === "not_payable") {
        const status = result.invoiceStatus;
        return void res.status(409).json(errorBody(
          status === "void" ? "INVOICE_VOID" : status === "waived" ? "INVOICE_WAIVED" : "INVOICE_SETTLED",
          status === "void"
            ? "This invoice can no longer be paid."
            : status === "waived"
              ? "This invoice has no balance because it was fully covered by a concession."
              : "This invoice has no unpaid balance.",
        ));
      }
      const { kind: _kind, ...response } = result;
      res.json(response);
    } catch (error) {
      if ((error as { code?: string })?.code === "23505") {
        return void res.status(409).json(errorBody("PAYMENT_CONFLICT", "This payment was already recorded. Refresh the invoice before trying again."));
      }
      next(error);
    }
  });

  router.post("/fees/invoices/:invoiceId/pay", requireAuth, async (req, res, next) => {
    const user = req.campusUser;
    if (!user) return void res.status(401).json(errorBody("UNAUTHENTICATED", "Sign in to continue."));
    if (!user.roles.includes("parent")) {
      return void res.status(403).json(errorBody("FORBIDDEN", "Parent access required."));
    }
    if (!isMockPaymentEnvironment(process.env.NODE_ENV)) {
      return void res.status(503).json(errorBody("PAYMENTS_UNAVAILABLE", "Online payments are not configured for this environment."));
    }
    const params = PayFeeInvoiceParams.safeParse(req.params);
    if (!params.success) return void res.status(400).json(errorBody("INVALID_REQUEST", "Provide a valid invoice ID."));

    try {
      const result = await withOrg(user.orgId, async (client) => {
        const invoice = await client.query<{
          id: string;
          invoice_number: string;
          amount_paise: string | number;
          concession_paise: string | number;
          status: "unpaid" | "paid" | "waived" | "void";
          can_pay_fees: boolean;
        }>(
          `SELECT i.id, i.invoice_number, i.amount_paise, i.concession_paise, i.status, guardian.can_pay_fees
             FROM fees.invoices i
             JOIN identity.guardian_links guardian
               ON guardian.org_id = i.org_id AND guardian.student_user_id = i.student_user_id
            WHERE i.org_id = $1 AND i.id = $2 AND guardian.guardian_user_id = $3
            FOR UPDATE OF i`,
          [user.orgId, params.data.invoiceId, user.id],
        );
        const row = invoice.rows[0];
        if (!row) return { kind: "missing" as const };
        if (!row.can_pay_fees) return { kind: "forbidden" as const };
        if (row.status === "void") return { kind: "void" as const };
        if (row.status === "waived") return { kind: "waived" as const };

        if (row.status === "paid") {
          const payment = await client.query<{
            receipt_number: string;
            amount_paise: string | number;
            captured_at: Date;
          }>(
            `SELECT receipt_number, amount_paise, captured_at
               FROM fees.payments
              WHERE org_id = $1 AND invoice_id = $2 AND status = 'captured'
              ORDER BY received_on DESC, captured_at DESC, id DESC
              LIMIT 1`,
            [user.orgId, row.id],
          );
          const previous = payment.rows[0];
          if (!previous) throw new Error("Paid invoice is missing its captured payment record.");
          return {
            kind: "paid" as const,
            invoiceId: row.id,
            invoiceNumber: row.invoice_number,
            amountPaise: Number(previous.amount_paise),
            receiptNumber: previous.receipt_number,
            paidAt: dateTimeValue(previous.captured_at)!,
          };
        }

        const priorPayments = await client.query<{ paid_paise: string }>(
          `SELECT COALESCE(SUM(amount_paise), 0)::text AS paid_paise
             FROM fees.payments
            WHERE org_id = $1 AND invoice_id = $2 AND status = 'captured'`,
          [user.orgId, row.id],
        );
        const amountToCollect = Math.max(
          0,
          Number(row.amount_paise) - Number(row.concession_paise) - Number(priorPayments.rows[0]?.paid_paise ?? 0),
        );
        if (amountToCollect === 0) return { kind: "settled" as const };

        const receiptNumber = `RCT-${randomUUID().slice(0, 12).toUpperCase()}`;
        await client.query(
          `INSERT INTO fees.payments
             (org_id, invoice_id, amount_paise, gateway, gateway_payment_id,
              receipt_number, received_by)
           VALUES ($1, $2, $3, 'mock', $4, $5, $6)`,
          [
            user.orgId,
            row.id,
            amountToCollect,
            `MOCK-${randomUUID()}`,
            receiptNumber,
            user.id,
          ],
        );
        const updated = await client.query<{ paid_at: Date }>(
          `UPDATE fees.invoices
              SET status = 'paid', paid_at = now()
            WHERE org_id = $1 AND id = $2 AND status = 'unpaid'
            RETURNING paid_at`,
          [user.orgId, row.id],
        );
        if (!updated.rowCount) throw new Error("Invoice payment state changed unexpectedly.");
        return {
          kind: "paid" as const,
          invoiceId: row.id,
          invoiceNumber: row.invoice_number,
          amountPaise: amountToCollect,
          receiptNumber,
          paidAt: dateTimeValue(updated.rows[0]!.paid_at)!,
        };
      });

      if (result.kind === "missing") return void res.status(404).json(errorBody("NOT_FOUND", "Invoice not found."));
      if (result.kind === "forbidden") return void res.status(403).json(errorBody("FEE_PAYMENT_DISABLED", "Fee payments are not enabled for this parent."));
      if (result.kind === "void") return void res.status(409).json(errorBody("INVOICE_VOID", "This invoice can no longer be paid."));
      if (result.kind === "waived") return void res.status(409).json(errorBody("INVOICE_WAIVED", "This invoice has no balance to pay because it was fully covered by a concession."));
      if (result.kind === "settled") return void res.status(409).json(errorBody("INVOICE_SETTLED", "This invoice has no unpaid balance."));
      res.json({
        invoiceId: result.invoiceId,
        invoiceNumber: result.invoiceNumber,
        amountPaise: result.amountPaise,
        status: "paid",
        receiptNumber: result.receiptNumber,
        paidAt: result.paidAt,
      });
    } catch (error) {
      if ((error as { code?: string })?.code === "23505") {
        return void res.status(409).json(errorBody("PAYMENT_CONFLICT", "This invoice has already been paid."));
      }
      next(error);
    }
  });

  router.get("/fees/receipts/:receiptNumber", requireAuth, async (req, res, next) => {
    const user = req.campusUser;
    if (!user) return void res.status(401).json(errorBody("UNAUTHENTICATED", "Sign in to continue."));
    const params = GetFeeReceiptParams.safeParse(req.params);
    if (!params.success) return void res.status(400).json(errorBody("INVALID_REQUEST", "Provide a valid receipt number."));
    const isAdmin = user.roles.some((role) => adminRoles.includes(role));
    const isParent = user.roles.includes("parent");
    const isStudent = user.roles.includes("student");
    if (!isAdmin && !isParent && !isStudent) {
      return void res.status(403).json(errorBody("FORBIDDEN", "Receipt access is restricted to school administrators, linked parents, and the billed student."));
    }

    try {
      const result = await withOrg(user.orgId, (client) =>
        client.query<{
          receipt_number: string;
          invoice_number: string;
          student_name: string;
          description: string;
          academic_year: string;
          period: string;
          amount_paise: string | number;
          captured_at: Date;
          received_on: string | Date;
          payment_method: string | null;
          payment_reference: string | null;
          gateway: "mock" | "razorpay" | "manual";
          collector_name: string | null;
        }>(
          `SELECT payment.receipt_number, invoice.invoice_number, student.name AS student_name,
                  invoice.description, invoice.academic_year, invoice.period, payment.amount_paise,
                  payment.captured_at, payment.received_on, payment.payment_method,
                  payment.payment_reference, payment.gateway,
                  CASE WHEN payment.gateway = 'manual' THEN collector.name ELSE NULL END AS collector_name
             FROM fees.payments payment
             JOIN fees.invoices invoice
               ON invoice.org_id = payment.org_id AND invoice.id = payment.invoice_id
             JOIN identity.users student
               ON student.org_id = invoice.org_id AND student.id = invoice.student_user_id
             LEFT JOIN identity.users collector
               ON collector.org_id = payment.org_id AND collector.id = payment.received_by
            WHERE payment.org_id = $1 AND payment.receipt_number = $2
              AND ($3::boolean OR ($4::boolean AND invoice.student_user_id = $5) OR EXISTS (
                SELECT 1 FROM identity.guardian_links guardian
                 WHERE guardian.org_id = invoice.org_id
                   AND guardian.guardian_user_id = $6
                   AND guardian.student_user_id = invoice.student_user_id
              ))`,
          [user.orgId, params.data.receiptNumber, isAdmin, isStudent, user.id, user.id],
        ),
      );
      const row = result.rows[0];
      if (!row) return void res.status(404).json(errorBody("NOT_FOUND", "Receipt not found."));
      res.json({
        receiptNumber: row.receipt_number,
        invoiceNumber: row.invoice_number,
        studentName: row.student_name,
        description: row.description,
        academicYear: row.academic_year,
        period: row.period,
        amountPaise: Number(row.amount_paise),
        paidAt: dateTimeValue(row.captured_at),
          paymentDate: dateValue(row.received_on),
          paymentMethod: row.payment_method ?? row.gateway,
          paymentReference: row.payment_reference,
          collectorName: row.collector_name,
      });
    } catch (error) {
      next(error);
    }
  });
};

export default routes;
