import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const apiBase = new URL(process.env.CALENDAR_API_URL ?? "http://127.0.0.1:8080/api");
if (!["127.0.0.1", "localhost", "::1"].includes(apiBase.hostname)) {
  throw new Error("Calendar integration tests may only call a loopback API server.");
}
const devSecret = "campus-live-development-jwt-secret-not-for-production";
const createdIds = [];
let orgId = null;

function tokenFor(user) {
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
  return `${content}.${createHmac("sha256", process.env.JWT_SECRET ?? devSecret).update(content).digest("base64url")}`;
}

async function api(method, path, user, body) {
  const response = await fetch(`${apiBase.toString().replace(/\/+$/, "")}${path}`, {
    method,
    headers: {
      ...(user ? { authorization: `Bearer ${tokenFor(user)}` } : {}),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: response.status, body: parsed, text };
}

function userFrom(row, id, name, email, roles) {
  return { id: row[id], name: row[name], email: row[email], roles: row[roles], orgId, mustChangePassword: false };
}

after(async () => {
  if (orgId && createdIds.length) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.org_id', $1, true)", [orgId]);
      await client.query(
        "DELETE FROM school.calendar_events WHERE org_id=$1 AND id=ANY($2::uuid[])",
        [orgId, createdIds],
      );
      await client.query("COMMIT");
    } finally {
      client.release();
    }
  }
  await pool.end();
});

test("school calendar is visible by audience and editable only by administrators", {
  skip: process.env.RUN_CALENDAR_INTEGRATION !== "1",
  timeout: 60_000,
}, async (t) => {
  const organization = (await pool.query("SELECT id FROM identity.organizations WHERE slug='demo' LIMIT 1")).rows[0];
  if (!organization) return t.skip("A seeded organization is required.");
  orgId = organization.id;

  const client = await pool.connect();
  let people;
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.org_id', $1, true)", [orgId]);
    people = await client.query(
      `SELECT u.id, u.name, u.email, array_agg(DISTINCT ur.role ORDER BY ur.role) AS roles,
              min(e.section_id::text)::uuid AS section_id
         FROM identity.users u
         JOIN identity.user_roles ur ON ur.org_id=u.org_id AND ur.user_id=u.id
         LEFT JOIN academic.enrollments e
           ON e.org_id=u.org_id AND e.student_user_id=u.id AND e.status='active'
        WHERE u.org_id=$1
        GROUP BY u.id
       HAVING bool_or(ur.role = ANY($2::text[]))
           OR (bool_or(ur.role='student') AND count(e.section_id) > 0)
        ORDER BY u.created_at`,
      [orgId, ["super_admin", "org_admin", "campus_admin"]],
    );
    await client.query("COMMIT");
  } finally {
    client.release();
  }
  const adminRow = people.rows.find((row) => row.roles.some((role) => ["super_admin", "org_admin", "campus_admin"].includes(role)));
  const studentRow = people.rows.find((row) => row.roles.includes("student") && row.section_id);
  if (!adminRow || !studentRow) return t.skip("A seeded school administrator and enrolled student are required.");
  const admin = userFrom(adminRow, "id", "name", "email", "roles");
  const student = userFrom(studentRow, "id", "name", "email", "roles");

  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const query = `?from=${date}&to=${date}`;
  assert.equal((await api("GET", `/calendar${query}`, null)).status, 401);

  const sunday = new Date("2030-01-01T00:00:00.000Z");
  while (sunday.getUTCDay() !== 0) sunday.setUTCDate(sunday.getUTCDate() + 1);
  const sundayKey = sunday.toISOString().slice(0, 10);
  const sundayQuery = `?date=${sundayKey}`;
  const ordinarySunday = await api("GET", `/calendar/is-working-day${sundayQuery}`, student);
  assert.equal(ordinarySunday.status, 200, JSON.stringify(ordinarySunday.body));
  assert.equal(ordinarySunday.body.isWorkingDay, false);

  const makeUpDay = await api("POST", "/calendar", admin, {
    title: `Make-up school day ${randomUUID().slice(0, 8)}`,
    kind: "working_day",
    startDate: sundayKey,
    endDate: sundayKey,
    scope: "org",
  });
  assert.equal(makeUpDay.status, 201, JSON.stringify(makeUpDay.body));
  createdIds.push(makeUpDay.body.id);
  const overriddenSunday = await api("GET", `/calendar/is-working-day${sundayQuery}`, student);
  assert.equal(overriddenSunday.body.isWorkingDay, true);

  const invalidRange = await api("POST", "/calendar", admin, {
    title: "Invalid date range",
    kind: "event",
    startDate: "2026-11-05",
    endDate: "2026-11-04",
    scope: "org",
    description: "",
  });
  assert.equal(invalidRange.status, 400);

  const schoolEvent = await api("POST", "/calendar", admin, {
    title: `Calendar event ${randomUUID().slice(0, 8)}`,
    kind: "event",
    startDate: date,
    endDate: date,
    scope: "org",
    description: "Visible to the whole school.",
  });
  assert.equal(schoolEvent.status, 201, JSON.stringify(schoolEvent.body));
  createdIds.push(schoolEvent.body.id);
  assert.equal(schoolEvent.body.scope, "org");

  const studentCalendar = await api("GET", `/calendar${query}`, student);
  assert.equal(studentCalendar.status, 200, JSON.stringify(studentCalendar.body));
  assert.ok(studentCalendar.body.items.some((item) => item.id === schoolEvent.body.id));

  const studentCannotPublish = await api("POST", "/calendar", student, {
    title: "Unauthorized calendar entry",
    kind: "holiday",
    startDate: date,
    endDate: date,
    scope: "org",
  });
  assert.equal(studentCannotPublish.status, 403);

  const sectionEvent = await api("POST", "/calendar", admin, {
    title: `Section calendar event ${randomUUID().slice(0, 8)}`,
    kind: "exam",
    startDate: date,
    endDate: date,
    scope: "section",
    scopeId: studentRow.section_id,
  });
  assert.equal(sectionEvent.status, 201, JSON.stringify(sectionEvent.body));
  createdIds.push(sectionEvent.body.id);
  const refreshedStudentCalendar = await api("GET", `/calendar${query}`, student);
  assert.ok(refreshedStudentCalendar.body.items.some((item) => item.id === sectionEvent.body.id));

  const updated = await api("PUT", `/calendar/${schoolEvent.body.id}`, admin, {
    title: schoolEvent.body.title,
    kind: "holiday",
    startDate: date,
    endDate: date,
    scope: "org",
    description: "Updated calendar item.",
  });
  assert.equal(updated.status, 200, JSON.stringify(updated.body));
  assert.equal(updated.body.kind, "holiday");
  const holidayStatus = await api("GET", `/calendar/is-working-day?date=${date}`, student);
  assert.equal(holidayStatus.status, 200, JSON.stringify(holidayStatus.body));
  assert.equal(holidayStatus.body.isWorkingDay, false);

  const removed = await api("DELETE", `/calendar/${schoolEvent.body.id}`, admin);
  assert.equal(removed.status, 204);
  const afterDelete = await api("GET", `/calendar${query}`, student);
  assert.ok(afterDelete.body.items.every((item) => item.id !== schoolEvent.body.id));
});
