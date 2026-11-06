import assert from "node:assert/strict";
import test from "node:test";
import { findAdmissionNameMatches, normalizeStudentName } from "./student-admission-policy.ts";

test("student name matching ignores case and repeated whitespace", () => {
  assert.equal(normalizeStudentName("  Asha   Rao "), "asha rao");
  const matches = findAdmissionNameMatches(
    [{ row: 1, name: "Asha Rao" }],
    [{
      name: "asha   rao",
      admissionNo: "ADM-1001",
      className: "Grade 1",
      sectionName: "A",
      academicYear: "2026-27",
    }],
  );
  assert.equal(matches.length, 1);
  assert.equal(matches[0]?.row, 1);
  assert.equal(matches[0]?.matches[0]?.admissionNo, "ADM-1001");
});

test("different names do not trigger a possible duplicate warning", () => {
  const matches = findAdmissionNameMatches(
    [{ row: 1, name: "Asha Rao" }],
    [{
      name: "Asha Roy",
      admissionNo: "ADM-1001",
      className: "Grade 1",
      sectionName: "A",
      academicYear: "2026-27",
    }],
  );
  assert.deepEqual(matches, []);
});

test("same names repeated in a CSV batch are flagged for review", () => {
  const matches = findAdmissionNameMatches(
    [{ row: 1, name: "Riya Shah" }, { row: 2, name: "riya  shah" }],
    [],
  );
  assert.equal(matches.length, 1);
  assert.equal(matches[0]?.row, 2);
  assert.equal(matches[0]?.matches[0]?.source, "same_batch");
  assert.equal(matches[0]?.matches[0]?.matchingRow, 1);
});
