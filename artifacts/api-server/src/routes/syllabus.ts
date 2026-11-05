import type { FastifyPluginAsync } from "fastify";
import {
  CreateLearningSyllabusLessonBody,
  CreateLearningSyllabusMaterialBody,
  CreateLearningSyllabusMaterialParams,
  CreateLearningSyllabusTopicBody,
  CreateLearningSyllabusTopicParams,
  DeleteLearningSyllabusLessonParams,
  DeleteLearningSyllabusMaterialParams,
  DeleteLearningSyllabusTopicParams,
  GetLearningSyllabusQueryParams,
  UpdateLearningSyllabusLessonBody,
  UpdateLearningSyllabusLessonParams,
  UpdateLearningSyllabusMaterialBody,
  UpdateLearningSyllabusMaterialParams,
  UpdateLearningSyllabusTopicBody,
  UpdateLearningSyllabusTopicParams,
} from "@workspace/api-zod";
import type { PoolClient } from "pg";
import { withOrg } from "@workspace/db";
import { createRouteRegistrar } from "../lib/fastify-routes";
import { requireAuth, type AuthUser, type CampusRole } from "../lib/auth";

const adminRoles: CampusRole[] = ["super_admin", "org_admin", "campus_admin"];
const teacherRoles: CampusRole[] = ["teacher", "class_teacher", "hod"];
const errorBody = (code: string, message: string) => ({ error: { code, message } });
type ResourceKind = "lesson" | "topic" | "material";
type SyllabusTarget = { syllabusId: string; classId: string; subjectId: string };

function roleFlags(roles: CampusRole[]) {
  return {
    admin: roles.some((role) => adminRoles.includes(role)),
    teacher: roles.some((role) => teacherRoles.includes(role)),
    student: roles.includes("student"),
    parent: roles.includes("parent"),
  };
}

function hasValidHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

async function canManageClassSubject(
  client: PoolClient,
  user: AuthUser,
  classId: string,
  subjectId: string,
): Promise<boolean> {
  const roles = roleFlags(user.roles);
  if (!roles.admin && !roles.teacher) return false;
  const result = await client.query(
    `SELECT 1
       FROM academic.classes class
       JOIN academic.subjects subject ON subject.org_id=class.org_id
       JOIN academic.sections section ON section.org_id=class.org_id AND section.class_id=class.id
       JOIN academic.section_subjects offered
         ON offered.org_id=section.org_id AND offered.section_id=section.id
        AND offered.subject_id=subject.id AND offered.is_active=true
      WHERE class.org_id=$1 AND class.id=$2 AND subject.id=$3
        AND class.is_active=true AND section.is_active=true AND subject.is_active=true
        AND (
          $4::boolean
          OR ($5::boolean AND (
            EXISTS (
              SELECT 1 FROM academic.teacher_assignments assignment
               WHERE assignment.org_id=section.org_id AND assignment.section_id=section.id
                 AND assignment.subject_id=subject.id AND assignment.teacher_user_id=$6
            )
            OR EXISTS (
              SELECT 1 FROM academic.section_teachers class_teacher
               WHERE class_teacher.org_id=section.org_id AND class_teacher.section_id=section.id
                 AND class_teacher.teacher_user_id=$6 AND class_teacher.is_class_teacher=true
            )
          ))
        )
      LIMIT 1`,
    [user.orgId, classId, subjectId, roles.admin, roles.teacher, user.id],
  );
  return Boolean(result.rowCount);
}

