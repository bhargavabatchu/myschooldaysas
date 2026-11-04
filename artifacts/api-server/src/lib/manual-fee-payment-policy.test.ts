import assert from "node:assert/strict";
import test from "node:test";
import { canRecordManualFeePayment, evaluateManualFeePayment } from "./manual-fee-payment-policy.ts";

test("only school administrator roles can record manual payments", () => {
  assert.equal(canRecordManualFeePayment(["campus_admin"]), true);
  assert.equal(canRecordManualFeePayment(["org_admin"]), true);
  assert.equal(canRecordManualFeePayment(["parent"]), false);
  assert.equal(canRecordManualFeePayment(["student"]), false);
  assert.equal(canRecordManualFeePayment(["teacher"]), false);
});

test("partial payment reduces only the remaining balance", () => {
  assert.deepEqual(evaluateManualFeePayment({
    invoiceStatus: "unpaid",
    amountPaise: 10_000,
    concessionPaise: 1_000,
    paidPaise: 2_500,
    paymentPaise: 3_000,
  }), {
    kind: "ok",
    balanceBeforePaise: 6_500,
    balanceAfterPaise: 3_500,
    nextStatus: "unpaid",
  });
});

test("payment of the exact remaining balance settles the invoice", () => {
  assert.deepEqual(evaluateManualFeePayment({
    invoiceStatus: "unpaid",
    amountPaise: 10_000,
    concessionPaise: 1_000,
    paidPaise: 2_500,
    paymentPaise: 6_500,
  }), {
    kind: "ok",
    balanceBeforePaise: 6_500,
    balanceAfterPaise: 0,
    nextStatus: "paid",
  });
});

test("payment cannot exceed the current balance", () => {
  assert.deepEqual(evaluateManualFeePayment({
    invoiceStatus: "unpaid",
    amountPaise: 10_000,
    concessionPaise: 1_000,
    paidPaise: 2_500,
    paymentPaise: 6_501,
  }), { kind: "exceeds_balance", balancePaise: 6_500 });
});

test("settled, waived, and void invoices cannot accept another payment", () => {
  for (const invoiceStatus of ["paid", "waived", "void"] as const) {
    assert.deepEqual(evaluateManualFeePayment({
      invoiceStatus,
      amountPaise: 10_000,
      concessionPaise: 0,
      paidPaise: 10_000,
      paymentPaise: 1,
    }), { kind: "not_payable", invoiceStatus });
  }
});

test("invalid paise values are rejected", () => {
  assert.deepEqual(evaluateManualFeePayment({
    invoiceStatus: "unpaid",
    amountPaise: 10_000,
    concessionPaise: 0,
    paidPaise: 0,
    paymentPaise: 1.5,
  }), { kind: "invalid_amount" });
});
