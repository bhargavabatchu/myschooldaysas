import { createPublicKey, createVerify, verify as verifySignature, webcrypto } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { pool, withOrg } from "@workspace/db";
import { getSupabaseAuthConfig } from "./supabase-admin.ts";
import type {} from "./fastify-routes.ts";

export { verifyPassword } from "./password-hash.ts";

export type CampusRole =
  | "super_admin"
  | "org_admin"
  | "campus_admin"
  | "hod"
  | "teacher"
  | "class_teacher"
  | "student"
  | "parent";

export interface AuthUser {
  id: string;
  orgId: string;
  name: string;
  email: string;
  roles: CampusRole[];
  mustChangePassword: boolean;
}

export interface SupabaseTokenClaims {
  sub: string;
  email: string;
}

interface Jwk {
  kid?: string;
  kty?: string;
  alg?: string;
  use?: string;
  n?: string;
  e?: string;
}

export type JwksFetcher = () => Promise<{ keys: Jwk[] }>;

const JWKS_CACHE_TTL_MS = 10 * 60 * 1000;
let jwksCache: { keys: Jwk[]; fetchedAt: number } | null = null;
let jwksFetcher: JwksFetcher | null = null;

/** Test hook: replace how the JWKS document is fetched. */
export function setJwksFetcher(fetcher: JwksFetcher | null): void {
  jwksFetcher = fetcher;
  jwksCache = null;
}

async function loadJwks(): Promise<Jwk[]> {
  if (jwksCache && Date.now() - jwksCache.fetchedAt < JWKS_CACHE_TTL_MS) {
    return jwksCache.keys;
  }
  const config = getSupabaseAuthConfig();
  if (jwksFetcher) {
    const document = await jwksFetcher();
    jwksCache = { keys: document.keys, fetchedAt: Date.now() };
    return jwksCache.keys;
  }
  if (!config) return [];
  const response = await fetch(config.jwksUrl);
  if (!response.ok) {
    throw new Error(`Could not load Supabase JWKS from ${config.jwksUrl} (${response.status}).`);
  }
  const document = (await response.json()) as { keys: Jwk[] };
  jwksCache = { keys: document.keys ?? [], fetchedAt: Date.now() };
  return jwksCache.keys;
}

