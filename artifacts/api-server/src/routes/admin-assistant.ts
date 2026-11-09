import type { FastifyPluginAsync } from "fastify";
import { withOrg } from "@workspace/db";
import { AskAdminAssistantBody } from "@workspace/api-zod";
import { createRouteRegistrar } from "../lib/fastify-routes";
import { requireAuth, type CampusRole } from "../lib/auth";
import { classifyAdminAssistantQuestion } from "../lib/admin-assistant-policy.ts";
import {
  answerFeeCollections,
  answerFeeOutstanding,
} from "../lib/admin-assistant-fees.ts";
import {
  answerAttendanceToday,
  answerStudentCount,
  answerStudentLookup,
} from "../lib/admin-assistant-school.ts";
import { helpAnswer } from "../lib/admin-assistant-shared.ts";

const adminRoles: CampusRole[] = ["super_admin", "org_admin", "campus_admin"];
const errorBody = (code: string, message: string) => ({ error: { code, message } });

const routes: FastifyPluginAsync = async (fastify) => {
  const router = createRouteRegistrar(fastify);

  router.post("/admin/assistant/query", requireAuth, async (req, res, next) => {
    const user = req.campusUser;
    if (!user) return void res.status(401).json(errorBody("UNAUTHENTICATED", "Sign in to continue."));
    if (!user.roles.some((role) => adminRoles.includes(role))) {
      return void res.status(403).json(errorBody("FORBIDDEN", "Administrator role required."));
    }
    const parsed = AskAdminAssistantBody.safeParse(req.body);
    if (!parsed.success) {
      return void res.status(400).json(errorBody("INVALID_QUESTION", "Ask a question in 1–300 characters."));
    }

    const intent = classifyAdminAssistantQuestion(parsed.data.question);
    if (intent.kind === "help") return void res.json(helpAnswer());

    try {
      const answer = await withOrg(user.orgId, async (client) => {
        switch (intent.kind) {
          case "fee_collections":
            return answerFeeCollections(client, user.orgId, intent.range);
          case "fee_outstanding":
            return answerFeeOutstanding(client, user.orgId, intent);
          case "student_count":
            return answerStudentCount(client, user.orgId, intent.classTerm, intent.classBreakdown);
          case "student_lookup":
            return answerStudentLookup(client, user.orgId, intent.term);
          case "attendance_today":
            return answerAttendanceToday(client, user.orgId);
        }
      });
      res.json(answer);
    } catch (error) {
      next(error);
    }
  });
};

export default routes;
