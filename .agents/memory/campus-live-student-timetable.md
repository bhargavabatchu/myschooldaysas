---
name: Campus Live student timetable
description: Role-based timetable behavior for students and staff.
---

Students have a fixed timetable determined by their active class enrollment. Their timetable view should not offer class or section selectors; staff can keep filters for reviewing schedules.

**Why:** The user clarified that each student has a fixed timetable according to their class.

**How to apply:** Rely on the authenticated timetable endpoint to return the student's authorized schedule, and keep the student UI focused on reading it rather than selecting a class or section.
