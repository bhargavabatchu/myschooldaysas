import assert from "node:assert/strict";
import { test } from "node:test";
import type { FastifyRequest } from "fastify";
import {
  clearSessionCookies,
  createCsrfToken,
  createRefreshCredential,
  createSessionCookies,
  hashRefreshSecret,
  hasValidCsrfToken,
  matchesRefreshSecret,
  readRefreshCredential,
  REMEMBERED_SESSION_SECONDS,
} from "./auth-sessions.ts";

const orgId = "b7e0e0e0-3c3a-4f78-9c86-000000000001";
const sessionId = "a8d0d0d0-3c3a-4f78-9c86-000000000001";

test("remembered session cookies are HttpOnly, same-site, secure, and expire in 30 days", () => {
  const credential = createRefreshCredential(orgId, sessionId);
  const csrf = createCsrfToken();
  const cookies = createSessionCookies(credential, csrf, { NODE_ENV: "production" });

  assert.equal(REMEMBERED_SESSION_SECONDS, 30 * 24 * 60 * 60);
  assert.match(cookies[0]!, /^__Host-campus_refresh=/);
  assert.match(cookies[0]!, /; HttpOnly/);
  assert.match(cookies[0]!, /; SameSite=Strict/);
  assert.match(cookies[0]!, /; Secure/);
  assert.match(cookies[1]!, /^__Host-campus_csrf=/);
  assert.doesNotMatch(cookies[1]!, /; HttpOnly/);
  assert.match(cookies[1]!, /; Secure/);
});

test("refresh cookie parsing rejects malformed credentials", () => {
  const credential = createRefreshCredential(orgId, sessionId);
  const [refreshCookie] = createSessionCookies(credential, createCsrfToken(), {
    NODE_ENV: "production",
  });
  const cookieValue = refreshCookie!.slice("__Host-campus_refresh=".length).split(";", 1)[0];
  const parsed = readRefreshCredential(`__Host-campus_refresh=${cookieValue}`);

  assert.deepEqual(parsed, credential);
  assert.equal(readRefreshCredential("__Host-campus_refresh=invalid.value"), null);
});

test("refresh-secret hashes match only the original high-entropy secret", () => {
  const credential = createRefreshCredential(orgId, sessionId);
  const hash = hashRefreshSecret(credential.secret);

  assert.equal(matchesRefreshSecret(credential.secret, hash), true);
  assert.equal(matchesRefreshSecret(`${credential.secret}x`, hash), false);
});

test("CSRF protection requires the matching cookie and request header", () => {
  const token = createCsrfToken();
  const request = (cookie: string, header: string) =>
    ({
      headers: { cookie, "x-csrf-token": header },
    }) as unknown as FastifyRequest;

  assert.equal(
    hasValidCsrfToken(request(`__Host-campus_csrf=${token}`, token), { NODE_ENV: "production" }),
    true,
  );
  assert.equal(
    hasValidCsrfToken(request(`__Host-campus_csrf=${token}`, "different"), {
      NODE_ENV: "production",
    }),
    false,
  );
  assert.equal(
    hasValidCsrfToken(request("", token), { NODE_ENV: "production" }),
    false,
  );
});

test("logout clears both remembered-session cookies", () => {
  const cookies = clearSessionCookies({ NODE_ENV: "production" });
  assert.match(cookies[0]!, /^__Host-campus_refresh=/);
  assert.match(cookies[0]!, /; Max-Age=0/);
  assert.match(cookies[1]!, /^__Host-campus_csrf=/);
});
