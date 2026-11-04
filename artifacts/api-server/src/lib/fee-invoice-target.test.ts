import assert from "node:assert/strict";
import test from "node:test";
import { GenerateFeeInvoicesBody } from "../../../../lib/api-zod/src/generated/api.ts";

const details = {
  academicYear: "2026-27",
  period: "Annual 2026-27",
  description: "Annual school fee",
  amountPaise: 5_000_000,
  dueDate: "2027-03-31",
};

test("invoice generation accepts whole-school targeting", () => {
  assert.equal(GenerateFeeInvoicesBody.safeParse({ ...details, schoolWide: true }).success, true);
});

test("invoice generation still accepts class and section targeting", () => {
  const id = "0d91b10a-330f-4c55-bad6-8179bcb61091";
  assert.equal(GenerateFeeInvoicesBody.safeParse({ ...details, classId: id }).success, true);
  assert.equal(GenerateFeeInvoicesBody.safeParse({ ...details, sectionId: id }).success, true);
});

test("invoice generation rejects ambiguous or false whole-school targets", () => {
  const id = "0d91b10a-330f-4c55-bad6-8179bcb61091";
  assert.equal(GenerateFeeInvoicesBody.safeParse({ ...details, schoolWide: false }).success, false);
  assert.equal(GenerateFeeInvoicesBody.safeParse({ ...details, schoolWide: true, classId: id }).success, false);
  assert.equal(GenerateFeeInvoicesBody.safeParse({ ...details, classId: id, sectionId: id }).success, false);
});