async function syllabusTarget(
  client: PoolClient,
  orgId: string,
  kind: ResourceKind,
  resourceId: string,
): Promise<SyllabusTarget | null> {
  const queryByKind: Record<ResourceKind, string> = {
    lesson: `SELECT syllabus.id AS syllabus_id, syllabus.class_id, syllabus.subject_id
               FROM learning.syllabus_lessons lesson
               JOIN learning.syllabi syllabus
                 ON syllabus.org_id=lesson.org_id AND syllabus.id=lesson.syllabus_id
              WHERE lesson.org_id=$1 AND lesson.id=$2`,
    topic: `SELECT syllabus.id AS syllabus_id, syllabus.class_id, syllabus.subject_id
              FROM learning.syllabus_topics topic
              JOIN learning.syllabus_lessons lesson
                ON lesson.org_id=topic.org_id AND lesson.id=topic.lesson_id
              JOIN learning.syllabi syllabus
                ON syllabus.org_id=lesson.org_id AND syllabus.id=lesson.syllabus_id
             WHERE topic.org_id=$1 AND topic.id=$2`,
    material: `SELECT syllabus.id AS syllabus_id, syllabus.class_id, syllabus.subject_id
                 FROM learning.syllabus_materials material
                 JOIN learning.syllabus_topics topic
                   ON topic.org_id=material.org_id AND topic.id=material.topic_id
                 JOIN learning.syllabus_lessons lesson
                   ON lesson.org_id=topic.org_id AND lesson.id=topic.lesson_id
                 JOIN learning.syllabi syllabus
                   ON syllabus.org_id=lesson.org_id AND syllabus.id=lesson.syllabus_id
                WHERE material.org_id=$1 AND material.id=$2`,
  };
  const result = await client.query(queryByKind[kind], [orgId, resourceId]);
  const row = result.rows[0];
  return row ? {
    syllabusId: row.syllabus_id as string,
    classId: row.class_id as string,
    subjectId: row.subject_id as string,
  } : null;
}

async function canManageTarget(client: PoolClient, user: AuthUser, target: SyllabusTarget) {
  return canManageClassSubject(client, user, target.classId, target.subjectId);
}

