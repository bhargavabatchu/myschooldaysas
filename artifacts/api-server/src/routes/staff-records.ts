import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { withOrg } from "@workspace/db";
import { requireAuth, requireRoles } from "../lib/auth";
import { createRouteRegistrar } from "../lib/fastify-routes";

/**
 * Staff employment records: employee code, phone, qualification,
 * specialization, joining date — one row per staff member, managed by
 * school administrators.
 */

const staffProfileInput = z.object({
  employeeCode: z.string().trim().max(40).nullish(),
  phone: z.string().trim().max(20).nullish(),
  qualification: z.string().trim().max(160).nullish(),
  specialization: z.string().trim().max(160).nullish(),
  joiningDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  category: z.string().trim().max(60).nullish(),
});

const paramsSchema = z.object({ userId: z.string().uuid() });

const staffRoles = ["super_admin", "org_admin", "campus_admin", "hod", "teacher", "class_teacher"] as const;

function mapProfile(row: any) {
  return {
    userId: row.user_id,
    name: row.name,
    email: row.email,
    roles: row.roles ?? [],
    employeeCode: row.employee_code ?? null,
    phone: row.phone ?? null,
    qualification: row.qualification ?? null,
    specialization: row.specialization ?? null,
    joiningDate: row.joining_date ?? null,
    category: row.category ?? null,
  };
}

const routes: FastifyPluginAsync = async (fastify) => {
  const router = createRouteRegistrar(fastify);

  router.get("/identity/staff", requireAuth, requireRoles("super_admin", "org_admin", "campus_admin"), async (req, res, next) => {
    const user = req.campusUser;
    if (!user) return void res.status(401).send({ error: { code: "UNAUTHENTICATED", message: "Sign in to continue." } });
    const query = z.object({ category: z.string().trim().max(60).optional() }).safeParse(req.query);
    const categoryFilter = query.success ? query.data.category : undefined;
    try {
      const result = await withOrg(user.orgId, async (client) => {
        const rows = await client.query<{ user_id: string; name: string; email: string; roles: string[]; employee_code: string | null; phone: string | null; qualification: string | null; specialization: string | null; joining_date: string | null; category: string | null }>(
          `SELECT u.id AS user_id, u.name, u.email,
                  COALESCE(array_agg(DISTINCT r.role) FILTER (WHERE r.role IN ('super_admin','org_admin','campus_admin','hod','teacher','class_teacher')), '{}') AS roles,
                  sp.employee_code, sp.phone, sp.qualification, sp.specialization, sp.joining_date, sp.category
             FROM identity.users u
             JOIN identity.user_roles r ON r.org_id = u.org_id AND r.user_id = u.id
             LEFT JOIN identity.staff_profiles sp ON sp.org_id = u.org_id AND sp.user_id = u.id
            WHERE u.org_id = $1 AND u.status = 'active'
              ${categoryFilter ? "AND sp.category = $2" : ""}
            GROUP BY u.id, sp.org_id, sp.user_id, sp.employee_code, sp.phone, sp.qualification, sp.specialization, sp.joining_date, sp.category
            HAVING count(*) FILTER (WHERE r.role IN ('super_admin','org_admin','campus_admin','hod','teacher','class_teacher')) > 0
            ORDER BY lower(u.name)`,
          categoryFilter ? [user.orgId, categoryFilter] : [user.orgId],
        );
        return rows.rows.map(mapProfile);
      });
      res.send({ items: result });
    } catch (error) {
      next(error);
    }
  });

  router.put("/identity/staff/:userId/profile", requireAuth, requireRoles("super_admin", "org_admin", "campus_admin"), async (req, res, next) => {
    const user = req.campusUser;
    if (!user) return void res.status(401).send({ error: { code: "UNAUTHENTICATED", message: "Sign in to continue." } });
    const params = paramsSchema.safeParse(req.params);
    const body = staffProfileInput.safeParse(req.body);
    if (!params.success || !body.success) {
      return void res.status(400).send({ error: { code: "INVALID_REQUEST", message: "Provide valid staff record details." } });
    }

    try {
      const saved = await withOrg(user.orgId, async (client) => {
        const target = await client.query<{ id: string; name: string; email: string }>(
          `SELECT u.id, u.name, u.email FROM identity.users u
            WHERE u.org_id = $1 AND u.id = $2 AND u.status = 'active'
              AND EXISTS (SELECT 1 FROM identity.user_roles r WHERE r.org_id = u.org_id AND r.user_id = u.id AND r.role = ANY($3::text[]))`,
          [user.orgId, params.data.userId, [...staffRoles]],
        );
        if (!target.rows[0]) return null;

        const upsert = await client.query(
          `INSERT INTO identity.staff_profiles
             (org_id, user_id, employee_code, phone, qualification, specialization, joining_date, category)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (org_id, user_id) DO UPDATE SET
             employee_code = EXCLUDED.employee_code,
             phone = EXCLUDED.phone,
             qualification = EXCLUDED.qualification,
             specialization = EXCLUDED.specialization,
             joining_date = EXCLUDED.joining_date,
             category = EXCLUDED.category,
             updated_at = now()`,
          [
            user.orgId,
            params.data.userId,
            body.data.employeeCode ?? null,
            body.data.phone ?? null,
            body.data.qualification ?? null,
            body.data.specialization ?? null,
            body.data.joiningDate ?? null,
            body.data.category ?? null,
          ],
        );
        if (!upsert.rowCount) throw new Error("Staff record was not saved.");

        const roles = await client.query<{ role: string }>(
          "SELECT role FROM identity.user_roles WHERE org_id = $1 AND user_id = $2",
          [user.orgId, params.data.userId],
        );
        return mapProfile({
          user_id: target.rows[0].id,
          name: target.rows[0].name,
          email: target.rows[0].email,
          roles: roles.rows.map((row) => row.role),
          employee_code: body.data.employeeCode ?? null,
          phone: body.data.phone ?? null,
          qualification: body.data.qualification ?? null,
          specialization: body.data.specialization ?? null,
          joining_date: body.data.joiningDate ?? null,
          category: body.data.category ?? null,
        });
      });
      if (!saved) return void res.status(404).send({ error: { code: "NOT_FOUND", message: "Staff member not found." } });
      res.send(saved);
    } catch (error) {
      next(error);
    }
  });
};

export default routes;
