---
name: Campus Live student attendance
description: Student attendance visibility and the read-only access boundary.
---

Students should be able to view their own recorded attendance history and summary in the attendance area. Their view is read-only; marking and editing attendance remain staff-only. Attendance history requests must derive the student identity from the authenticated session and must not accept a student ID from the client.

**Why:** the user expects students to see their own attendance from the student portal while keeping attendance entry under staff control.

**How to apply:** when extending student attendance, retain server-side identity scoping, exclude staff-only notes, and keep write routes limited to authorized staff.
