---
name: Campus Live class setup
description: Class and section creation rules for the student-enrollment workflow.
---

Create a class together with its first section. Additional sections can be added afterward. Permanently delete a class or section only when no foreign-key-linked records exist; archive it otherwise so its history is preserved. Subject offerings are configuration, not usage history: they must not by themselves prevent deleting an otherwise empty section or class. Administrators can restore archived entities.

**Why:** student enrollment requires a section, so a class with no sections cannot complete the core setup journey. The user chose to preserve records when a class or section is already in use; subject-offering rows alone are not historical records.

**How to apply:** keep class setup available to school administrators and make the first section usable immediately by student admissions. Check foreign-key references before removal, ignoring configuration-only links such as section subject offerings; hide archived entities from active selectors while allowing administrator restore.