async function audit(
  client: PoolClient,
  user: AuthUser,
  action: string,
  resourceType: string,
  resourceId: string,
  metadata: Record<string, unknown> = {},
) {
  await client.query(
    `INSERT INTO learning.audit_log (org_id, actor_user_id, action, resource_type, resource_id, metadata)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
    [user.orgId, user.id, action, resourceType, resourceId, JSON.stringify(metadata)],
  );
}

function emptySyllabusItem(row: any) {
  return {
    syllabusId: row.syllabus_id as string | null,
    classId: row.class_id as string,
    className: row.class_name as string,
    subjectId: row.subject_id as string,
    subjectName: row.subject_name as string,
    lessons: [] as any[],
  };
}

async function getSyllabusCatalog(client: PoolClient, user: AuthUser, filters: { classId?: string; subjectId?: string }) {
  const roles = roleFlags(user.roles);
  const catalog = await client.query(
    `SELECT DISTINCT syllabus.id AS syllabus_id, class.id AS class_id, class.name AS class_name,
            subject.id AS subject_id, subject.name AS subject_name
       FROM academic.classes class
       JOIN academic.sections section
         ON section.org_id=class.org_id AND section.class_id=class.id AND section.is_active=true
       JOIN academic.section_subjects offered
         ON offered.org_id=section.org_id AND offered.section_id=section.id AND offered.is_active=true
       JOIN academic.subjects subject
         ON subject.org_id=offered.org_id AND subject.id=offered.subject_id AND subject.is_active=true
       LEFT JOIN learning.syllabi syllabus
         ON syllabus.org_id=class.org_id AND syllabus.class_id=class.id AND syllabus.subject_id=subject.id
      WHERE class.org_id=$1 AND class.is_active=true
        AND ($2::uuid IS NULL OR class.id=$2)
        AND ($3::uuid IS NULL OR subject.id=$3)
        AND (
          $4::boolean
          OR ($5::boolean AND (
            EXISTS (
              SELECT 1 FROM academic.teacher_assignments assignment
               WHERE assignment.org_id=section.org_id AND assignment.section_id=section.id
                 AND assignment.subject_id=subject.id AND assignment.teacher_user_id=$7
            )
            OR EXISTS (
              SELECT 1 FROM academic.section_teachers class_teacher
               WHERE class_teacher.org_id=section.org_id AND class_teacher.section_id=section.id
                 AND class_teacher.teacher_user_id=$7 AND class_teacher.is_class_teacher=true
            )
          ))
          OR ($6::boolean AND EXISTS (
            SELECT 1 FROM academic.enrollments enrollment
             WHERE enrollment.org_id=section.org_id AND enrollment.section_id=section.id
               AND enrollment.student_user_id=$7 AND enrollment.status='active'
          ))
          OR ($8::boolean AND EXISTS (
            SELECT 1 FROM identity.guardian_links guardian
            JOIN academic.enrollments enrollment
              ON enrollment.org_id=guardian.org_id
             AND enrollment.student_user_id=guardian.student_user_id
             AND enrollment.status='active'
            WHERE guardian.org_id=section.org_id AND guardian.guardian_user_id=$7
              AND enrollment.section_id=section.id
          ))
        )
      ORDER BY class.name, subject.name`,
    [user.orgId, filters.classId ?? null, filters.subjectId ?? null,
      roles.admin, roles.teacher, roles.student, user.id, roles.parent],
  );
  const items = catalog.rows.map(emptySyllabusItem);
  const syllabusIds = items.map((item) => item.syllabusId).filter((id): id is string => Boolean(id));
  if (!syllabusIds.length) return { items, total: items.length };

  const content = await client.query(
    `SELECT syllabus.id AS syllabus_id,
            lesson.id AS lesson_id, lesson.title AS lesson_title,
            lesson.description AS lesson_description, lesson.position AS lesson_position,
            topic.id AS topic_id, topic.title AS topic_title,
            topic.description AS topic_description, topic.position AS topic_position,
            material.id AS material_id, material.title AS material_title, material.kind AS material_kind,
            material.url AS material_url, material.description AS material_description,
            material.position AS material_position
       FROM learning.syllabi syllabus
       LEFT JOIN learning.syllabus_lessons lesson
         ON lesson.org_id=syllabus.org_id AND lesson.syllabus_id=syllabus.id
       LEFT JOIN learning.syllabus_topics topic
         ON topic.org_id=lesson.org_id AND topic.lesson_id=lesson.id
       LEFT JOIN learning.syllabus_materials material
         ON material.org_id=topic.org_id AND material.topic_id=topic.id
      WHERE syllabus.org_id=$1 AND syllabus.id=ANY($2::uuid[])
      ORDER BY lesson.position, topic.position, material.position`,
    [user.orgId, syllabusIds],
  );

  const itemsBySyllabus = new Map(items.filter((item) => item.syllabusId).map((item) => [item.syllabusId!, item]));
  const lessons = new Map<string, any>();
  const topics = new Map<string, any>();
  for (const row of content.rows) {
    const syllabus = itemsBySyllabus.get(row.syllabus_id as string);
    if (!syllabus || !row.lesson_id) continue;
    let lesson = lessons.get(row.lesson_id as string);
    if (!lesson) {
      lesson = {
        id: row.lesson_id,
        title: row.lesson_title,
        description: row.lesson_description,
        position: row.lesson_position,
        topics: [],
      };
      lessons.set(row.lesson_id as string, lesson);
      syllabus.lessons.push(lesson);
    }
    if (!row.topic_id) continue;
    let topic = topics.get(row.topic_id as string);
    if (!topic) {
      topic = {
        id: row.topic_id,
        title: row.topic_title,
        description: row.topic_description,
        position: row.topic_position,
        materials: [],
      };
      topics.set(row.topic_id as string, topic);
      lesson.topics.push(topic);
    }
    if (row.material_id) {
      topic.materials.push({
        id: row.material_id,
        title: row.material_title,
        kind: row.material_kind,
        url: row.material_url,
        description: row.material_description,
        position: row.material_position,
      });
    }
  }
  return { items, total: items.length };
}

const routes: FastifyPluginAsync = async (fastify) => {
  const router = createRouteRegistrar(fastify);

  router.get("/learning/syllabus", requireAuth, async (req, res, next) => {
    const user = req.campusUser;
    const query = GetLearningSyllabusQueryParams.safeParse(req.query);
    if (!user) return void res.status(401).json(errorBody("UNAUTHENTICATED", "Sign in to continue."));
    if (!query.success) return void res.status(400).json(errorBody("INVALID_REQUEST", "Choose a valid class and subject."));
    try {
      const page = await withOrg(user.orgId, (client) =>
        getSyllabusCatalog(client, user, query.data));
      res.json(page);
    } catch (error) {
      next(error);
    }
  });

  router.post("/learning/syllabus/lessons", requireAuth, async (req, res, next) => {
    const user = req.campusUser;
    const body = CreateLearningSyllabusLessonBody.safeParse(req.body);
    if (!user) return void res.status(401).json(errorBody("UNAUTHENTICATED", "Sign in to continue."));
    if (!body.success) return void res.status(400).json(errorBody("INVALID_REQUEST", "Enter a lesson title and choose a class and subject."));
    try {
      const result = await withOrg(user.orgId, async (client) => {
        if (!await canManageClassSubject(client, user, body.data.classId, body.data.subjectId)) {
          return { kind: "forbidden" as const };
        }
        const syllabus = await client.query(
          `INSERT INTO learning.syllabi (org_id, class_id, subject_id, created_by, updated_by)
           VALUES ($1,$2,$3,$4,$4)
           ON CONFLICT (org_id, class_id, subject_id)
           DO UPDATE SET updated_by=EXCLUDED.updated_by, updated_at=now()
           RETURNING id`,
          [user.orgId, body.data.classId, body.data.subjectId, user.id],
        );
        const syllabusId = syllabus.rows[0].id as string;
        await client.query("SELECT id FROM learning.syllabi WHERE org_id=$1 AND id=$2 FOR UPDATE", [user.orgId, syllabusId]);
        const position = await client.query(
          `SELECT COALESCE(MAX(position)+1,0)::int AS next_position
             FROM learning.syllabus_lessons WHERE org_id=$1 AND syllabus_id=$2`,
          [user.orgId, syllabusId],
        );
        const created = await client.query(
          `INSERT INTO learning.syllabus_lessons
             (org_id, syllabus_id, title, description, position, created_by, updated_by)
           VALUES ($1,$2,$3,$4,$5,$6,$6)
           RETURNING id, title, description, position`,
          [user.orgId, syllabusId, body.data.title.trim(), body.data.description, position.rows[0].next_position, user.id],
        );
        const row = created.rows[0];
        await audit(client, user, "created", "syllabus_lesson", row.id, { syllabusId });
        return { kind: "created" as const, lesson: { ...row, topics: [] } };
      });
      if (result.kind === "forbidden") return void res.status(403).json(errorBody("FORBIDDEN", "You cannot manage this class and subject syllabus."));
      res.status(201).json(result.lesson);
    } catch (error) {
      next(error);
    }
  });

  router.put("/learning/syllabus/lessons/:lessonId", requireAuth, async (req, res, next) => {
    const user = req.campusUser;
    const params = UpdateLearningSyllabusLessonParams.safeParse(req.params);
    const body = UpdateLearningSyllabusLessonBody.safeParse(req.body);
    if (!user) return void res.status(401).json(errorBody("UNAUTHENTICATED", "Sign in to continue."));
    if (!params.success || !body.success || !Object.keys(body.data).length) {
      return void res.status(400).json(errorBody("INVALID_REQUEST", "Provide a lesson title or description."));
    }
    try {
      const result = await withOrg(user.orgId, async (client) => {
        const target = await syllabusTarget(client, user.orgId, "lesson", params.data.lessonId);
        if (!target) return { kind: "missing" as const };
        if (!await canManageTarget(client, user, target)) return { kind: "forbidden" as const };
        const updated = await client.query(
          `UPDATE learning.syllabus_lessons
              SET title=COALESCE($3,title), description=COALESCE($4,description),
                  updated_by=$5, updated_at=now()
            WHERE org_id=$1 AND id=$2
            RETURNING id,title,description,position`,
          [user.orgId, params.data.lessonId, body.data.title?.trim() ?? null, body.data.description ?? null, user.id],
        );
        await audit(client, user, "updated", "syllabus_lesson", params.data.lessonId);
        return { kind: "updated" as const, lesson: { ...updated.rows[0], topics: [] } };
      });
      if (result.kind === "missing") return void res.status(404).json(errorBody("NOT_FOUND", "Lesson not found."));
      if (result.kind === "forbidden") return void res.status(403).json(errorBody("FORBIDDEN", "You cannot edit this syllabus."));
      res.json(result.lesson);
    } catch (error) {
      next(error);
    }
  });

  router.delete("/learning/syllabus/lessons/:lessonId", requireAuth, async (req, res, next) => {
    const user = req.campusUser;
    const params = DeleteLearningSyllabusLessonParams.safeParse(req.params);
    if (!user) return void res.status(401).json(errorBody("UNAUTHENTICATED", "Sign in to continue."));
    if (!params.success) return void res.status(400).json(errorBody("INVALID_REQUEST", "Provide a valid lesson ID."));
    try {
      const result = await withOrg(user.orgId, async (client) => {
        const target = await syllabusTarget(client, user.orgId, "lesson", params.data.lessonId);
        if (!target) return "missing" as const;
        if (!await canManageTarget(client, user, target)) return "forbidden" as const;
        await audit(client, user, "deleted", "syllabus_lesson", params.data.lessonId);
        await client.query("DELETE FROM learning.syllabus_lessons WHERE org_id=$1 AND id=$2", [user.orgId, params.data.lessonId]);
        return "deleted" as const;
      });
      if (result === "missing") return void res.status(404).json(errorBody("NOT_FOUND", "Lesson not found."));
      if (result === "forbidden") return void res.status(403).json(errorBody("FORBIDDEN", "You cannot edit this syllabus."));
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  router.post("/learning/syllabus/lessons/:lessonId/topics", requireAuth, async (req, res, next) => {
    const user = req.campusUser;
    const params = CreateLearningSyllabusTopicParams.safeParse(req.params);
    const body = CreateLearningSyllabusTopicBody.safeParse(req.body);
    if (!user) return void res.status(401).json(errorBody("UNAUTHENTICATED", "Sign in to continue."));
    if (!params.success || !body.success) return void res.status(400).json(errorBody("INVALID_REQUEST", "Enter a topic title and description."));
    try {
      const result = await withOrg(user.orgId, async (client) => {
        const target = await syllabusTarget(client, user.orgId, "lesson", params.data.lessonId);
        if (!target) return { kind: "missing" as const };
        if (!await canManageTarget(client, user, target)) return { kind: "forbidden" as const };
        await client.query("SELECT id FROM learning.syllabus_lessons WHERE org_id=$1 AND id=$2 FOR UPDATE", [user.orgId, params.data.lessonId]);
        const position = await client.query(
          `SELECT COALESCE(MAX(position)+1,0)::int AS next_position
             FROM learning.syllabus_topics WHERE org_id=$1 AND lesson_id=$2`,
          [user.orgId, params.data.lessonId],
        );
        const created = await client.query(
          `INSERT INTO learning.syllabus_topics
             (org_id, lesson_id, title, description, position, created_by, updated_by)
           VALUES ($1,$2,$3,$4,$5,$6,$6)
           RETURNING id,title,description,position`,
          [user.orgId, params.data.lessonId, body.data.title.trim(), body.data.description, position.rows[0].next_position, user.id],
        );
        await audit(client, user, "created", "syllabus_topic", created.rows[0].id, { lessonId: params.data.lessonId });
        return { kind: "created" as const, topic: { ...created.rows[0], materials: [] } };
      });
      if (result.kind === "missing") return void res.status(404).json(errorBody("NOT_FOUND", "Lesson not found."));
      if (result.kind === "forbidden") return void res.status(403).json(errorBody("FORBIDDEN", "You cannot edit this syllabus."));
      res.status(201).json(result.topic);
    } catch (error) {
      next(error);
    }
  });

  router.put("/learning/syllabus/topics/:topicId", requireAuth, async (req, res, next) => {
    const user = req.campusUser;
    const params = UpdateLearningSyllabusTopicParams.safeParse(req.params);
    const body = UpdateLearningSyllabusTopicBody.safeParse(req.body);
    if (!user) return void res.status(401).json(errorBody("UNAUTHENTICATED", "Sign in to continue."));
    if (!params.success || !body.success || !Object.keys(body.data).length) return void res.status(400).json(errorBody("INVALID_REQUEST", "Provide a topic title or description."));
    try {
      const result = await withOrg(user.orgId, async (client) => {
        const target = await syllabusTarget(client, user.orgId, "topic", params.data.topicId);
        if (!target) return { kind: "missing" as const };
        if (!await canManageTarget(client, user, target)) return { kind: "forbidden" as const };
        const updated = await client.query(
          `UPDATE learning.syllabus_topics
              SET title=COALESCE($3,title), description=COALESCE($4,description),
                  updated_by=$5, updated_at=now()
            WHERE org_id=$1 AND id=$2
            RETURNING id,title,description,position`,
          [user.orgId, params.data.topicId, body.data.title?.trim() ?? null, body.data.description ?? null, user.id],
        );
        await audit(client, user, "updated", "syllabus_topic", params.data.topicId);
        return { kind: "updated" as const, topic: { ...updated.rows[0], materials: [] } };
      });
      if (result.kind === "missing") return void res.status(404).json(errorBody("NOT_FOUND", "Topic not found."));
      if (result.kind === "forbidden") return void res.status(403).json(errorBody("FORBIDDEN", "You cannot edit this syllabus."));
      res.json(result.topic);
    } catch (error) {
      next(error);
    }
  });

  router.delete("/learning/syllabus/topics/:topicId", requireAuth, async (req, res, next) => {
    const user = req.campusUser;
    const params = DeleteLearningSyllabusTopicParams.safeParse(req.params);
    if (!user) return void res.status(401).json(errorBody("UNAUTHENTICATED", "Sign in to continue."));
    if (!params.success) return void res.status(400).json(errorBody("INVALID_REQUEST", "Provide a valid topic ID."));
    try {
      const result = await withOrg(user.orgId, async (client) => {
        const target = await syllabusTarget(client, user.orgId, "topic", params.data.topicId);
        if (!target) return "missing" as const;
        if (!await canManageTarget(client, user, target)) return "forbidden" as const;
        await audit(client, user, "deleted", "syllabus_topic", params.data.topicId);
        await client.query("DELETE FROM learning.syllabus_topics WHERE org_id=$1 AND id=$2", [user.orgId, params.data.topicId]);
        return "deleted" as const;
      });
      if (result === "missing") return void res.status(404).json(errorBody("NOT_FOUND", "Topic not found."));
      if (result === "forbidden") return void res.status(403).json(errorBody("FORBIDDEN", "You cannot edit this syllabus."));
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  router.post("/learning/syllabus/topics/:topicId/materials", requireAuth, async (req, res, next) => {
    const user = req.campusUser;
    const params = CreateLearningSyllabusMaterialParams.safeParse(req.params);
    const body = CreateLearningSyllabusMaterialBody.safeParse(req.body);
    if (!user) return void res.status(401).json(errorBody("UNAUTHENTICATED", "Sign in to continue."));
    if (!params.success || !body.success || !hasValidHttpsUrl(body.success ? body.data.url : "")) {
      return void res.status(400).json(errorBody("INVALID_REQUEST", "Enter a title and a secure HTTPS document or video link."));
    }
    try {
      const result = await withOrg(user.orgId, async (client) => {
        const target = await syllabusTarget(client, user.orgId, "topic", params.data.topicId);
        if (!target) return { kind: "missing" as const };
        if (!await canManageTarget(client, user, target)) return { kind: "forbidden" as const };
        await client.query("SELECT id FROM learning.syllabus_topics WHERE org_id=$1 AND id=$2 FOR UPDATE", [user.orgId, params.data.topicId]);
        const position = await client.query(
          `SELECT COALESCE(MAX(position)+1,0)::int AS next_position
             FROM learning.syllabus_materials WHERE org_id=$1 AND topic_id=$2`,
          [user.orgId, params.data.topicId],
        );
        const created = await client.query(
          `INSERT INTO learning.syllabus_materials
             (org_id, topic_id, title, kind, url, description, position, created_by, updated_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8)
           RETURNING id,title,kind,url,description,position`,
          [user.orgId, params.data.topicId, body.data.title.trim(), body.data.kind,
            body.data.url, body.data.description, position.rows[0].next_position, user.id],
        );
        await audit(client, user, "created", "syllabus_material", created.rows[0].id, { topicId: params.data.topicId });
        return { kind: "created" as const, material: created.rows[0] };
      });
      if (result.kind === "missing") return void res.status(404).json(errorBody("NOT_FOUND", "Topic not found."));
      if (result.kind === "forbidden") return void res.status(403).json(errorBody("FORBIDDEN", "You cannot edit this syllabus."));
      res.status(201).json(result.material);
    } catch (error) {
      next(error);
    }
  });

  router.put("/learning/syllabus/materials/:materialId", requireAuth, async (req, res, next) => {
    const user = req.campusUser;
    const params = UpdateLearningSyllabusMaterialParams.safeParse(req.params);
    const body = UpdateLearningSyllabusMaterialBody.safeParse(req.body);
    if (!user) return void res.status(401).json(errorBody("UNAUTHENTICATED", "Sign in to continue."));
    if (!params.success || !body.success || !Object.keys(body.data).length
      || (body.data.url !== undefined && !hasValidHttpsUrl(body.data.url))) {
      return void res.status(400).json(errorBody("INVALID_REQUEST", "Provide valid material details and an HTTPS link."));
    }
    try {
      const result = await withOrg(user.orgId, async (client) => {
        const target = await syllabusTarget(client, user.orgId, "material", params.data.materialId);
        if (!target) return { kind: "missing" as const };
        if (!await canManageTarget(client, user, target)) return { kind: "forbidden" as const };
        const updated = await client.query(
          `UPDATE learning.syllabus_materials
              SET title=COALESCE($3,title), kind=COALESCE($4,kind), url=COALESCE($5,url),
                  description=COALESCE($6,description), updated_by=$7, updated_at=now()
            WHERE org_id=$1 AND id=$2
            RETURNING id,title,kind,url,description,position`,
          [user.orgId, params.data.materialId, body.data.title?.trim() ?? null, body.data.kind ?? null,
            body.data.url ?? null, body.data.description ?? null, user.id],
        );
        await audit(client, user, "updated", "syllabus_material", params.data.materialId);
        return { kind: "updated" as const, material: updated.rows[0] };
      });
      if (result.kind === "missing") return void res.status(404).json(errorBody("NOT_FOUND", "Material not found."));
      if (result.kind === "forbidden") return void res.status(403).json(errorBody("FORBIDDEN", "You cannot edit this syllabus."));
      res.json(result.material);
    } catch (error) {
      next(error);
    }
  });

  router.delete("/learning/syllabus/materials/:materialId", requireAuth, async (req, res, next) => {
    const user = req.campusUser;
    const params = DeleteLearningSyllabusMaterialParams.safeParse(req.params);
    if (!user) return void res.status(401).json(errorBody("UNAUTHENTICATED", "Sign in to continue."));
    if (!params.success) return void res.status(400).json(errorBody("INVALID_REQUEST", "Provide a valid material ID."));
    try {
      const result = await withOrg(user.orgId, async (client) => {
        const target = await syllabusTarget(client, user.orgId, "material", params.data.materialId);
        if (!target) return "missing" as const;
        if (!await canManageTarget(client, user, target)) return "forbidden" as const;
        await audit(client, user, "deleted", "syllabus_material", params.data.materialId);
        await client.query("DELETE FROM learning.syllabus_materials WHERE org_id=$1 AND id=$2", [user.orgId, params.data.materialId]);
        return "deleted" as const;
      });
      if (result === "missing") return void res.status(404).json(errorBody("NOT_FOUND", "Material not found."));
      if (result === "forbidden") return void res.status(403).json(errorBody("FORBIDDEN", "You cannot edit this syllabus."));
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });
};

export default routes;
