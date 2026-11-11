import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { withOrg } from "@workspace/db";
import { CreateBoardTemplateBody } from "@workspace/api-zod";
import { boardAccess } from "../lib/classroom-board";
import { requireAuth } from "../lib/auth";
import { createRouteRegistrar } from "../lib/fastify-routes";

/**
 * HTTP polling transport for the classroom board, used when the API runs
 * embedded in a serverless deployment where the WebSocket route
 * (/board/boards/:id/ws in classroom-board.ts) cannot be served. The
 * authoritative state is the same: board.boards seq/config/status plus
 * board.ops rows, so a polling client and a WebSocket client interoperate
 * on the same board without changes.
 */

const stroke = z.object({
  kind: z.literal("stroke"),
  tool: z.enum(["pen", "highlighter", "eraser"]),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  width: z.number().min(1).max(50),
  points: z.array(z.object({
    x: z.number().finite().min(0).max(1600),
    y: z.number().finite().min(0).max(900),
  })).min(1).max(800),
}).strict();

const opBody = z.object({ id: z.string().uuid(), op: stroke }).strict();
const configBody = z.object({ config: CreateBoardTemplateBody.shape.config }).strict();
const grantBody = z.object({ userId: z.string().uuid(), canDraw: z.boolean() }).strict();
const syncQuery = z.object({ since: z.coerce.number().int().min(0).optional() });

const errorBody = (code: string, message: string) => ({ error: { code, message } });

