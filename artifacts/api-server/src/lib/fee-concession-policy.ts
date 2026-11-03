export type ConcessionInvoiceStatus = "unpaid" | "waived";

export function calculateConcessionBalance(
  amountPaise: number,
  paidPaise: number,
  concessionPaise: number,
): { status: ConcessionInvoiceStatus; balancePaise: number } | null {
  if (
    !Number.isSafeInteger(amountPaise)
    || !Number.isSafeInteger(paidPaise)
    || !Number.isSafeInteger(concessionPaise)
    || amountPaise <= 0
    || paidPaise < 0
    || concessionPaise < 0
    || paidPaise > amountPaise
    || concessionPaise > amountPaise - paidPaise
  ) {
    return null;
  }

  const balancePaise = amountPaise - paidPaise - concessionPaise;
  return {
    status: balancePaise === 0 ? "waived" : "unpaid",
    balancePaise,
  };
}