function base64UrlToBuffer(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

/**
 * Verify a Supabase Auth access token (RS256) against the project JWKS.
 * Returns the subject claims, or null when the token is invalid.
 */
export async function verifySupabaseToken(
  token: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<SupabaseTokenClaims | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  try {
    const header = JSON.parse(base64UrlToBuffer(parts[0]!).toString("utf8")) as { alg?: string; kid?: string };
    // Supabase signs access tokens with ES256 (current projects) or RS256.
    if (header.alg !== "ES256" && header.alg !== "RS256") return null;

    const payload = JSON.parse(base64UrlToBuffer(parts[1]!).toString("utf8")) as Partial<{
      iss: string;
      aud: string | string[];
      sub: string;
      email: string;
      exp: number;
      role: string;
    }>;

    const config = getSupabaseAuthConfig();
    // Supabase issues tokens with iss "https://<project>.supabase.co/auth/v1"
    // (no trailing slash); accept both spellings.
    const expectedIssuers = config
      ? [`${config.url}/auth/v1`, `${config.url}/auth/v1/`]
      : null;
    if (!payload.sub || typeof payload.exp !== "number" || payload.exp <= nowSeconds) return null;
    if (expectedIssuers && !expectedIssuers.includes(payload.iss ?? "")) return null;
    const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    const authenticated = audiences.includes("authenticated") || payload.role === "authenticated";
    if (!authenticated) return null;

    const keys = await loadJwks();
    const candidates = header.kid ? keys.filter((key) => key.kid === header.kid) : keys;
    const usableKeys = (candidates.length ? candidates : keys).filter((key) =>
      (header.alg === "RS256" && key.kty === "RSA") ||
      (header.alg === "ES256" && key.kty === "EC"),
    );
    if (!usableKeys.length) return null;

    const signedContent = Buffer.from(`${parts[0]}.${parts[1]}`);
    const signature = base64UrlToBuffer(parts[2]!);
    const matched = usableKeys.some((key) => {
      try {
        const publicKey = createPublicKey({ key: key as webcrypto.JsonWebKey, format: "jwk" });
        if (header.alg === "ES256") {
          const verifier = createVerify("SHA256");
          verifier.update(signedContent);
          // JOSE ECDSA signatures are raw r||s; Node expects DER unless told
          // to read the IEEE P-1363 layout.
          return verifier.verify({ key: publicKey, dsaEncoding: "ieee-p1363" }, signature);
        }
        return verifySignature("RSA-SHA256", signedContent, publicKey, signature);
      } catch {
        return false;
      }
    });
    if (!matched) return null;

    return { sub: payload.sub, email: payload.email ?? "" };
  } catch {
    return null;
  }
}

/**
 * Look up which campus account a verified Supabase subject belongs to.
 * Runs before the organization scope is known, so it uses the fixed
 * SECURITY DEFINER function from identity migration 006.
 */
export async function findAccountBySupabaseUserId(
  supabaseUserId: string,
): Promise<{ orgId: string; userId: string } | null> {
  const result = await pool.query<{ org_id: string; user_id: string }>(
    "SELECT org_id, user_id FROM identity.lookup_user_by_supabase_id($1)",
    [supabaseUserId],
  );
  const row = result.rows[0];
  return row ? { orgId: row.org_id, userId: row.user_id } : null;
}

export const requireAuth = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  const authorization = req.headers.authorization;
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
  const claims = token ? await verifySupabaseToken(token) : null;
  if (!claims) {
    reply.code(401).send({ error: { code: "UNAUTHENTICATED", message: "Sign in to continue." } });
    return;
  }

  const account = await findAccountBySupabaseUserId(claims.sub);
  if (!account) {
    reply.code(401).send({ error: { code: "UNAUTHENTICATED", message: "Your session is no longer valid." } });
    return;
  }

  const result = await withOrg(account.orgId, async (client) =>
    client.query<{
      id: string;
      org_id: string;
      name: string;
      email: string;
      must_change_password: boolean;
      temporary_password_expires_at: Date | null;
      roles: CampusRole[];
    }>(
      `SELECT u.id, u.org_id, u.name, u.email, u.must_change_password,
              u.temporary_password_expires_at,
              COALESCE(array_agg(ur.role) FILTER (WHERE ur.role IS NOT NULL), '{}') AS roles
         FROM identity.users AS u
         LEFT JOIN identity.user_roles AS ur
           ON ur.user_id = u.id AND ur.org_id = u.org_id
        WHERE u.id = $1 AND u.org_id = $2 AND u.status = 'active'
        GROUP BY u.id`,
      [account.userId, account.orgId],
    ),
  );
  const user = result.rows[0];
  if (!user || user.roles.length === 0) {
    reply.code(401).send({ error: { code: "UNAUTHENTICATED", message: "Your session is no longer valid." } });
    return;
  }
  if (
    user.must_change_password &&
    (!user.temporary_password_expires_at ||
      user.temporary_password_expires_at.getTime() <= Date.now())
  ) {
    reply.code(403).send({ error: { code: "PASSWORD_EXPIRED", message: "Your temporary password has expired." } });
    return;
  }
  req.campusUser = {
    id: user.id,
    orgId: user.org_id,
    name: user.name,
    email: user.email,
    roles: user.roles,
    mustChangePassword: user.must_change_password,
  };
  const requestPath = req.url.split("?")[0].replace(/^\/api(?=\/)/, "");
  if (
    user.must_change_password &&
    requestPath !== "/identity/me" &&
    requestPath !== "/identity/auth/change-password"
  ) {
    reply.code(403).send({ error: { code: "PASSWORD_CHANGE_REQUIRED", message: "Change your temporary password to continue." } });
    return;
  }
};

export function requireRoles(...allowed: CampusRole[]) {
  return async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const user = req.campusUser;
    if (!user || !user.roles.some((role) => allowed.includes(role))) {
      reply.code(403).send({ error: { code: "FORBIDDEN", message: "You do not have access to this action." } });
      return;
    }
  };
}

export async function findOrganizationBySlug(slug: string): Promise<{ id: string; name: string } | null> {
  const result = await pool.query<{ id: string; name: string }>(
    "SELECT id, name FROM identity.organizations WHERE slug = $1 LIMIT 1",
    [slug],
  );
  return result.rows[0] ?? null;
}
