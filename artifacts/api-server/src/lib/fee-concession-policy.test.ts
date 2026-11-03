import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateConcessionBalance } from "./fee-concession-policy.ts";

test("a partial concession reduces only the outstanding amount", () => {
  assert.deepEqual(calculateConcessionBalance(12345, 0, 2345), {
    status: "unpaid",
    balancePaise: 10000,
  });
});

test("a concession that settles the remaining amount marks the invoice waived", () => {
  assert.deepEqual(calculateConcessionBalance(12345, 2345, 10000), {
    status: "waived",
    balancePaise: 0,
  });
});

test("a concession cannot exceed what remains after recorded payments", () => {
  assert.equal(calculateConcessionBalance(12345, 2345, 10001), null);
});

test("invalid paise values are rejected", () => {
  assert.equal(calculateConcessionBalance(12345, 0, 1.5), null);
  assert.equal(calculateConcessionBalance(12345, -1, 100), null);
});
