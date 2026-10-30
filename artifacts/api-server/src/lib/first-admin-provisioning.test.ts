import assert from "node:assert/strict";
import test from "node:test";
import type { Pool } from "pg";
import { provisionFirstAdmin } from "./first-admin-provisioning.ts";

const validInput = {
  organizationName: "St Joseph's Public School",
  organizationSlug: "st-josephs-public-school",
  name: "School Administrator",
  email: "ADMIN@EXAMPLE.EDU",
  password: "correct-horse-battery-staple",
};

function fakeDatabase(options: {
  organizations?: Array<{ id: string; name: string; slug: string }>;
  existingUser?: boolean;
  organizationInsertErrorCode?: string;
} = {}) {
  const {
    organizations = [],
    existingUser = false,
    organizationInsertErrorCode,
  } = options;
  const calls: Array<{ sql: string; values?: unknown[] }> = [];
  const client = {
    async query(sql: string, values?: unknown[]) {
      calls.push({ sql, values });
      if (sql.includes("FROM identity.organizations")) {
        return { rows: organizations, rowCount: organizations.length };
      }
      if (sql.includes("FROM identity.users LIMIT 1")) {
        return { rows: existingUser ? [{ "?column?": 1 }] : [], rowCount: existingUser ? 1 : 0 };
      }
      if (sql.includes("INSERT INTO identity.organizations")) {
        if (organizationInsertErrorCode) {
          throw Object.assign(new Error("database permission error"), { code: organizationInsertErrorCode });
        }
        return { rows: [{ id: "new-org-id" }], rowCount: 1 };
      }
      if (sql.includes("INSERT INTO identity.users")) {
        return { rows: [{ id: "new-user-id" }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
    release() {
      calls.push({ sql: "RELEASE" });
    },
  };
  const database = {
    async connect() {
      return client;
    },
  } as unknown as Pool;
  return { database, calls };
}

test("first-admin provisioning creates the organization and org_admin in one transaction", async () => {
  const { database, calls } = fakeDatabase();
  const result = await provisionFirstAdmin(database, validInput, async () => "scrypt-hash");

  assert.deepEqual(result, {
    ok: true,
    organizationName: "St Joseph's Public School",
    organizationSlug: "st-josephs-public-school",
    email: "admin@example.edu",
  });
  assert.ok(calls.some(({ sql }) => sql.includes("pg_advisory_xact_lock")));
  assert.ok(calls.some(({ sql }) => sql.includes("set_config('app.org_id'") && sql.includes("$1")));
  assert.ok(calls.some(({ sql, values }) => sql.includes("INSERT INTO identity.users") && values?.[3] === "scrypt-hash"));
  assert.ok(calls.some(({ sql }) => sql.includes("INSERT INTO identity.user_roles") && sql.includes("'org_admin'")));
  assert.equal(calls.at(-2)?.sql, "COMMIT");
  assert.equal(calls.at(-1)?.sql, "RELEASE");
  assert.equal(JSON.stringify(calls).includes(validInput.password), false);
});

test("the script refuses to create a second first administrator", async () => {
  const { database, calls } = fakeDatabase({
    organizations: [{ id: "org-id", name: "St Joseph's Public School", slug: "st-josephs-public-school" }],
    existingUser: true,
  });
  const result = await provisionFirstAdmin(database, validInput, async () => "unused");

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "FIRST_ADMIN_ALREADY_EXISTS");
  assert.ok(calls.some(({ sql }) => sql === "ROLLBACK"));
  assert.equal(calls.some(({ sql }) => sql.includes("INSERT INTO identity.users")), false);
});

test("an existing empty organization is reused rather than duplicated", async () => {
  const { database, calls } = fakeDatabase({
    organizations: [{ id: "org-id", name: "St Joseph's Public School", slug: "st-josephs-public-school" }],
  });
  const result = await provisionFirstAdmin(database, validInput, async () => "scrypt-hash");

  assert.equal(result.ok, true);
  assert.equal(calls.some(({ sql }) => sql.includes("INSERT INTO identity.organizations")), false);
});

test("an existing database requires its exact organization ID", async () => {
  const { database } = fakeDatabase({
    organizations: [{ id: "org-id", name: "Existing School", slug: "existing-school" }],
  });
  const result = await provisionFirstAdmin(database, validInput, async () => "unused");

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "ORGANIZATION_NOT_FOUND");
});

test("a missing organization insert privilege returns the migration hint", async () => {
  const { database, calls } = fakeDatabase({ organizationInsertErrorCode: "42501" });
  const result = await provisionFirstAdmin(database, validInput, async () => "scrypt-hash");

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, "FIRST_ADMIN_DATABASE_PERMISSION");
    assert.match(result.message, /migration 003/);
  }
  assert.ok(calls.some(({ sql }) => sql === "ROLLBACK"));
});

test("invalid password length is rejected before database access", async () => {
  const { database, calls } = fakeDatabase();
  const result = await provisionFirstAdmin(
    database,
    { ...validInput, password: "short" },
    async () => "unused",
  );

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "INVALID_REQUEST");
  assert.equal(calls.length, 0);
});
