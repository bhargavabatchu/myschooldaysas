import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyFeeCollectionChannel,
  isValidFeeCollectionDate,
  summarizeFeeCollections,
} from "./fee-collection-policy.ts";

test("fee collections distinguish cash, digital, cheque, other, and test gateways", () => {
  assert.equal(classifyFeeCollectionChannel("manual", "cash"), "cash");
  assert.equal(classifyFeeCollectionChannel("manual", "upi"), "online");
  assert.equal(classifyFeeCollectionChannel("manual", "bank_transfer"), "online");
  assert.equal(classifyFeeCollectionChannel("razorpay", null), "online");
  assert.equal(classifyFeeCollectionChannel("manual", "cheque"), "cheque");
  assert.equal(classifyFeeCollectionChannel("manual", "other"), "other");
  assert.equal(classifyFeeCollectionChannel("mock", null), "test");
});

test("daily collection summary totals every payment and separates test payments", () => {
  const summary = summarizeFeeCollections([
    { gateway: "manual", payment_method: "cash", payment_count: "2", amount_paise: "10000" },
    { gateway: "manual", payment_method: "upi", payment_count: "1", amount_paise: "5000" },
    { gateway: "razorpay", payment_method: null, payment_count: "1", amount_paise: "8000" },
    { gateway: "manual", payment_method: "cheque", payment_count: "1", amount_paise: "3000" },
    { gateway: "manual", payment_method: "other", payment_count: "1", amount_paise: "1000" },
    { gateway: "mock", payment_method: null, payment_count: "1", amount_paise: "2000" },
  ]);
  assert.deepEqual(summary, {
    totalPaise: 29000,
    paymentCount: 7,
    cashPaise: 10000,
    cashCount: 2,
    onlinePaise: 13000,
    onlineCount: 2,
    chequePaise: 3000,
    chequeCount: 1,
    otherPaise: 1000,
    otherCount: 1,
    testPaise: 2000,
    testCount: 1,
  });
  assert.deepEqual(summarizeFeeCollections([]), {
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
  });
});

test("collection report accepts real ISO dates and rejects impossible dates", () => {
  assert.equal(isValidFeeCollectionDate("2026-11-06"), true);
  assert.equal(isValidFeeCollectionDate("2026-02-30"), false);
  assert.equal(isValidFeeCollectionDate("06-11-2026"), false);
});
