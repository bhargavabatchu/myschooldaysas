import type { FastifyPluginAsync } from "fastify";
import {
  CreateCalendarEventBody,
  DeleteCalendarEventParams,
  GetCalendarQueryParams,
  GetCalendarWorkingDayQueryParams,
  UpdateCalendarEventBody,
  UpdateCalendarEventParams,
} from "@workspace/api-zod";
import { withOrg } from "@workspace/db";
import { createRouteRegistrar } from "../lib/fastify-routes";
import { requireAuth, type AuthUser, type CampusRole } from "../lib/auth";
import { canManageAcademicSetup } from "../lib/academic-scheduling-policy";

const adminRoles: CampusRole[] = ["super_admin", "org_admin", "campus_admin"];
const teacherRoles: CampusRole[] = ["teacher", "class_teacher", "hod"];
const errorBody = (code: string, message: string) => ({ error: { code, message } });

type CalendarKind = "holiday" | "exam" | "event" | "ptm" | "working_day";
type CalendarScope = "org" | "class" | "section";

function isDateOnly(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function dateKey(value: unknown): string | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString().slice(0, 10);
  return isDateOnly(value) ? value : null;
}

function mapCalendarEvent(row: any) {
  return {
    id: row.id as string,
    title: row.title as string,
    kind: row.kind as CalendarKind,
    startDate: dateKey(row.start_date),
    endDate: dateKey(row.end_date),
    scope: row.scope as CalendarScope,
    scopeId: row.scope_id as string | null,
    scopeName: row.scope_name as string,
    description: row.description as string,
    createdBy: row.created_by as string,
  };
}

async function resolveScopeName(client: any, orgId: string, scope: CalendarScope, scopeId: string | undefined) {
  if (scope === "org") return { scopeName: "Whole school" };
  if (!scopeId) return null;
  if (scope === "class") {
    const result = await client.query(
      "SELECT name FROM academic.classes WHERE org_id=$1 AND id=$2",
      [orgId, scopeId],
    );
    return result.rowCount ? { scopeName: result.rows[0].name as string } : null;
  }
  const result = await client.query(
    `SELECT c.name || ' · ' || s.name AS scope_name
       FROM academic.sections s
       JOIN academic.classes c ON c.org_id=s.org_id AND c.id=s.class_id
      WHERE s.org_id=$1 AND s.id=$2`,
    [orgId, scopeId],
  );
  return result.rowCount ? { scopeName: result.rows[0].scope_name as string } : null;
}

function parsedDateQuery(query: Record<string, unknown>, fields: string[]) {
  return Object.fromEntries(fields.map((field) => [
    field,
    isDateOnly(query[field]) ? new Date(`${query[field]}T00:00:00.000Z`) : query[field],
  ]));
}

async function visibleCalendar(client: any, user: AuthUser, from: string, to: string) {
  const roles = user.roles as CampusRole[];
  const isAdmin = roles.some((role) => adminRoles.includes(role));
  const isStudent = roles.includes("student");
  const isParent = roles.includes("parent");
  const isTeacher = roles.some((role) => teacherRoles.includes(role));
  const where = `e.org_id=$1 AND e.start_date <= $4::date AND e.end_date >= $3::date
    AND (
      $5::boolean OR e.scope='org'
      OR (e.scope='class' AND (
        ($6::boolean AND EXISTS (
          SELECT 1 FROM academic.enrollments en
           JOIN academic.sections sec ON sec.org_id=en.org_id AND sec.id=en.section_id
          WHERE en.org_id=e.org_id AND en.student_user_id=$2 AND en.status='active'
            AND sec.class_id=e.scope_id
        ))
        OR ($7::boolean AND EXISTS (
          SELECT 1 FROM identity.guardian_links gl
           JOIN academic.enrollments en
             ON en.org_id=gl.org_id AND en.student_user_id=gl.student_user_id AND en.status='active'
           JOIN academic.sections sec ON sec.org_id=en.org_id AND sec.id=en.section_id
          WHERE gl.org_id=e.org_id AND gl.guardian_user_id=$2 AND sec.class_id=e.scope_id
        ))
        OR ($8::boolean AND EXISTS (
          SELECT 1 FROM academic.sections sec
           LEFT JOIN academic.section_teachers st ON st.org_id=sec.org_id AND st.section_id=sec.id
           LEFT JOIN academic.teacher_assignments ta ON ta.org_id=sec.org_id AND ta.section_id=sec.id
          WHERE sec.org_id=e.org_id AND sec.class_id=e.scope_id
            AND (st.teacher_user_id=$2 OR ta.teacher_user_id=$2)
        ))
      ))
      OR (e.scope='section' AND (
        ($6::boolean AND EXISTS (
          SELECT 1 FROM academic.enrollments en
          WHERE en.org_id=e.org_id AND en.section_id=e.scope_id
            AND en.student_user_id=$2 AND en.status='active'
        ))
        OR ($7::boolean AND EXISTS (
          SELECT 1 FROM identity.guardian_links gl
           JOIN academic.enrollments en
             ON en.org_id=gl.org_id AND en.student_user_id=gl.student_user_id AND en.status='active'
          WHERE gl.org_id=e.org_id AND gl.guardian_user_id=$2 AND en.section_id=e.scope_id
        ))
        OR ($8::boolean AND (
          EXISTS (SELECT 1 FROM academic.section_teachers st
                   WHERE st.org_id=e.org_id AND st.section_id=e.scope_id AND st.teacher_user_id=$2)
          OR EXISTS (SELECT 1 FROM academic.teacher_assignments ta
                      WHERE ta.org_id=e.org_id AND ta.section_id=e.scope_id AND ta.teacher_user_id=$2)
        ))
      ))
    )`;
  const values = [user.orgId, user.id, from, to, isAdmin, isStudent, isParent, isTeacher];
  const count = await client.query(
    `SELECT count(*)::int AS total FROM school.calendar_events e WHERE ${where}`,
    values,
  );
  const result = await client.query(
    `SELECT e.id, e.title, e.kind, e.start_date, e.end_date, e.scope, e.scope_id, e.description, e.created_by,
            CASE WHEN e.scope='org' THEN 'Whole school'
                 WHEN e.scope='class' THEN class_target.name
                 ELSE section_class.name || ' · ' || sec.name END AS scope_name
       FROM school.calendar_events e
       LEFT JOIN academic.classes class_target
         ON e.scope='class' AND class_target.org_id=e.org_id AND class_target.id=e.scope_id
       LEFT JOIN academic.sections sec
         ON e.scope='section' AND sec.org_id=e.org_id AND sec.id=e.scope_id
       LEFT JOIN academic.classes section_class
         ON e.scope='section' AND section_class.org_id=sec.org_id AND section_class.id=sec.class_id
      WHERE ${where}
      ORDER BY e.start_date, e.end_date, e.title
      LIMIT 500`,
    values,
  );
  return { items: result.rows.map(mapCalendarEvent), total: Number(count.rows[0]?.total ?? 0) };
}

