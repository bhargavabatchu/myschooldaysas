export type MyFeeInvoiceScope = "student" | "parent";

export function buildMyFeeInvoiceQuery(
  scope: MyFeeInvoiceScope,
  orgId: string,
  userId: string,
) {
  if (scope === "student") {
    return {
      scope,
      text: `SELECT i.id, i.student_user_id, student.name AS student_name, i.section_id,
                    i.invoice_number, i.academic_year, i.period, i.description, i.amount_paise,
                     i.concession_paise, i.due_date, i.status, payment.paid_paise,
                     payment.receipt_number, payment.paid_at, payment.payments,
                    false AS can_pay
               FROM fees.invoices i
               JOIN identity.users student
                 ON student.org_id = i.org_id AND student.id = i.student_user_id
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
                ) payment ON true
              WHERE i.org_id = $1 AND i.student_user_id = $2
              ORDER BY i.due_date, i.created_at DESC`,
      values: [orgId, userId] as const,
    };
  }

  return {
    scope,
    text: `SELECT i.id, i.student_user_id, student.name AS student_name, i.section_id,
                  i.invoice_number, i.academic_year, i.period, i.description, i.amount_paise,
                   i.concession_paise, i.due_date, i.status, payment.paid_paise,
                   payment.receipt_number, payment.paid_at, payment.payments,
                  guardian.can_pay_fees AS can_pay
             FROM identity.guardian_links guardian
             JOIN fees.invoices i
               ON i.org_id = guardian.org_id AND i.student_user_id = guardian.student_user_id
             JOIN identity.users student
               ON student.org_id = i.org_id AND student.id = i.student_user_id
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
              ) payment ON true
            WHERE guardian.org_id = $1 AND guardian.guardian_user_id = $2
            ORDER BY i.due_date, i.created_at DESC`,
    values: [orgId, userId] as const,
  };
}
