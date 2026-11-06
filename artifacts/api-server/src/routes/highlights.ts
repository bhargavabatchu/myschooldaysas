import { randomUUID } from "node:crypto";
import { Client as ObjectStorageClient } from "@replit/object-storage";
import type { FastifyPluginAsync } from "fastify";
import {
  CreateSchoolHighlightBody,
  GetSchoolHighlightsQueryParams,
  GetSchoolHighlightPhotoParams,
} from "@workspace/api-zod";
import { withOrg } from "@workspace/db";
import { createRouteRegistrar } from "../lib/fastify-routes";
import { requireAuth, type CampusRole } from "../lib/auth";
import { normalizeStoredHighlightPhoto, parseHighlightPhotoDataUrl } from "../lib/highlight-photo.ts";

const adminRoles: CampusRole[] = ["super_admin", "org_admin", "campus_admin"];
const errorBody = (code: string, message: string) => ({ error: { code, message } });

const highlightAudienceSql = `
  (
    $3::boolean
    OR h.audience = 'school'
    OR (
      h.audience IN ('class', 'section')
      AND (
        EXISTS (
          SELECT 1
            FROM academic.enrollments e
            JOIN academic.sections s ON s.org_id=e.org_id AND s.id=e.section_id
           WHERE e.org_id=h.org_id AND e.student_user_id=$2 AND e.status='active'
             AND (
               (h.audience='section' AND s.id=ANY(h.audience_ids))
               OR (h.audience='class' AND s.class_id=ANY(h.audience_ids))
             )
        )
        OR EXISTS (
          SELECT 1
            FROM identity.guardian_links gl
            JOIN academic.enrollments e
              ON e.org_id=gl.org_id AND e.student_user_id=gl.student_user_id AND e.status='active'
            JOIN academic.sections s ON s.org_id=e.org_id AND s.id=e.section_id
           WHERE gl.org_id=h.org_id AND gl.guardian_user_id=$2
             AND (
               (h.audience='section' AND s.id=ANY(h.audience_ids))
               OR (h.audience='class' AND s.class_id=ANY(h.audience_ids))
             )
        )
        OR EXISTS (
          SELECT 1 FROM academic.section_teachers st
           WHERE st.org_id=h.org_id AND st.teacher_user_id=$2
             AND h.audience='section' AND st.section_id=ANY(h.audience_ids)
        )
        OR EXISTS (
          SELECT 1 FROM academic.teacher_assignments ta
           WHERE ta.org_id=h.org_id AND ta.teacher_user_id=$2
             AND h.audience='section' AND ta.section_id=ANY(h.audience_ids)
        )
        OR EXISTS (
          SELECT 1 FROM academic.sections s
          JOIN academic.section_teachers st ON st.org_id=s.org_id AND st.section_id=s.id
           WHERE s.org_id=h.org_id AND st.teacher_user_id=$2
             AND h.audience='class' AND s.class_id=ANY(h.audience_ids)
        )
        OR EXISTS (
          SELECT 1 FROM academic.sections s
          JOIN academic.teacher_assignments ta ON ta.org_id=s.org_id AND ta.section_id=s.id
           WHERE s.org_id=h.org_id AND ta.teacher_user_id=$2
             AND h.audience='class' AND s.class_id=ANY(h.audience_ids)
        )
      )
    )
  )
`;

function mapHighlight(row: any) {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    category: row.category,
    audience: row.audience,
    audienceId: row.audience_id ?? null,
    audienceName: row.audience_name ?? null,
    publishedAt: row.published_at instanceof Date ? row.published_at.toISOString() : new Date(row.published_at).toISOString(),
    expiresAt: row.expires_at ? (row.expires_at instanceof Date ? row.expires_at.toISOString() : new Date(row.expires_at).toISOString()) : null,
    createdBy: row.created_by,
    authorName: row.author_name,
    photoUrl: row.photo_object_name ? `/api/highlights/${row.id}/photo` : null,
    photoAlt: row.photo_alt ?? null,
  };
}

function isStorageConfiguredError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /bucket|storage|replit|credential|permission/i.test(message);
}

