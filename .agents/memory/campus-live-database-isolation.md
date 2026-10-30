---
name: Campus Live database isolation
description: Keep Campus Live development operations separated from production data.
---

Development must use only its restricted development connection. Production must use only `CAMPUS_DATABASE_URL`; never fall back across environments.

**Why:** production connection secrets can be present in a shared workspace environment, so a development fallback could send preview migrations, seeds, or writes to production.

**How to apply:** preserve the environment-specific URL resolver, keep a negative test that rejects production fallback in development, and use separate least-privilege app and migration roles.

The user confirmed this isolated development setup works in the preview.
