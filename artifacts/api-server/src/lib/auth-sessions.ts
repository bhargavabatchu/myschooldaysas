import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { FastifyRequest } from "fastify";

export const REMEMBERED_SESSION_SECONDS = 30 * 24 * 60 * 60;

export interface RefreshCredential {
  orgId: string;
  sessionId: string;
  secret: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function usesSecureCookies(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV === "production" || Boolean(env.REPL_ID) || Boolean(env.REPLIT_DEV_DOMAIN);
}

function cookiePrefix(env: NodeJS.ProcessEnv = process.env): string {
  return usesSecureCookies(env) ? "__Host-" : "";
}

export function createRefreshCredential(orgId: string, sessionId: string = randomUUID()): RefreshCredential {
  if (!UUID_PATTERN.test(orgId) || !UUID_PATTERN.test(sessionId)) {
    throw new Error("Refresh credentials require valid organization and session IDs.");
  }
  return { orgId, sessionId, secret: randomBytes(32).toString("base64url") };
}

export function createCsrfToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashRefreshSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

export function matchesRefreshSecret(secret: string, storedHash: string): boolean {
  const expected = Buffer.from(storedHash, "hex");
  const actual = Buffer.from(hashRefreshSecret(secret), "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function readCookie(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

export function readRefreshCredential(cookieHeader: string | undefined): RefreshCredential | null {
  const value =
    readCookie(cookieHeader, "__Host-campus_refresh") ??
    readCookie(cookieHeader, "campus_refresh");
  if (!value) return null;

  const [orgId, sessionId, secret, ...extra] = value.split(".");
  if (
    extra.length > 0 ||
    !orgId ||
    !sessionId ||
    !secret ||
    !UUID_PATTERN.test(orgId) ||
    !UUID_PATTERN.test(sessionId) ||
    !/^[A-Za-z0-9_-]{43}$/.test(secret)
  ) {
    return null;
  }
  return { orgId, sessionId, secret };
}

function csrfCookieName(env: NodeJS.ProcessEnv = process.env): string {
  return `${cookiePrefix(env)}campus_csrf`;
}

export function hasValidCsrfToken(
  request: FastifyRequest,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const cookieToken =
    readCookie(request.headers.cookie, csrfCookieName(env)) ??
    readCookie(request.headers.cookie, "__Host-campus_csrf") ??
    readCookie(request.headers.cookie, "campus_csrf");
  const headerValue = request.headers["x-csrf-token"];
  const headerToken = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  if (!cookieToken || !headerToken) return false;

  const cookieBytes = Buffer.from(cookieToken);
  const headerBytes = Buffer.from(headerToken);
  return cookieBytes.length === headerBytes.length && timingSafeEqual(cookieBytes, headerBytes);
}

function serializeCookie(
  name: string,
  value: string,
  options: { maxAge: number; httpOnly: boolean; secure: boolean },
): string {
  return [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    `Max-Age=${options.maxAge}`,
    "SameSite=Strict",
    ...(options.httpOnly ? ["HttpOnly"] : []),
    ...(options.secure ? ["Secure"] : []),
  ].join("; ");
}

export function createSessionCookies(
  credential: RefreshCredential,
  csrfToken: string,
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const secure = usesSecureCookies(env);
  const prefix = cookiePrefix(env);
  return [
    serializeCookie(
      `${prefix}campus_refresh`,
      `${credential.orgId}.${credential.sessionId}.${credential.secret}`,
      { maxAge: REMEMBERED_SESSION_SECONDS, httpOnly: true, secure },
    ),
    serializeCookie(`${prefix}campus_csrf`, csrfToken, {
      maxAge: REMEMBERED_SESSION_SECONDS,
      httpOnly: false,
      secure,
    }),
  ];
}

export function clearSessionCookies(env: NodeJS.ProcessEnv = process.env): string[] {
  const secure = usesSecureCookies(env);
  const prefix = cookiePrefix(env);
  const expired = (name: string, httpOnly: boolean) =>
    [
      `${name}=`,
      "Path=/",
      "Max-Age=0",
      "SameSite=Strict",
      ...(httpOnly ? ["HttpOnly"] : []),
      ...(secure ? ["Secure"] : []),
    ].join("; ");
  return [
    expired(`${prefix}campus_refresh`, true),
    expired(`${prefix}campus_csrf`, false),
  ];
}
