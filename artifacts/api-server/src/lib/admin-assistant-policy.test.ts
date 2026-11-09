import test from "node:test";
import assert from "node:assert/strict";
import { classifyAdminAssistantQuestion } from "./admin-assistant-policy.ts";

test("classifies fee collection questions and time ranges", () => {
  assert.deepEqual(classifyAdminAssistantQuestion("How much fee did we collect today?"), {
    kind: "fee_collections",
    range: "today",
  });
  assert.deepEqual(classifyAdminAssistantQuestion("Cash versus online fee collection this month"), {
    kind: "fee_collections",
    range: "month",
  });
  assert.deepEqual(classifyAdminAssistantQuestion("Total fee collection for this academic year"), {
    kind: "fee_collections",
    range: "year",
  });
});

test("classifies outstanding balances, student counts, and attendance", () => {
  assert.deepEqual(classifyAdminAssistantQuestion("Which students have overdue fees in Grade 5?"), {
    kind: "fee_outstanding",
    overdueOnly: true,
    listStudents: true,
    classTerm: "5",
  });
  assert.deepEqual(classifyAdminAssistantQuestion("How many active students are in class 4?"), {
    kind: "student_count",
    classTerm: "4",
    classBreakdown: false,
  });
  assert.deepEqual(classifyAdminAssistantQuestion("Show active student counts by class"), {
    kind: "student_count",
    classTerm: null,
    classBreakdown: true,
  });
  assert.deepEqual(classifyAdminAssistantQuestion("What is attendance today?"), {
    kind: "attendance_today",
  });
  assert.deepEqual(classifyAdminAssistantQuestion("What was attendance yesterday?"), {
    kind: "help",
  });
});

test("extracts a student search term and safely falls back for unsupported questions", () => {
  assert.deepEqual(classifyAdminAssistantQuestion("Find student Aarav Nair"), {
    kind: "student_lookup",
    term: "aarav nair",
  });
  assert.deepEqual(classifyAdminAssistantQuestion("Find student by name or admission number"), {
    kind: "student_lookup",
    term: "",
  });
  assert.deepEqual(classifyAdminAssistantQuestion("How should we change the school logo?"), {
    kind: "help",
  });
});
