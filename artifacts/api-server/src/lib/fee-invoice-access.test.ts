import assert from "node:assert/strict";
import test from "node:test";
import { buildMyFeeInvoiceQuery } from "./fee-invoice-access.ts";

test("student fee query binds results to the authenticated student's own ID", () => {
  const query = buildMyFeeInvoiceQuery("student", "org-1", "student-1");

  assert.match(query.text, /WHERE i\.org_id = \$1 AND i\.student_user_id = \$2/);
  assert.deepEqual(query.values, ["org-1", "student-1"]);
  assert.equal(query.scope, "student");
  assert.match(query.text, /false AS can_pay/);
  assert.doesNotMatch(query.text, /guardian_links/);
});

test("parent fee query stays limited to guardian-linked students", () => {
  const query = buildMyFeeInvoiceQuery("parent", "org-1", "parent-1");

  assert.match(query.text, /guardian\.guardian_user_id = \$2/);
  assert.match(query.text, /guardian\.student_user_id/);
  assert.deepEqual(query.values, ["org-1", "parent-1"]);
  assert.equal(query.scope, "parent");
});
