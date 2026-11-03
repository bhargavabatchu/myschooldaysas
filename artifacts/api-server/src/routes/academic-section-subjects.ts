import type { FastifyPluginAsync } from "fastify";
import {
  GetSectionSubjectsParams,
  UpdateSectionSubjectsBody,
  UpdateSectionSubjectsParams,
} from "@workspace/api-zod";
import type { PoolClient } from "pg";
import { withOrg } from "@workspace/db";
import { createRouteRegistrar } from "../lib/fastify-routes";
import { requireAuth, type CampusRole } from "../lib/auth";

const adminRoles: CampusRole[] = ["super_admin", "org_admin", "campus_admin"];
const errorBody = (code: string, message: string) => ({ error: { code, message } });

async function listSectionSubjects(client: PoolClient, orgId: string, sectionId: string) {
  const result = await client.query(
    `SELECT subject.id, subject.code, subject.name, subject.is_active,
            COALESCE(section_subject.is_active, false) AS is_offered
       FROM academic.subjects subject
       LEFT JOIN academic.section_subjects section_subject
         ON section_subject.org_id = subject.org_id
        AND section_subject.section_id = $2
        AND section_subject.subject_id = subject.id
      WHERE subject.org_id = $1
      ORDER BY subject.name, subject.code`,
    [orgId, sectionId],
  );
  return {
    items: result.rows.map((row: any) => ({
      subjectId: row.id,
      code: row.code,
      name: row.name,
      isActive: row.is_active,
      isOffered: row.is_offered,
    })),
    total: result.rowCount ?? result.rows.length,
  };
}

const routes: FastifyPluginAsync = async (fastify) => {
  const router = createRouteRegistrar(fastify);

  router.get("/academic/sections/:sectionId/subjects", requireAuth, async (req, res, next) => {
    const user = req.campusUser;
    const params = GetSectionSubjectsParams.safeParse(req.params);
    if (!user) return void res.status(401).json(errorBody("UNAUTHENTICATED", "Sign in to continue."));
    if (!user.roles.some((role) => adminRoles.includes(role))) {
      return void res.status(403).json(errorBody("FORBIDDEN", "Only administrators can manage section subjects."));
    }
    if (!params.success) return void res.status(400).json(errorBody("INVALID_REQUEST", "Provide a valid section ID."));
    try {
      const result = await withOrg(user.orgId, async (client) => {
        const section = await client.query(
          `SELECT section.id
             FROM academic.sections section
             JOIN academic.classes class ON class.org_id = section.org_id AND class.id = section.class_id
            WHERE section.org_id = $1 AND section.id = $2
              AND section.is_active = true AND class.is_active = true`,
          [user.orgId, params.data.sectionId],
        );
        if (!section.rowCount) return null;
        return listSectionSubjects(client, user.orgId, params.data.sectionId);
      });
      if (!result) return void res.status(404).json(errorBody("NOT_FOUND", "Active section not found."));
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  router.put("/academic/sections/:sectionId/subjects", requireAuth, async (req, res, next) => {
    const user = req.campusUser;
    const params = UpdateSectionSubjectsParams.safeParse(req.params);
    const body = UpdateSectionSubjectsBody.safeParse(req.body);
    if (!user) return void res.status(401).json(errorBody("UNAUTHENTICATED", "Sign in to continue."));
    if (!user.roles.some((role) => adminRoles.includes(role))) {
      return void res.status(403).json(errorBody("FORBIDDEN", "Only administrators can manage section subjects."));
    }
    if (!params.success || !body.success || new Set(body.data.subjectIds).size !== body.data.subjectIds.length) {
      return void res.status(400).json(errorBody("INVALID_REQUEST", "Choose a valid list of unique subjects."));
    }

    try {
      const result = await withOrg(user.orgId, async (client) => {
        const section = await client.query(
          `SELECT section.id
             FROM academic.sections section
             JOIN academic.classes class ON class.org_id = section.org_id AND class.id = section.class_id
            WHERE section.org_id = $1 AND section.id = $2
              AND section.is_active = true AND class.is_active = true
            FOR UPDATE OF section`,
          [user.orgId, params.data.sectionId],
        );
        if (!section.rowCount) return { kind: "missing" as const };

        const selected = body.data.subjectIds;
        const activeSubjects = await client.query<{ count: number }>(
          `SELECT COUNT(*)::int AS count
             FROM academic.subjects
            WHERE org_id = $1 AND id = ANY($2::uuid[]) AND is_active = true`,
          [user.orgId, selected],
        );
        if ((activeSubjects.rows[0]?.count ?? 0) !== selected.length) {
          return { kind: "invalid-subjects" as const };
        }

        await client.query(
          `UPDATE academic.section_subjects
              SET is_active = false, updated_at = now()
            WHERE org_id = $1 AND section_id = $2 AND is_active = true
              AND NOT (subject_id = ANY($3::uuid[]))`,
          [user.orgId, params.data.sectionId, selected],
        );
        if (selected.length) {
          await client.query(
            `INSERT INTO academic.section_subjects (org_id, section_id, subject_id)
             SELECT $1, $2, subject.id
               FROM academic.subjects subject
              WHERE subject.org_id = $1 AND subject.id = ANY($3::uuid[])
                AND subject.is_active = true
             ON CONFLICT (org_id, section_id, subject_id)
             DO UPDATE SET is_active = true, updated_at = now()`,
            [user.orgId, params.data.sectionId, selected],
          );
        }
        return {
          kind: "updated" as const,
          page: await listSectionSubjects(client, user.orgId, params.data.sectionId),
        };
      });
      if (result.kind === "missing") return void res.status(404).json(errorBody("NOT_FOUND", "Active section not found."));
      if (result.kind === "invalid-subjects") {
        return void res.status(400).json(errorBody("INVALID_REQUEST", "One or more selected subjects are inactive or unavailable."));
      }
      res.json(result.page);
    } catch (error) {
      next(error);
    }
  });
};

export default routes;
