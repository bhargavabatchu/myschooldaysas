import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { pool, withOrg } from "@workspace/db";
import { createRouteRegistrar } from "../lib/fastify-routes";

/**
 * Public, unauthenticated school-website content: school identity, public
 * stats, school-wide announcements, upcoming org-wide calendar events.
 * Deliberately tenant-scoped by ?org= slug and restricted to audience
 * 'school' / scope 'org' rows so nothing class- or student-specific leaks.
 * There is intentionally no cache-control allowing shared caching.
 */

const querySchema = z.object({ org: z.string().trim().min(2).max(80).optional() });

const routes: FastifyPluginAsync = async (fastify) => {
  const router = createRouteRegistrar(fastify);

  router.get("/public/home", async (req, res, next) => {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      return void res.status(400).send({ error: { code: "INVALID_REQUEST", message: "Provide a valid organization." } });
    }

    try {
      const orgResult = await pool.query<{ id: string; name: string; slug: string }>(
        "SELECT id, name, slug FROM identity.organizations WHERE slug = $1 LIMIT 1",
        [parsed.data.org ?? "my-school-days"],
      );
      const org = orgResult.rows[0];
      if (!org) return void res.status(404).send({ error: { code: "NOT_FOUND", message: "School not found." } });

      const [stats, announcements, events] = await Promise.all([
        withOrg(org.id, async (client) => {
          const [students, staff, classes, sections] = await Promise.all([
            client.query<{ total: number }>(
              `SELECT count(*)::int AS total FROM identity.users u
                 JOIN identity.user_roles r ON r.org_id = u.org_id AND r.user_id = u.id AND r.role = 'student'
                WHERE u.org_id = $1 AND u.status = 'active'`,
              [org.id],
            ),
            client.query<{ total: number }>(
              `SELECT count(DISTINCT r.user_id)::int AS total FROM identity.user_roles r
                 JOIN identity.users u ON u.org_id = r.org_id AND u.id = r.user_id AND u.status = 'active'
                WHERE r.org_id = $1 AND r.role IN ('teacher', 'class_teacher', 'hod')`,
              [org.id],
            ),
            client.query<{ total: number }>(
              "SELECT count(*)::int AS total FROM academic.classes WHERE org_id = $1 AND is_active",
              [org.id],
            ),
            client.query<{ total: number }>(
              "SELECT count(*)::int AS total FROM academic.sections WHERE org_id = $1 AND is_active",
              [org.id],
            ),
          ]);
          return {
            students: students.rows[0]?.total ?? 0,
            teachers: staff.rows[0]?.total ?? 0,
            classes: classes.rows[0]?.total ?? 0,
            sections: sections.rows[0]?.total ?? 0,
          };
        }),
        withOrg(org.id, async (client) => {
          const result = await client.query<{ id: string; title: string; body: string; priority: string; published_at: Date }>(
            `SELECT id, title, body, priority, published_at
               FROM school.announcements
              WHERE org_id = $1 AND audience = 'school'
                AND published_at <= now()
                AND (expires_at IS NULL OR expires_at > now())
              ORDER BY priority = 'urgent' DESC, published_at DESC
              LIMIT 4`,
            [org.id],
          );
          return result.rows.map((row) => ({
            id: row.id,
            title: row.title,
            body: row.body.length > 220 ? row.body.slice(0, 220) + "…" : row.body,
            urgent: row.priority === "urgent",
            publishedAt: row.published_at.toISOString(),
          }));
        }),
        withOrg(org.id, async (client) => {
          const result = await client.query<{ id: string; title: string; kind: string; start_date: Date; end_date: Date; description: string }>(
            `SELECT id, title, kind, start_date, end_date, description
               FROM school.calendar_events
              WHERE org_id = $1 AND scope = 'org' AND end_date >= CURRENT_DATE
              ORDER BY start_date
              LIMIT 5`,
            [org.id],
          );
          return result.rows.map((row) => ({
            id: row.id,
            title: row.title,
            kind: row.kind,
            startDate: row.start_date.toISOString().slice(0, 10),
            endDate: row.end_date.toISOString().slice(0, 10),
            description: row.description.length > 180 ? row.description.slice(0, 180) + "…" : row.description,
          }));
        }),
      ]);

      res.header("Cache-Control", "public, max-age=60");
      res.send({
        school: { name: org.name, slug: org.slug },
        stats,
        announcements,
        events,
      });
    } catch (error) {
      next(error);
    }
  });
};

export default routes;
