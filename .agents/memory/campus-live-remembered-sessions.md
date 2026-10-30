---
name: Campus Live remembered sessions
description: Security boundary for keeping a user signed in on a trusted device.
---

Persistent sign-in must use short-lived access tokens kept in memory and a rotating, database-backed refresh secret in an HttpOnly, Secure, SameSite=Strict cookie. Store only the refresh-secret hash in an RLS-protected identity session row. Protect refresh and logout with a host-only double-submit CSRF cookie and request header. Never persist passwords or access tokens in browser storage.

**Why:** The installable app should survive close and reopen without exposing long-lived bearer credentials to JavaScript or accepting cookie-authenticated refresh requests without CSRF protection.

**How to apply:** Preserve token rotation, expiration, revocation, CSRF checks, and tenant isolation. Apply the matching database migration before deploying this behavior to production.
