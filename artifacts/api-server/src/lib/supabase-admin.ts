/**
 * Thin wrappers over the Supabase Auth (GoTrue) Admin API using the service
 * role key. No SDK dependency: plain fetch against SUPABASE_URL.
 */

export interface SupabaseAuthConfig {
  url: string;
  serviceKey: string;
  jwksUrl: string;
}

export function getSupabaseAuthConfig(): SupabaseAuthConfig | null {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SECRET_KEY;
  const jwksUrl = process.env.SUPABASE_JWKS_URL ?? (url ? `${url.replace(/\/$/, "")}/auth/v1/.well-known/jwks.json` : undefined);
  if (!url || !serviceKey || !jwksUrl) return null;
  return { url: url.replace(/\/$/, ""), serviceKey, jwksUrl };
}

function requireConfig(): SupabaseAuthConfig {
  const config = getSupabaseAuthConfig();
  if (!config) {
    throw new Error("SUPABASE_URL, SUPABASE_SECRET_KEY, and SUPABASE_JWKS_URL are required for Supabase Auth.");
  }
  return config;
}

async function adminFetch(path: string, init: RequestInit): Promise<Response> {
  const config = requireConfig();
  return fetch(`${config.url}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      apikey: config.serviceKey,
      authorization: `Bearer ${config.serviceKey}`,
      ...(init.headers ?? {}),
    },
  });
}

export interface SupabaseAdminUser {
  id: string;
  email: string;
  email_confirmed_at: string | null;
}

async function readError(response: Response): Promise<string> {
  const body = await response.text();
  try {
    const parsed = JSON.parse(body) as { msg?: string; message?: string; error?: string; code?: number };
    return parsed.msg ?? parsed.message ?? parsed.error ?? body;
  } catch {
    return body;
  }
}

export class SupabaseUserExistsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SupabaseUserExistsError";
  }
}

export async function adminCreateUser(input: {
  email: string;
  password: string;
  emailConfirm: boolean;
}): Promise<SupabaseAdminUser> {
  const response = await adminFetch("/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({
      email: input.email,
      password: input.password,
      email_confirm: input.emailConfirm,
    }),
  });
  if (!response.ok) {
    const message = await readError(response);
    if (response.status === 422 && /already (been )?registered|already exists/i.test(message)) {
      throw new SupabaseUserExistsError(message);
    }
    throw new Error(`Supabase admin user creation failed (${response.status}): ${message}`);
  }
  const user = (await response.json()) as SupabaseAdminUser;
  return user;
}

export async function adminGetUserByEmail(email: string): Promise<SupabaseAdminUser | null> {
  const response = await adminFetch(
    `/auth/v1/admin/users?per_page=1&filters=(email.eq.${encodeURIComponent(email.toLowerCase())})`,
    { method: "GET" },
  );
  if (!response.ok) {
    throw new Error(`Supabase admin user lookup failed (${response.status}): ${await readError(response)}`);
  }
  const body = (await response.json()) as { users: SupabaseAdminUser[] };
  const match = body.users.find((user) => user.email.toLowerCase() === email.toLowerCase());
  return match ?? null;
}

export async function adminUpdateUserPassword(userId: string, password: string): Promise<void> {
  const response = await adminFetch(`/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: "PUT",
    body: JSON.stringify({ password }),
  });
  if (!response.ok) {
    throw new Error(`Supabase admin password update failed (${response.status}): ${await readError(response)}`);
  }
}

export async function adminDeleteUser(userId: string): Promise<void> {
  const response = await adminFetch(`/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: "DELETE",
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`Supabase admin user deletion failed (${response.status}): ${await readError(response)}`);
  }
}

export async function adminSignOutAllSessions(userId: string): Promise<void> {
  const response = await adminFetch(`/auth/v1/admin/users/${encodeURIComponent(userId)}/signout`, {
    method: "POST",
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`Supabase admin sign-out failed (${response.status}): ${await readError(response)}`);
  }
}

export interface SupabaseSession {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at: number;
  token_type: string;
  user: { id: string; email: string };
}

/** Password grant sign-in. Returns null on invalid credentials. */
export async function signInWithPassword(email: string, password: string): Promise<SupabaseSession | null> {
  const config = requireConfig();
  const response = await fetch(`${config.url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: config.serviceKey },
    body: JSON.stringify({ email, password }),
  });
  if (response.status === 400) return null;
  if (!response.ok) {
    throw new Error(`Supabase sign-in failed (${response.status}): ${await readError(response)}`);
  }
  return (await response.json()) as SupabaseSession;
}
