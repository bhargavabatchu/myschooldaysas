import test from "node:test";
import assert from "node:assert/strict";
import { resolveDatabaseUrl } from "@workspace/db";

test("production always uses the restricted Campus Live database URL", () => {
  assert.equal(
    resolveDatabaseUrl({
      NODE_ENV: "production",
      DATABASE_URL: "postgres://platform-owner:secret@db.example.test/campus",
      CAMPUS_DATABASE_URL: "postgres://campus-runtime:secret@db.example.test/campus",
    }),
    "postgres://campus-runtime:secret@db.example.test/campus",
  );
});

test("production refuses to fall back to the platform URL", () => {
  assert.throws(
    () => resolveDatabaseUrl({
      NODE_ENV: "production",
      DATABASE_URL: "postgres://platform-owner:secret@db.example.test/campus",
    }),
    /refusing to use the platform database connection/,
  );
});

test("development keeps its existing DATABASE_URL fallback", () => {
  assert.equal(
    resolveDatabaseUrl({
      NODE_ENV: "development",
      DATABASE_URL: "postgres://campus-app:secret@localhost/campus",
    }),
    "postgres://campus-app:secret@localhost/campus",
  );
});
