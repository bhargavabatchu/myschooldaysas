---
name: Campus Live database isolation
description: Keep Campus Live development operations separated from production data.
---

Development must use only its restricted development connection. Production must use only `CAMPUS_DATABASE_URL`; never fall back across environments.

**Why:** production connection secrets can be present in a shared workspace environment, so a development fallback could send preview migrations, seeds, or writes to production.

**How to apply:** preserve the environment-specific URL resolver, keep a negative test that rejects production fallback in development, and use separate least-privilege app and migration roles.

The production role catalog includes `campus_runtime` inheriting `campus_app`. Keep the intended application permission baseline on `campus_app` rather than duplicating grants on the inheriting role.

**Why:** production catalog checks confirmed this membership; the inheriting role should receive the same restricted application privileges without becoming a superuser or bypassing RLS.

**How to apply:** verify inherited schema and table permissions separately when diagnosing production access failures. Do not replace the restricted connection with a database owner.

The user confirmed this isolated development setup works in the preview.

The fee integration test is deliberately restricted to the local `campus` database and `campus_app` role. The configured Replit development database may use a different database name; do not weaken the test guard to run against it.

**Why:** fee integration fixtures assume a disposable local database and a least-privilege role, and must not write into a shared development or production database.

**How to apply:** run the fee integration test only when its local database prerequisites are available; otherwise report the environment block.
