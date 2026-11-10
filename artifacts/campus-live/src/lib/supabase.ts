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
 * Browser Supabase client. It only manages the auth session; campus data
 * still flows exclusively through the Fastify API, which verifies the
 * Supabase access token.
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