const routes: FastifyPluginAsync = async (fastify) => {
  const router = createRouteRegistrar(fastify);

  router.get("/highlights", requireAuth, async (req, res, next) => {
    const user = req.campusUser;
    if (!user) return void res.status(401).json(errorBody("UNAUTHENTICATED", "Sign in to continue."));
    const parsed = GetSchoolHighlightsQueryParams.safeParse(req.query);
    if (!parsed.success) return void res.status(400).json(errorBody("INVALID_REQUEST", "Provide valid highlight filters."));

    try {
      const isAdmin = user.roles.some((role) => adminRoles.includes(role));
      const result = await withOrg(user.orgId, async (client) => {
        const values = [user.orgId, user.id, isAdmin];
        const where = `h.org_id=$1 AND h.published_at <= now()
          AND (h.expires_at IS NULL OR h.expires_at > now())
          AND ${highlightAudienceSql}`;
        const count = await client.query<{ total: number }>(
          `SELECT count(*)::int AS total FROM school.highlights h WHERE ${where}`,
          values,
        );
        const page = await client.query(
          `SELECT h.id, h.title, h.body, h.category, h.audience, h.audience_ids,
                  h.published_at, h.expires_at, h.created_by, h.photo_object_name, h.photo_alt,
                  author.name AS author_name,
                  CASE WHEN h.audience='class' THEN
                    (SELECT c.name FROM academic.classes c WHERE c.org_id=h.org_id AND c.id=h.audience_ids[1])
                       WHEN h.audience='section' THEN
                    (SELECT c.name || ' · ' || s.name FROM academic.sections s
                       JOIN academic.classes c ON c.org_id=s.org_id AND c.id=s.class_id
                      WHERE s.org_id=h.org_id AND s.id=h.audience_ids[1])
                    ELSE NULL END AS audience_name,
                  CASE WHEN h.audience IN ('class','section') THEN h.audience_ids[1] ELSE NULL END AS audience_id
             FROM school.highlights h
             JOIN identity.users author ON author.org_id=h.org_id AND author.id=h.created_by
            WHERE ${where}
            ORDER BY h.published_at DESC, h.id DESC
            LIMIT $4`,
          [...values, parsed.data.limit ?? 12],
        );
        return { items: page.rows.map(mapHighlight), total: Number(count.rows[0]?.total ?? 0) };
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  router.post("/highlights", requireAuth, async (req, res, next) => {
    const user = req.campusUser;
    if (!user) return void res.status(401).json(errorBody("UNAUTHENTICATED", "Sign in to continue."));
    if (!user.roles.some((role) => adminRoles.includes(role))) {
      return void res.status(403).json(errorBody("FORBIDDEN", "Only school administrators can publish school highlights."));
    }
    const parsed = CreateSchoolHighlightBody.safeParse(req.body);
    if (!parsed.success) return void res.status(400).json(errorBody("INVALID_REQUEST", "Provide valid highlight details."));
    const input = parsed.data;
    const targetedAudience = input.audience === "class" || input.audience === "section";
    const photo = input.photoDataUrl ? parseHighlightPhotoDataUrl(input.photoDataUrl) : null;
    if (
      (targetedAudience && !input.audienceId) ||
      (!targetedAudience && input.audienceId) ||
      (input.expiresAt && new Date(input.expiresAt).getTime() <= Date.now()) ||
      (!!input.photoDataUrl && !photo) ||
      (!!input.photoDataUrl && (!input.photoAlt || !input.photoConsentConfirmed)) ||
      (!input.photoDataUrl && (input.photoAlt || input.photoConsentConfirmed))
    ) {
      return void res.status(400).json(errorBody("INVALID_REQUEST", "The audience, expiry, or photo details are not valid."));
    }

    try {
      const scopeExists = !targetedAudience || await withOrg(user.orgId, async (client) => {
        const scope = input.audience === "class"
          ? await client.query("SELECT id FROM academic.classes WHERE org_id=$1 AND id=$2 AND is_active", [user.orgId, input.audienceId])
          : await client.query("SELECT id FROM academic.sections WHERE org_id=$1 AND id=$2 AND is_active", [user.orgId, input.audienceId]);
        return Boolean(scope.rowCount);
      });
      if (!scopeExists) return void res.status(404).json(errorBody("NOT_FOUND", "The selected class or section was not found."));

      const objectName = photo ? `school-highlights/${user.orgId}/${randomUUID()}.${photo.contentType === "image/jpeg" ? "jpg" : photo.contentType.slice("image/".length)}` : null;
      if (photo && objectName) {
        try {
          const uploaded = await new ObjectStorageClient().uploadFromBytes(objectName, photo.bytes);
          if (!uploaded.ok) {
            await new ObjectStorageClient().delete(objectName).catch(() => undefined);
            return void res.status(503).json(errorBody("STORAGE_UNAVAILABLE", "Photo storage is not ready. Check the school's App Storage setup and try again."));
          }
        } catch {
          await new ObjectStorageClient().delete(objectName).catch(() => undefined);
          return void res.status(503).json(errorBody("STORAGE_UNAVAILABLE", "Photo storage is not ready. Check the school's App Storage setup and try again."));
        }
      }

      let highlightId: string;
      try {
        const inserted = await withOrg(user.orgId, async (client) => {
          if (targetedAudience) {
            const scope = input.audience === "class"
              ? await client.query("SELECT id FROM academic.classes WHERE org_id=$1 AND id=$2 AND is_active", [user.orgId, input.audienceId])
              : await client.query("SELECT id FROM academic.sections WHERE org_id=$1 AND id=$2 AND is_active", [user.orgId, input.audienceId]);
            if (!scope.rowCount) return { missing: true as const };
          }
          const result = await client.query<{ id: string }>(
            `INSERT INTO school.highlights
               (org_id, title, body, category, audience, audience_ids,
                photo_object_name, photo_content_type, photo_alt, photo_consent_confirmed,
                expires_at, created_by)
             VALUES ($1,$2,$3,$4,$5,$6::uuid[],$7,$8,$9,$10,$11,$12)
             RETURNING id`,
            [
              user.orgId,
              input.title.trim(),
              input.body.trim(),
              input.category,
              input.audience,
              targetedAudience ? [input.audienceId!] : [],
              objectName,
              photo?.contentType ?? null,
              photo ? input.photoAlt!.trim() : null,
              Boolean(photo && input.photoConsentConfirmed),
              input.expiresAt ?? null,
              user.id,
            ],
          );
          return { id: result.rows[0].id };
        });
        if ("missing" in inserted) {
          if (objectName) await new ObjectStorageClient().delete(objectName).catch(() => undefined);
          return void res.status(404).json(errorBody("NOT_FOUND", "The selected class or section was not found."));
        }
        highlightId = inserted.id;
      } catch (error) {
        if (objectName) await new ObjectStorageClient().delete(objectName).catch(() => undefined);
        throw error;
      }

      const created = await withOrg(user.orgId, async (client) => {
        const result = await client.query(
          `SELECT h.id, h.title, h.body, h.category, h.audience, h.audience_ids,
                  h.published_at, h.expires_at, h.created_by, h.photo_object_name, h.photo_alt,
                  author.name AS author_name,
                  CASE WHEN h.audience='class' THEN
                    (SELECT c.name FROM academic.classes c WHERE c.org_id=h.org_id AND c.id=h.audience_ids[1])
                       WHEN h.audience='section' THEN
                    (SELECT c.name || ' · ' || s.name FROM academic.sections s
                       JOIN academic.classes c ON c.org_id=s.org_id AND c.id=s.class_id
                      WHERE s.org_id=h.org_id AND s.id=h.audience_ids[1])
                    ELSE NULL END AS audience_name,
                  CASE WHEN h.audience IN ('class','section') THEN h.audience_ids[1] ELSE NULL END AS audience_id
             FROM school.highlights h
             JOIN identity.users author ON author.org_id=h.org_id AND author.id=h.created_by
            WHERE h.org_id=$1 AND h.id=$2`,
          [user.orgId, highlightId],
        );
        return mapHighlight(result.rows[0]);
      });
      res.status(201).json(created);
    } catch (error) {
      next(error);
    }
  });

  router.get("/highlights/:highlightId/photo", requireAuth, async (req, res, next) => {
    const user = req.campusUser;
    if (!user) return void res.status(401).json(errorBody("UNAUTHENTICATED", "Sign in to continue."));
    const parsed = GetSchoolHighlightPhotoParams.safeParse(req.params);
    if (!parsed.success) return void res.status(400).json(errorBody("INVALID_REQUEST", "Provide a valid highlight."));
    try {
      const isAdmin = user.roles.some((role) => adminRoles.includes(role));
      const media = await withOrg(user.orgId, async (client) => {
        const result = await client.query<{ object_name: string | null; content_type: string | null }>(
          `SELECT h.photo_object_name AS object_name, h.photo_content_type AS content_type
             FROM school.highlights h
            WHERE h.org_id=$1 AND h.id=$4 AND h.photo_object_name IS NOT NULL
              AND h.published_at <= now() AND (h.expires_at IS NULL OR h.expires_at > now())
              AND ${highlightAudienceSql}`,
          [user.orgId, user.id, isAdmin, parsed.data.highlightId],
        );
        return result.rows[0] ?? null;
      });
      if (!media?.object_name || !media.content_type) return void res.status(404).json(errorBody("NOT_FOUND", "Photo not found or not available to this account."));
      const downloaded = await new ObjectStorageClient().downloadAsBytes(media.object_name);
      if (!downloaded.ok) return void res.status(503).json(errorBody("STORAGE_UNAVAILABLE", "This photo is temporarily unavailable."));
      const photoBytes = normalizeStoredHighlightPhoto(downloaded.value);
      if (!photoBytes) return void res.status(503).json(errorBody("STORAGE_UNAVAILABLE", "This photo is temporarily unavailable."));
      res
        .type(media.content_type)
        .header("Cache-Control", "private, no-store")
        .header("Vary", "Authorization")
        .send(photoBytes);
    } catch (error) {
      if (isStorageConfiguredError(error)) {
        return void res.status(503).json(errorBody("STORAGE_UNAVAILABLE", "Photo storage is not ready. Check the school's App Storage setup."));
      }
      next(error);
    }
  });
};

export default routes;
