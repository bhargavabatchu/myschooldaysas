---
name: Campus Live student identity checks
description: Product rules for duplicates during student admission.
---

Duplicate school email addresses and admission numbers are blocking errors. An exact name match is a warning, not proof of duplicate identity: show the matching student or CSV row, then require an administrator to confirm the new student is a different person.

**Why:** Different students can share a name, but creating duplicate accounts from an email or admission number is unsafe.

**How to apply:** Keep email and admission-number uniqueness enforced server-side. Apply same-name review to both individual and batch admissions, and never let that confirmation bypass other validation errors.
