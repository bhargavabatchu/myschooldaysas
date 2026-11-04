type InvoiceStatus = "unpaid" | "paid" | "waived" | "void";

type ManualFeePaymentInput = {
  invoiceStatus: InvoiceStatus;
  amountPaise: number;
  concessionPaise: number;
  paidPaise: number;
  paymentPaise: number;
};

export function canRecordManualFeePayment(roles: readonly string[]): boolean {
  return roles.some((role) => ["super_admin", "org_admin", "campus_admin"].includes(role));
}

export function evaluateManualFeePayment(input: ManualFeePaymentInput) {
  const values = [
    input.amountPaise,
    input.concessionPaise,
    input.paidPaise,
    input.paymentPaise,
  ];
  if (!values.every(Number.isSafeInteger) || input.amountPaise <= 0 || input.concessionPaise < 0 ||
      input.paidPaise < 0 || input.paymentPaise <= 0 || input.concessionPaise > input.amountPaise) {
    return { kind: "invalid_amount" as const };
  }

  const balancePaise = Math.max(
    0,
    input.amountPaise - input.concessionPaise - input.paidPaise,
  );
  if (input.invoiceStatus !== "unpaid" || balancePaise === 0) {
    return { kind: "not_payable" as const, invoiceStatus: input.invoiceStatus };
  }
  if (input.paymentPaise > balancePaise) {
    return { kind: "exceeds_balance" as const, balancePaise };
  }

  const balanceAfterPaise = balancePaise - input.paymentPaise;
  return {
    kind: "ok" as const,
    balanceBeforePaise: balancePaise,
    balanceAfterPaise,
    nextStatus: balanceAfterPaise === 0 ? "paid" as const : "unpaid" as const,
  };
}
