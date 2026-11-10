import {
  setAuthTokenGetter,
  setAuthTokenRefreshHandler,
} from '@workspace/api-client-react';
import { getSupabase } from './lib/supabase';

let accessToken: string | null = null;
let refreshInFlight: Promise<string | null> | null = null;

setAuthTokenGetter(() => accessToken);

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

/** Install a Supabase session returned by POST /identity/auth/login. */
export async function installSupabaseSession(input: {
  accessToken: string;
  refreshToken: string;
}): Promise<void> {
  const { data } = await getSupabase().auth.setSession({
    access_token: input.accessToken,
    refresh_token: input.refreshToken,
  });
  accessToken = data.session?.access_token ?? input.accessToken;
}

async function refreshSupabaseAccessToken(): Promise<string | null> {
  try {
    const { data, error } = await getSupabase().auth.refreshSession();
    if (error || !data.session) {
      setAccessToken(null);
      return null;
    }
    setAccessToken(data.session.access_token);
    return data.session.access_token;
  } catch {
    return null;
  }
}

export function refreshRememberedSession(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = refreshSupabaseAccessToken().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

setAuthTokenRefreshHandler(refreshRememberedSession);

/** Try to restore a persisted Supabase session on page load. */
export async function restoreRememberedSession(): Promise<boolean> {
  try {
    const { data } = await getSupabase().auth.getSession();
    if (data.session) {
      setAccessToken(data.session.access_token);
      return true;
    }
  } catch {
    // Ignore storage failures; the user signs in again.
  }
  return false;
}

export async function logoutRememberedSession(): Promise<void> {
  try {
    await fetch("/api/identity/auth/logout", {
      method: "POST",
      credentials: "same-origin",
      headers: accessToken ? { authorization: `Bearer ${accessToken}` } : undefined,
    });
  } catch {
    // Clear the session even if the network is unavailable.
  } finally {
    await getSupabase().auth.signOut().catch(() => undefined);
    setAccessToken(null);
  }
}
