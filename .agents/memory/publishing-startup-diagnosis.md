---
name: Publishing startup diagnosis
description: Avoid misdiagnosing generic publishing health-check failures in the multi-service application.
---

Do not infer which service failed, or which probe path was actually used, from the generic publishing message mentioning GET /. Check production configuration presence and startup validation before changing probes.

**Why:** Publishing compiled both services successfully but failed promotion with a generic root-probe message. Failed-revision runtime logs were empty. Adding a dedicated web health route did not resolve the failure; checking production settings then exposed deterministic API startup validation failures.

**How to apply:** Separate successful compilation from runtime readiness. Inspect production variable presence without revealing values, compare it with startup requirements, and reproduce validation in isolation without connecting to a database. Keep production safety guards intact and never substitute local container endpoints or development defaults.

Also distinguish the local database selected by `.env` from Replit's managed development/publishing database. Successful local migrations and login checks do not prove that Publishing has the application schema or users. Check schema metadata on the actual publishing database before claiming readiness; obtain explicit approval before copying or replacing an existing database.

Publishing a managed database schema does not establish least-privilege runtime access.

**Why:** A schema copy preserved the tenant tables and forced RLS, but production omitted the custom development roles. All available production login roles had BYPASSRLS, which the API correctly rejects before listening.

**How to apply:** Inspect production role metadata and effective schema/table privileges after schema provisioning, not just table/RLS counts. Migration records and existing tables do not prove that runtime grants exist; login can fail before checking credentials when schema access is missing. Keep the startup guard intact and require a distinct `CAMPUS_DATABASE_URL` in production so the platform-managed `DATABASE_URL` cannot be used as fallback. Arrange restricted runtime credentials through supported database administration rather than adding production DDL, switching roles on a privileged connection, or disabling isolation.

Creating a restricted role and granting it access does not change the identity used by an already-saved connection URL.

**Why:** A saved runtime URL still authenticated as the platform owner after restricted-role setup, so the API continued to reject startup.

**How to apply:** Before another publish, verify `current_user`, `rolsuper`, and `rolbypassrls` through the application's runtime pool without printing connection strings. Distinguish a workspace reproduction from production runtime evidence when published-revision logs are missing.

Do not treat a successful build or a no-difference Publish schema report as proof that required production database objects exist.

**Why:** Read-only development/production object checks disagreed with the Publish schema comparison for a service-schema table. The reason was not established; custom-schema support and database-target differences must not be asserted as proven causes.

**How to apply:** Verify required objects and migration records directly, preserve database isolation, and report contradictory platform results explicitly. Do not keep recommending identical republishes or add startup DDL to bypass a managed schema-sync failure.
