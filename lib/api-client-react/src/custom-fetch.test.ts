import assert from "node:assert/strict";
import { test } from "node:test";
import {
  customFetch,
  setAuthTokenGetter,
  setAuthTokenRefreshHandler,
} from "./custom-fetch.ts";

test("customFetch refreshes an expired bearer token once and retries the request", async () => {
  const originalFetch = globalThis.fetch;
  const authorizationHeaders: Array<string | null> = [];
  setAuthTokenGetter(() => "expired-access-token");
  setAuthTokenRefreshHandler(async () => "refreshed-access-token");
  globalThis.fetch = async (_input, init) => {
    authorizationHeaders.push(new Headers(init?.headers).get("authorization"));
    if (authorizationHeaders.length === 1) {
      return new Response(
        JSON.stringify({ error: { code: "UNAUTHENTICATED", message: "Sign in again." } }),
        { status: 401, headers: { "content-type": "application/json" } },
      );
    }
    return new Response(JSON.stringify({ restored: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    const result = await customFetch<{ restored: boolean }>("/api/private", {
      responseType: "json",
    });
    assert.deepEqual(result, { restored: true });
    assert.deepEqual(authorizationHeaders, [
      "Bearer expired-access-token",
      "Bearer refreshed-access-token",
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    setAuthTokenGetter(null);
    setAuthTokenRefreshHandler(null);
  }
});

test("customFetch does not refresh an unauthenticated login request", async () => {
  const originalFetch = globalThis.fetch;
  let refreshCalls = 0;
  setAuthTokenGetter(() => null);
  setAuthTokenRefreshHandler(async () => {
    refreshCalls += 1;
    return "unexpected-token";
  });
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({ error: { code: "INVALID_CREDENTIALS", message: "Try again." } }),
      { status: 401, headers: { "content-type": "application/json" } },
    );

  try {
    await assert.rejects(
      customFetch("/api/identity/auth/login", { method: "POST", body: "{}" }),
    );
    assert.equal(refreshCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    setAuthTokenGetter(null);
    setAuthTokenRefreshHandler(null);
  }
});

test("customFetch includes nested API error messages in HTTP errors", async () => {
  const originalFetch = globalThis.fetch;
  setAuthTokenGetter(null);
  setAuthTokenRefreshHandler(null);
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        error: {
          code: "CONFLICT",
          message: "An account with this email already exists in your school.",
        },
      }),
      {
        status: 409,
        statusText: "Conflict",
        headers: { "content-type": "application/json" },
      },
    );

  try {
    await assert.rejects(
      customFetch("/api/identity/admins", { method: "POST", body: "{}" }),
      /HTTP 409 Conflict: An account with this email already exists in your school\./,
    );
  } finally {
    globalThis.fetch = originalFetch;
    setAuthTokenGetter(null);
    setAuthTokenRefreshHandler(null);
  }
});
