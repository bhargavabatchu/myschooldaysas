import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const apiBase = new URL(process.env.IDENTITY_ADMIN_API_URL ?? "http://127.0.0.1:8080/api");
if (!["127.0.0.1", "localhost", "::1"].includes(apiBase.hostname)) {
  throw new Error("Identity admin integration tests may only call a loopback API server.");
}
const developmentJwtSecret = "campus-live-development-jwt-secret-not-for-production";
let createdAccount;

async function withOrg(orgId, callback) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.org_id', $1, true)", [orgId]);
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

function createTestToken(user) {
  const secret = process.env.JWT_SECRET ?? developmentJwtSecret;
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    ...user,
    iss: "campus-live-identity",
    aud: "campus-live-web",
    iat: now,
    exp: now + 900,
    sub: user.id,
  })).toString("base64url");
  const content = `${header}.${payload}`;
  const signature = createHmac("sha256", secret).update(content).digest("base64url");
  return `${content}.${signature}`;
}

async function apiRequest(method, path, token, payload) {
  const response = await fetch(`${apiBase.toString().replace(/\/+$/, "")}${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(payload ? { "content-type": "application/json" } : {}),
    },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });
  const body = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    parsed = body;
  }
  return { status: response.status, body, json: () => parsed };
}

after(async () => {
  if (createdAccount) {
    await withOrg(createdAccount.orgId, (client) =>
      client.query(
        "DELETE FROM identity.users WHERE org_id = $1 AND id = $2 AND email = $3",
        [createdAccount.orgId, createdAccount.id, createdAccount.email],
      ),
    );
  }
  await pool.end();
});

test("school admins can list, deactivate, and restore same-school admin accounts", {
  skip: process.env.RUN_IDENTITY_ADMIN_INTEGRATION !== "1",
}, async (t) => {
  const identity = await pool.query(
    "SELECT current_database() AS database_name, current_user AS role_name",
  );
  assert.equal(identity.rows[0]?.database_name, "campus", "integration must use the local campus database");
  assert.equal(identity.rows[0]?.role_name, "campus_app", "integration must use the restricted application role");

  const organizationResult = await pool.query(
    "SELECT id FROM identity.organizations ORDER BY created_at LIMIT 1",
  );
  const organization = organizationResult.rows[0];
  if (!organization) return t.skip("No seeded school is available.");

  const accounts = await withOrg(organization.id, async (client) => {
    const adminResult = await client.query(
      `SELECT u.id, u.name, u.email,
              array_agg(role.role ORDER BY role.role) AS roles
         FROM identity.users u
         JOIN identity.user_roles role
           ON role.org_id = u.org_id AND role.user_id = u.id
        WHERE u.org_id = $1 AND role.role = 'org_admin' AND u.status = 'active'
        GROUP BY u.id
        ORDER BY u.created_at
        LIMIT 1`,
      [organization.id],
    );
    const studentResult = await client.query(
      `SELECT u.id, u.name, u.email,
              array_agg(role.role ORDER BY role.role) AS roles
         FROM identity.users u
         JOIN identity.user_roles role
           ON role.org_id = u.org_id AND role.user_id = u.id
        WHERE u.org_id = $1 AND role.role = 'student' AND u.status = 'active'
        GROUP BY u.id
        ORDER BY u.created_at
        LIMIT 1`,
      [organization.id],
    );
    return { admin: adminResult.rows[0], student: studentResult.rows[0] };
  });
  if (!accounts.admin) return t.skip("A seeded active school administrator is required.");

  const adminToken = createTestToken({
    id: accounts.admin.id,
    orgId: organization.id,
    name: accounts.admin.name,
    email: accounts.admin.email,
    roles: accounts.admin.roles,
    mustChangePassword: false,
  });
  const studentToken = accounts.student && createTestToken({
    id: accounts.student.id,
    orgId: organization.id,
    name: accounts.student.name,
    email: accounts.student.email,
    roles: accounts.student.roles,
    mustChangePassword: false,
  });

  const forbiddenList = await apiRequest("GET", "/identity/admins", studentToken);
  if (studentToken) assert.equal(forbiddenList.status, 403);

  const suffix = randomUUID().slice(0, 8);
  const created = await apiRequest("POST", "/identity/admins", adminToken, {
    name: `Integration Admin ${suffix}`,
    email: `integration-admin-${suffix}@example.test`,
  });
  assert.equal(created.status, 201, created.body);
  const createdBody = created.json();
  createdAccount = { id: createdBody.id, email: createdBody.email, orgId: organization.id };

  const activeList = await apiRequest("GET", "/identity/admins?limit=100&offset=0", adminToken);
  assert.equal(activeList.status, 200, activeList.body);
  assert.ok(activeList.json().items.some((item) => item.id === createdBody.id && item.status === "active"));

  const selfDeactivation = await apiRequest(
    "PATCH",
    `/identity/admins/${accounts.admin.id}`,
    adminToken,
    { status: "disabled" },
  );
  assert.equal(selfDeactivation.status, 409, "an administrator cannot deactivate their own account");

  const deactivated = await apiRequest(
    "PATCH",
    `/identity/admins/${createdBody.id}`,
    adminToken,
    { status: "disabled" },
  );
  assert.equal(deactivated.status, 200, deactivated.body);
  assert.equal(deactivated.json().status, "disabled");
  const blockedToken = await apiRequest("GET", "/identity/me", createTestToken({
    id: createdBody.id,
    orgId: organization.id,
    name: createdBody.name,
    email: createdBody.email,
    roles: ["org_admin"],
    mustChangePassword: true,
  }));
  assert.equal(blockedToken.status, 401, "a deactivated admin's access token is rejected immediately");

  const activeListAfterDisable = await apiRequest("GET", "/identity/admins?limit=100&offset=0", adminToken);
  assert.ok(!activeListAfterDisable.json().items.some((item) => item.id === createdBody.id));
  const allAccounts = await apiRequest("GET", "/identity/admins?includeDisabled=true&limit=100&offset=0", adminToken);
  assert.ok(allAccounts.json().items.some((item) => item.id === createdBody.id && item.status === "disabled"));

  const restored = await apiRequest(
    "PATCH",
    `/identity/admins/${createdBody.id}`,
    adminToken,
    { status: "active" },
  );
  assert.equal(restored.status, 200, restored.body);
  assert.equal(restored.json().status, "active");
});
