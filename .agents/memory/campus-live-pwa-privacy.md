---
name: Campus Live PWA privacy
description: Privacy boundary for offline support in the Campus Live installable app.
---

Keep the installable Campus Live app online-only by default. Do not cache authenticated API responses or private school records, including student profiles, grades, fees, attendance, or announcements, for offline access.

**Why:** the feature scope is app installation, not offline data retention; private school records should not persist in browser caches on shared or lost devices.

**How to apply:** if offline support is requested later, limit caching to public static assets unless a separate privacy review explicitly approves more.