const routes: FastifyPluginAsync = async (fastify) => {
  const router = createRouteRegistrar(fastify);

  router.get("/calendar", requireAuth, async (req, res, next) => {
    const user = req.campusUser;
    if (!user) return void res.status(401).json(errorBody("UNAUTHENTICATED", "Sign in to continue."));
    const query = req.query as Record<string, unknown>;
    const parsed = GetCalendarQueryParams.safeParse(parsedDateQuery(query, ["from", "to"]));
    const from = dateKey(parsed.success ? parsed.data.from : null);
    const to = dateKey(parsed.success ? parsed.data.to : null);
    if (!parsed.success || !from || !to || from > to) {
      return void res.status(400).json(errorBody("INVALID_REQUEST", "Provide a valid calendar date range."));
    }
    try {
      const page = await withOrg(user.orgId, (client) => visibleCalendar(client, user, from, to));
      res.json(page);
    } catch (error) { next(error); }
  });

  router.post("/calendar", requireAuth, async (req, res, next) => {
    const user = req.campusUser;
    if (!user) return void res.status(401).json(errorBody("UNAUTHENTICATED", "Sign in to continue."));
    if (!canManageAcademicSetup(user.roles)) {
      return void res.status(403).json(errorBody("FORBIDDEN", "Only school administrators can manage the academic calendar."));
    }
    const rawBody = req.body as Record<string, unknown> | null;
    if (!rawBody || !isDateOnly(rawBody.startDate) || !isDateOnly(rawBody.endDate)) {
      return void res.status(400).json(errorBody("INVALID_REQUEST", "Provide valid calendar event dates."));
    }
    const parsed = CreateCalendarEventBody.safeParse(req.body);
    if (!parsed.success) return void res.status(400).json(errorBody("INVALID_REQUEST", "Provide valid calendar event details."));
    const input = parsed.data;
    const startDate = dateKey(input.startDate);
    const endDate = dateKey(input.endDate);
    if (!startDate || !endDate || startDate > endDate || (input.scope === "org" && input.scopeId) || (input.scope !== "org" && !input.scopeId)) {
      return void res.status(400).json(errorBody("INVALID_REQUEST", "Check the event dates and selected audience."));
    }
    try {
      const created = await withOrg(user.orgId, async (client) => {
        const scope = await resolveScopeName(client, user.orgId, input.scope, input.scopeId);
        if (!scope) return null;
        const result = await client.query(
          `INSERT INTO school.calendar_events
             (org_id, title, kind, start_date, end_date, scope, scope_id, description, created_by)
           VALUES ($1,$2,$3,$4::date,$5::date,$6,$7,$8,$9)
           RETURNING id, title, kind, start_date, end_date, scope, scope_id, description, created_by`,
          [user.orgId, input.title.trim(), input.kind, startDate, endDate, input.scope, input.scopeId ?? null, input.description.trim(), user.id],
        );
        return mapCalendarEvent({ ...result.rows[0], scope_name: scope.scopeName });
      });
      if (!created) return void res.status(404).json(errorBody("NOT_FOUND", "Choose a class or section in this school."));
      res.status(201).json(created);
    } catch (error) { next(error); }
  });

  router.put("/calendar/:eventId", requireAuth, async (req, res, next) => {
    const user = req.campusUser;
    if (!user) return void res.status(401).json(errorBody("UNAUTHENTICATED", "Sign in to continue."));
    if (!canManageAcademicSetup(user.roles)) {
      return void res.status(403).json(errorBody("FORBIDDEN", "Only school administrators can manage the academic calendar."));
    }
    const params = UpdateCalendarEventParams.safeParse(req.params);
    const rawBody = req.body as Record<string, unknown> | null;
    const parsed = UpdateCalendarEventBody.safeParse(req.body);
    if (!rawBody || !isDateOnly(rawBody.startDate) || !isDateOnly(rawBody.endDate)) {
      return void res.status(400).json(errorBody("INVALID_REQUEST", "Provide valid calendar event dates."));
    }
    if (!params.success || !parsed.success) return void res.status(400).json(errorBody("INVALID_REQUEST", "Provide a valid event and calendar details."));
    const input = parsed.data;
    const startDate = dateKey(input.startDate);
    const endDate = dateKey(input.endDate);
    if (!startDate || !endDate || startDate > endDate || (input.scope === "org" && input.scopeId) || (input.scope !== "org" && !input.scopeId)) {
      return void res.status(400).json(errorBody("INVALID_REQUEST", "Check the event dates and selected audience."));
    }
    try {
      const updated = await withOrg(user.orgId, async (client) => {
        const scope = await resolveScopeName(client, user.orgId, input.scope, input.scopeId);
        if (!scope) return { missingTarget: true as const };
        const result = await client.query(
          `UPDATE school.calendar_events
              SET title=$3, kind=$4, start_date=$5::date, end_date=$6::date,
                  scope=$7, scope_id=$8, description=$9, updated_at=now()
            WHERE org_id=$1 AND id=$2
            RETURNING id, title, kind, start_date, end_date, scope, scope_id, description, created_by`,
          [user.orgId, params.data.eventId, input.title.trim(), input.kind, startDate, endDate, input.scope, input.scopeId ?? null, input.description.trim()],
        );
        return result.rowCount ? { event: mapCalendarEvent({ ...result.rows[0], scope_name: scope.scopeName }) } : { missing: true as const };
      });
      if ("missingTarget" in updated) return void res.status(404).json(errorBody("NOT_FOUND", "Choose a class or section in this school."));
      if ("missing" in updated) return void res.status(404).json(errorBody("NOT_FOUND", "Calendar event not found."));
      res.json(updated.event);
    } catch (error) { next(error); }
  });

  router.delete("/calendar/:eventId", requireAuth, async (req, res, next) => {
    const user = req.campusUser;
    if (!user) return void res.status(401).json(errorBody("UNAUTHENTICATED", "Sign in to continue."));
    if (!canManageAcademicSetup(user.roles)) {
      return void res.status(403).json(errorBody("FORBIDDEN", "Only school administrators can manage the academic calendar."));
    }
    const parsed = DeleteCalendarEventParams.safeParse(req.params);
    if (!parsed.success) return void res.status(400).json(errorBody("INVALID_REQUEST", "Provide a valid calendar event."));
    try {
      const removed = await withOrg(user.orgId, (client) =>
        client.query("DELETE FROM school.calendar_events WHERE org_id=$1 AND id=$2", [user.orgId, parsed.data.eventId]),
      );
      if (!removed.rowCount) return void res.status(404).json(errorBody("NOT_FOUND", "Calendar event not found."));
      res.status(204).send();
    } catch (error) { next(error); }
  });

  router.get("/calendar/is-working-day", requireAuth, async (req, res, next) => {
    const user = req.campusUser;
    if (!user) return void res.status(401).json(errorBody("UNAUTHENTICATED", "Sign in to continue."));
    const query = req.query as Record<string, unknown>;
    const parsed = GetCalendarWorkingDayQueryParams.safeParse(parsedDateQuery(query, ["date"]));
    const date = dateKey(parsed.success ? parsed.data.date : null);
    if (!parsed.success || !date) return void res.status(400).json(errorBody("INVALID_REQUEST", "Provide a valid calendar date."));
    try {
      const status = await withOrg(user.orgId, async (client) => {
        const calendarEntry = await client.query(
          `SELECT kind, title
             FROM school.calendar_events
            WHERE org_id=$1 AND scope='org' AND start_date <= $2::date AND end_date >= $2::date
              AND kind IN ('holiday', 'working_day')
            ORDER BY CASE kind WHEN 'working_day' THEN 0 ELSE 1 END, created_at DESC
            LIMIT 1`,
          [user.orgId, date],
        );
        if (calendarEntry.rows[0]?.kind === "working_day") {
          return { date, isWorkingDay: true, reason: calendarEntry.rows[0].title as string };
        }
        if (calendarEntry.rows[0]?.kind === "holiday") {
          return { date, isWorkingDay: false, reason: calendarEntry.rows[0].title as string };
        }
        const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
        return weekday === 0
          ? { date, isWorkingDay: false, reason: "Sunday" }
          : { date, isWorkingDay: true, reason: "Scheduled school day" };
      });
      res.json(status);
    } catch (error) { next(error); }
  });
};

export default routes;
