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
                    i.concession_paise, i.due_date, i.status, payment.amount_paise AS paid_paise,
                    payment.receipt_number, payment.captured_at AS paid_at,
                    false AS can_pay
               FROM fees.invoices i
               JOIN identity.users student
                 ON student.org_id = i.org_id AND student.id = i.student_user_id
               LEFT JOIN fees.payments payment
                 ON payment.org_id = i.org_id AND payment.invoice_id = i.id AND payment.status = 'captured'
              WHERE i.org_id = $1 AND i.student_user_id = $2
              ORDER BY i.due_date, i.created_at DESC`,
      values: [orgId, userId] as const,
    };
  }

  return {
    scope,
    text: `SELECT i.id, i.student_user_id, student.name AS student_name, i.section_id,
                  i.invoice_number, i.academic_year, i.period, i.description, i.amount_paise,
                  i.concession_paise, i.due_date, i.status, payment.amount_paise AS paid_paise,
                  payment.receipt_number, payment.captured_at AS paid_at,
                  guardian.can_pay_fees AS can_pay
             FROM identity.guardian_links guardian
             JOIN fees.invoices i
               ON i.org_id = guardian.org_id AND i.student_user_id = guardian.student_user_id
             JOIN identity.users student
               ON student.org_id = i.org_id AND student.id = i.student_user_id
             LEFT JOIN fees.payments payment
               ON payment.org_id = i.org_id AND payment.invoice_id = i.id AND payment.status = 'captured'
            WHERE guardian.org_id = $1 AND guardian.guardian_user_id = $2
            ORDER BY i.due_date, i.created_at DESC`,
    values: [orgId, userId] as const,
  };
}
