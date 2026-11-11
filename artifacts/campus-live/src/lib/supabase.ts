import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function readEnv(): { url: string | null; publishableKey: string | null } {
  // The app builds under both Vite (import.meta.env) and Next.js (process.env);
  // read whichever runtime is active.
  const viteEnv = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {});
  const url = viteEnv.VITE_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? null;
  const publishableKey =
    viteEnv.VITE_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    null;
  return { url, publishableKey };
}

let client: SupabaseClient | null = null;

/**
 * Browser Supabase client. It manages the auth session and the direct
 * sign-in/profile RPCs; campus data still flows through the Fastify API,
 * which verifies the Supabase access token.
 */
export function getSupabase(): SupabaseClient {
  if (client) return client;
  const { url, publishableKey } = readEnv();
  if (!url || !publishableKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY) are required.",
    );
  }
  client = createClient(url, publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      storageKey: "campus-supabase-auth",
    },
  });
  return client;
}

export interface CampusProfile {
  id: string;
  orgId: string;
  orgSlug: string;
  name: string;
  email: string;
  roles: string[];
  mustChangePassword: boolean;
}

/** Same shape as GET /identity/me, seeded from the direct-Supabase login. */
export function profileToUser(profile: CampusProfile) {
  return {
    id: profile.id,
    orgId: profile.orgId,
    name: profile.name,
    email: profile.email,
    roles: profile.roles,
    mustChangePassword: profile.mustChangePassword,
  };
}

async function callCampusRpc<T>(name: string): Promise<T | null> {
  const { url, publishableKey } = readEnv();
  if (!url || !publishableKey) return null;
  const { data: sessionData } = await getSupabase().auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) return null;
  const response = await fetch(`${url.replace(/\/$/, "")}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: publishableKey,
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: "{}",
  });
  if (!response.ok) return null;
  // PostgREST returns set-returning functions as a JSON array of rows.
  const body = (await response.json()) as T | T[];
  return Array.isArray(body) ? (body[0] ?? null) : body;
}

/**
 * Fetch the signed-in user's campus profile (org, roles, password state)
 * directly from Supabase. Returns null when there is no session, the
 * account is not linked to a school, or it has no roles.
 */
export async function fetchCampusProfile(): Promise<CampusProfile | null> {
  const row = await callCampusRpc<{
    id: string;
    org_id: string;
    org_slug: string;
    name: string;
    email: string;
    roles: string[];
    must_change_password: boolean;
  } | null>("my_campus_profile");
  if (!row || !Array.isArray(row.roles) || row.roles.length === 0) return null;
  return {
    id: row.id,
    orgId: row.org_id,
    orgSlug: row.org_slug,
    name: row.name,
    email: row.email,
    roles: row.roles,
    mustChangePassword: row.must_change_password,
  };
}

/**
 * Clear the must-change-password / temporary-password flags for the signed-in
 * user after they set a new password through supabase.auth.updateUser().
 */
export async function completeCampusPasswordChange(): Promise<boolean> {
  const result = await callCampusRpc<boolean>("complete_campus_password_change");
  return result === true;
}
