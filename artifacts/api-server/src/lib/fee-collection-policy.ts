export type FeeCollectionChannel = "cash" | "online" | "cheque" | "other" | "test";

export type FeeCollectionSummary = {
  totalPaise: number;
  paymentCount: number;
  cashPaise: number;
  cashCount: number;
  onlinePaise: number;
  onlineCount: number;
  chequePaise: number;
  chequeCount: number;
  otherPaise: number;
  otherCount: number;
  testPaise: number;
  testCount: number;
};

export function classifyFeeCollectionChannel(
  gateway: string,
  paymentMethod: string | null,
): FeeCollectionChannel {
  if (gateway === "mock") return "test";
  if (gateway === "razorpay" || paymentMethod === "upi" || paymentMethod === "bank_transfer") {
    return "online";
  }
  if (paymentMethod === "cash") return "cash";
  if (paymentMethod === "cheque") return "cheque";
  return "other";
}

export function summarizeFeeCollections(
  rows: readonly { gateway: string; payment_method: string | null; payment_count: string | number; amount_paise: string | number }[],
): FeeCollectionSummary {
  const summary: FeeCollectionSummary = {
    totalPaise: 0,
    paymentCount: 0,
    cashPaise: 0,
    cashCount: 0,
    onlinePaise: 0,
    onlineCount: 0,
    chequePaise: 0,
    chequeCount: 0,
    otherPaise: 0,
    otherCount: 0,
    testPaise: 0,
    testCount: 0,
  };
  for (const row of rows) {
    const amountPaise = Number(row.amount_paise);
    const paymentCount = Number(row.payment_count);
    const channel = classifyFeeCollectionChannel(row.gateway, row.payment_method);
    summary.totalPaise += amountPaise;
    summary.paymentCount += paymentCount;
    if (channel === "cash") {
      summary.cashPaise += amountPaise;
      summary.cashCount += paymentCount;
    } else if (channel === "online") {
      summary.onlinePaise += amountPaise;
      summary.onlineCount += paymentCount;
    } else if (channel === "cheque") {
      summary.chequePaise += amountPaise;
      summary.chequeCount += paymentCount;
    } else if (channel === "test") {
      summary.testPaise += amountPaise;
      summary.testCount += paymentCount;
    } else {
      summary.otherPaise += amountPaise;
      summary.otherCount += paymentCount;
    }
  }
  return summary;
}

export function isValidFeeCollectionDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