const routes: FastifyPluginAsync = async (fastify) => {
  const router = createRouteRegistrar(fastify);

  router.get("/board/boards/:boardId/sync", requireAuth, async (req, res, next) => {
    const user = req.campusUser;
    if (!user) return void res.status(401).json(errorBody("UNAUTHENTICATED", "Sign in to continue."));
    const boardId = String((req.params as Record<string, string>).boardId ?? "");
    const parsed = syncQuery.safeParse(req.query);
    if (!parsed.success) return void res.status(400).json(errorBody("INVALID_REQUEST", "Provide a valid board sync cursor."));

    try {
      const snapshot = await withOrg(user.orgId, async (client) => {
        const { board, access, canDraw } = await boardAccess(client, user, boardId);
        if (board.status !== "open" || access.status !== "live") {
          return { closed: true as const };
        }
        const since = parsed.data.since;
        const count = await client.query<{ count: string }>(
          "SELECT COUNT(*)::text AS count FROM board.ops WHERE org_id = $1 AND board_id = $2",
          [user.orgId, boardId],
        );
        if (Number(count.rows[0]?.count) > 5000) {
          throw Object.assign(new Error("The board has exceeded the live replay limit."), { status: 413, code: "BOARD_TOO_LARGE" });
        }
        const ops = await client.query(
          since === undefined
            ? "SELECT seq::text, id, user_id AS \"userId\", op FROM board.ops WHERE org_id = $1 AND board_id = $2 ORDER BY seq"
            : "SELECT seq::text, id, user_id AS \"userId\", op FROM board.ops WHERE org_id = $1 AND board_id = $2 AND seq > $3 ORDER BY seq",
          since === undefined ? [user.orgId, boardId] : [user.orgId, boardId, since],
        );
        return {
          closed: false as const,
          seq: Number(board.seq),
          config: board.config,
          ops: ops.rows.map(({ seq, ...op }) => ({ ...op, seq: Number(seq) })),
          canDraw,
          canManage: access.canManage,
          role: access.role,
        };
      });
      if (snapshot.closed) {
        return void res.status(409).json(errorBody("BOARD_CLOSED", "This board is closed."));
      }
      res.json({ type: "sync", ...snapshot });
    } catch (error) {
      next(error);
    }
  });

  router.post("/board/boards/:boardId/ops", requireAuth, async (req, res, next) => {
    const user = req.campusUser;
    if (!user) return void res.status(401).json(errorBody("UNAUTHENTICATED", "Sign in to continue."));
    const boardId = String((req.params as Record<string, string>).boardId ?? "");
    const parsed = opBody.safeParse(req.body);
    if (!parsed.success) return void res.status(400).json(errorBody("INVALID_FRAME", "Invalid board operation."));

    try {
      const result = await withOrg(user.orgId, async (client) => {
        const { board, access, canDraw } = await boardAccess(client, user, boardId);
        if (board.status !== "open" || access.status !== "live") {
          throw Object.assign(new Error("The class has ended."), { status: 409, code: "BOARD_CLOSED" });
        }
        if (!canDraw || !board.config.tools?.includes(parsed.data.op.tool) ||
          (access.role === "student" && !board.config.participants.studentTools?.includes(parsed.data.op.tool))) {
          throw Object.assign(new Error("Drawing is not allowed."), { status: 403, code: "DRAW_FORBIDDEN" });
        }
        const existing = await client.query<{ seq: string; op: unknown }>(
          "SELECT seq::text, op FROM board.ops WHERE org_id = $1 AND board_id = $2 AND id = $3",
          [user.orgId, boardId, parsed.data.id],
        );
        if (existing.rows[0]) {
          return { duplicate: true as const, type: "op" as const, seq: Number(existing.rows[0].seq), id: parsed.data.id, userId: user.id, op: existing.rows[0].op };
        }
        const next = await client.query<{ seq: string }>(
          "UPDATE board.boards SET seq = seq + 1 WHERE org_id = $1 AND id = $2 RETURNING seq::text",
          [user.orgId, boardId],
        );
        await client.query(
          "INSERT INTO board.ops (id, org_id, board_id, seq, user_id, op) VALUES ($1, $2, $3, $4, $5, $6::jsonb)",
          [parsed.data.id, user.orgId, boardId, next.rows[0]!.seq, user.id, JSON.stringify(parsed.data.op)],
        );
        return { type: "op" as const, seq: Number(next.rows[0]!.seq), id: parsed.data.id, userId: user.id, op: parsed.data.op };
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  router.post("/board/boards/:boardId/config", requireAuth, async (req, res, next) => {
    const user = req.campusUser;
    if (!user) return void res.status(401).json(errorBody("UNAUTHENTICATED", "Sign in to continue."));
    const boardId = String((req.params as Record<string, string>).boardId ?? "");
    const parsed = configBody.safeParse(req.body);
    if (!parsed.success) return void res.status(400).json(errorBody("INVALID_FRAME", "Invalid board configuration."));

    try {
      await withOrg(user.orgId, async (client) => {
        const { board, access } = await boardAccess(client, user, boardId);
        if (board.status !== "open" || access.status !== "live") {
          throw Object.assign(new Error("The class has ended."), { status: 409, code: "BOARD_CLOSED" });
        }
        if (!access.canManage) {
          throw Object.assign(new Error("Only teachers may change the board."), { status: 403, code: "FORBIDDEN" });
        }
        await client.query(
          "UPDATE board.boards SET config = $3::jsonb WHERE org_id = $1 AND id = $2",
          [user.orgId, boardId, JSON.stringify(parsed.data.config)],
        );
      });
      res.json({ type: "config", config: parsed.data.config });
    } catch (error) {
      next(error);
    }
  });

  router.post("/board/boards/:boardId/grants", requireAuth, async (req, res, next) => {
    const user = req.campusUser;
    if (!user) return void res.status(401).json(errorBody("UNAUTHENTICATED", "Sign in to continue."));
    const boardId = String((req.params as Record<string, string>).boardId ?? "");
    const parsed = grantBody.safeParse(req.body);
    if (!parsed.success) return void res.status(400).json(errorBody("INVALID_FRAME", "Invalid draw grant."));

    try {
      await withOrg(user.orgId, async (client) => {
        const { board, access } = await boardAccess(client, user, boardId);
        if (board.status !== "open" || access.status !== "live") {
          throw Object.assign(new Error("The class has ended."), { status: 409, code: "BOARD_CLOSED" });
        }
        if (!access.canManage) {
          throw Object.assign(new Error("Only teachers may change the board."), { status: 403, code: "FORBIDDEN" });
        }
        if (board.config.participants.allowDrawGrants !== true) {
          throw Object.assign(new Error("Draw grants are disabled for this board."), { status: 403, code: "GRANTS_DISABLED" });
        }
        const enrolled = await client.query(
          `SELECT 1 FROM live.session_sections ss
            JOIN academic.enrollments e ON e.org_id = ss.org_id AND e.section_id = ss.section_id
           WHERE ss.org_id = $1 AND ss.session_id = $2 AND e.student_user_id = $3 AND e.status = 'active' LIMIT 1`,
          [user.orgId, board.session_id, parsed.data.userId],
        );
        if (!enrolled.rowCount) {
          throw Object.assign(new Error("Only enrolled students can receive a draw grant."), { status: 403, code: "FORBIDDEN" });
        }
        await client.query(
          `INSERT INTO board.draw_grants (org_id, board_id, user_id, can_draw) VALUES ($1, $2, $3, $4)
           ON CONFLICT (org_id, board_id, user_id) DO UPDATE SET can_draw = EXCLUDED.can_draw`,
          [user.orgId, boardId, parsed.data.userId, parsed.data.canDraw],
        );
      });
      res.json({ type: "grant", userId: parsed.data.userId, canDraw: parsed.data.canDraw });
    } catch (error) {
      next(error);
    }
  });
};

export default routes;
