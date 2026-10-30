import {
  setAuthTokenGetter,
  setAuthTokenRefreshHandler,
} from '@workspace/api-client-react';

let accessToken: string | null = null;
let refreshInFlight: Promise<string | null> | null = null;

setAuthTokenGetter(() => accessToken);

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

function readCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  for (const part of document.cookie.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const name = part.slice(0, separator).trim();
    if (name !== "__Host-campus_csrf" && name !== "campus_csrf") continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

async function refreshRememberedAccessToken(): Promise<string | null> {
  const csrfToken = readCsrfToken();
  if (!csrfToken || typeof window === "undefined") return null;

  try {
    const response = await fetch("/api/identity/auth/refresh", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        accept: "application/json",
        "x-csrf-token": csrfToken,
      },
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) setAccessToken(null);
      return null;
    }

    const result = (await response.json()) as { accessToken?: unknown };
    if (typeof result.accessToken !== "string" || !result.accessToken) return null;
    setAccessToken(result.accessToken);
    return result.accessToken;
  } catch {
    return null;
  }
}

export function refreshRememberedSession(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = refreshRememberedAccessToken().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

setAuthTokenRefreshHandler(refreshRememberedSession);

export async function restoreRememberedSession(): Promise<boolean> {
  return Boolean(await refreshRememberedSession());
}

export async function logoutRememberedSession(): Promise<void> {
  const csrfToken = readCsrfToken();
  try {
    if (csrfToken && typeof window !== "undefined") {
      await fetch("/api/identity/auth/logout", {
        method: "POST",
        credentials: "same-origin",
        headers: { "x-csrf-token": csrfToken },
      });
    }
  } catch {
    // Clear the in-memory session even if the network is unavailable.
  } finally {
    setAccessToken(null);
  }
}
