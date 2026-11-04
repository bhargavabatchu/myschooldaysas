---
name: Campus Live school admin delegation
description: Permission boundary for creating additional school administrator accounts.
---

An existing school `org_admin` may create another `org_admin` only for their own school. Keep the role fixed server-side, bind the organization from the authenticated actor, and never let this flow grant `super_admin`. New accounts use a one-time temporary password that expires after seven days and must be changed at first sign-in.

**Why:** The user approved allowing a school administrator to add another administrator for the same school, without granting platform-level authority.

**How to apply:** keep same-school scope and the `org_admin` role non-editable in both the API and UI; preserve first-login password change and expiration.

School administrators can view same-school `org_admin` accounts and deactivate or restore them. Deactivation blocks sign-in and revokes active sessions but preserves the account and its records; an administrator cannot deactivate themself or the school's last active administrator.

**Why:** The user chose reversible access removal rather than permanent account deletion.

**How to apply:** Keep the role and organization scope fixed, include disabled accounts only on request, and require at least one active school administrator.
