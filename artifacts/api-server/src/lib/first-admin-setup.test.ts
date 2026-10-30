import assert from "node:assert/strict";
import test from "node:test";
import type { Pool } from "pg";
import {
  createFirstAdmin,
  getFirstAdminSetupStatus,
  isFirstAdminSetupKeyConfigured,
  matchesFirstAdminSetupKey,
} from "./first-admin-setup.ts";

const configuredKey = "a".repeat(64);
const validInput = {
  setupKey: configuredKey,
  organizationName: "St Joseph's Public School",
  organizationSlug: "st-josephs-public-school",
  name: "School Administrator",
  email: "ADMIN@EXAMPLE.EDU",
  password: "correct-horse-battery-staple",
};

function fakeDatabase(options: {
  existingOrganization?: boolean;
  existingUser?: boolean;
  organizationInsertErrorCode?: string;
} = {}) {
  const {
    existingOrganization = false,
    existingUser = false,
    organizationInsertErrorCode,
  } = options;
  const calls: Array<{ sql: string; values?: unknown[] }> = [];
  const client = {
    async query(sql: string, values?: unknown[]) {
      calls.push({ sql, values });
      if (sql.includes("FROM identity.organizations")) {
        return {
          rows: existingOrganization
            ? [{ id: "org-id", name: "St Joseph's Public School", slug: "st-josephs-public-school" }]
            : [],
          rowCount: existingOrganization ? 1 : 0,
        };
      }
      if (sql.includes("FROM identity.users LIMIT 1")) {
        return { rows: existingUser ? [{ "?column?": 1 }] : [], rowCount: existingUser ? 1 : 0 };
      }
      if (sql.includes("INSERT INTO identity.organizations")) {
        if (organizationInsertErrorCode) {
          throw Object.assign(new Error("database permission error"), { code: organizationInsertErrorCode });
        }
        return { rows: [{ id: "org-id" }], rowCount: 1 };
      }
      if (sql.includes("INSERT INTO identity.users")) {
        return { rows: [{ id: "user-id" }], rowCount: 1 };
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

test("setup keys must be long and are compared without exposing the raw value", () => {
  assert.equal(isFirstAdminSetupKeyConfigured("a".repeat(32)), false);
  assert.equal(isFirstAdminSetupKeyConfigured("a".repeat(64)), true);
  assert.equal(isFirstAdminSetupKeyConfigured("x".repeat(64)), false);
  assert.equal(matchesFirstAdminSetupKey(configuredKey, configuredKey), true);
  assert.equal(matchesFirstAdminSetupKey("b".repeat(64), configuredKey), false);
});

test("setup is disabled when no long-lived setup key is configured", async () => {
  const { database, calls } = fakeDatabase();
  assert.deepEqual(await getFirstAdminSetupStatus(database, undefined), { enabled: false });
  assert.equal(calls.length, 0);
});

test("setup can be enabled for an existing organization that has no users", async () => {
  const { database } = fakeDatabase({ existingOrganization: true });
  assert.deepEqual(await getFirstAdminSetupStatus(database, configuredKey), { enabled: true });
});

test("wrong setup key is rejected before any database access", async () => {
  const { database, calls } = fakeDatabase();
  const result = await createFirstAdmin(
    database,
    configuredKey,
    { ...validInput, setupKey: "b".repeat(64) },
    async () => "unused",
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "INVALID_SETUP_KEY");
  assert.equal(calls.length, 0);
});

test("successful setup creates one organization and its org administrator atomically", async () => {
  const { database, calls } = fakeDatabase();
  const result = await createFirstAdmin(database, configuredKey, validInput, async () => "hashed-password");

  assert.deepEqual(result, {
    ok: true,
    organizationName: "St Joseph's Public School",
    organizationSlug: "st-josephs-public-school",
    email: "admin@example.edu",
  });
  assert.ok(calls.some(({ sql }) => sql.includes("pg_advisory_xact_lock")));
  assert.ok(calls.some(({ sql, values }) => sql.includes("set_config('app.org_id'") && values?.[0] === "org-id"));
  assert.ok(calls.some(({ sql, values }) => sql.includes("INSERT INTO identity.user_roles") && values?.[2] === undefined && sql.includes("'org_admin'")));
  assert.equal(calls.at(-2)?.sql, "COMMIT");
  assert.equal(calls.at(-1)?.sql, "RELEASE");
  assert.equal(JSON.stringify(calls).includes(configuredKey), false);
});

test("a second setup is refused and rolls back without creating another account", async () => {
  const { database, calls } = fakeDatabase({ existingOrganization: true, existingUser: true });
  const result = await createFirstAdmin(database, configuredKey, validInput, async () => "hashed-password");

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "FIRST_ADMIN_SETUP_CLOSED");
  assert.ok(calls.some(({ sql }) => sql === "ROLLBACK"));
  assert.equal(calls.some(({ sql }) => sql.includes("INSERT INTO identity.users")), false);
});

test("setup reuses an existing empty organization without requiring organization creation", async () => {
  const { database, calls } = fakeDatabase({ existingOrganization: true });
  const result = await createFirstAdmin(database, configuredKey, validInput, async () => "hashed-password");

  assert.deepEqual(result, {
    ok: true,
    organizationName: "St Joseph's Public School",
    organizationSlug: "st-josephs-public-school",
    email: "admin@example.edu",
  });
  assert.equal(calls.some(({ sql }) => sql.includes("INSERT INTO identity.organizations")), false);
});

test("a missing organization insert grant returns a safe migration hint", async () => {
  const { database, calls } = fakeDatabase({ organizationInsertErrorCode: "42501" });
  const result = await createFirstAdmin(database, configuredKey, validInput, async () => "hashed-password");

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 503);
    assert.equal(result.code, "FIRST_ADMIN_DATABASE_PERMISSION");
    assert.match(result.message, /database migration/i);
  }
  assert.ok(calls.some(({ sql }) => sql === "ROLLBACK"));
});

test("invalid passwords are rejected before database access", async () => {
  const { database, calls } = fakeDatabase();
  const result = await createFirstAdmin(
    database,
    configuredKey,
    { ...validInput, password: "short" },
    async () => "unused",
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, 400);
  assert.equal(calls.length, 0);
});
