import Fastify, { type FastifyInstance } from "fastify";
import websocket from "@fastify/websocket";
import { loadRuntimeConfig } from "./lib/config";
import { logger } from "./lib/logger";

/**
 * The complete Campus Live API as a Fastify instance, without any listener.
 *
 * Used in two modes:
 * - standalone server: src/index.ts calls buildApp() and listens on PORT;
 * - embedded: the Next.js catch-all route (artifacts/campus-live/src/app/api/[...path]/route.ts)
 *   dispatches requests through app.inject(), so one Vercel deployment serves
 *   both the web app and the API.
 */
export async function buildApp(): Promise<FastifyInstance> {
  loadRuntimeConfig();

  const server = Fastify({
    bodyLimit: 1024 * 1024,
    connectionTimeout: 10_000,
    requestTimeout: 30_000,
    logger: false,
  });

  const requestStartedAt = new WeakMap<object, number>();
  server.decorateReply("json", function (this: import("fastify").FastifyReply, payload: unknown) {
    return this.send(payload);
  });
  server.addHook("onRequest", async (request) => {
    requestStartedAt.set(request, Date.now());
  });
  server.addHook("onSend", async (_request, reply, payload) => {
    reply
      .header("X-Content-Type-Options", "nosniff")
      .header("Referrer-Policy", "no-referrer")
      .header("X-Frame-Options", "DENY")
      .header("Permissions-Policy", "camera=(self), microphone=(self), geolocation=()");
    return payload;
  });
  server.addHook("onResponse", async (request, reply) => {
    logger.info(
      {
        req: {
          id: request.id,
          method: request.method,
          url: request.url.split("?")[0],
        },
        res: { statusCode: reply.statusCode },
        responseTime: Date.now() - (requestStartedAt.get(request) ?? Date.now()),
      },
      "request completed",
    );
  });
  server.setErrorHandler((error, request, reply) => {
    const candidate = error as { status?: number; statusCode?: number; code?: string; message?: string };
    const status = candidate.statusCode ?? candidate.status ?? 500;
    const safeStatus = status >= 400 && status < 500 ? status : 500;
    const code = safeStatus === 500 ? "INTERNAL_ERROR" : candidate.code ?? "REQUEST_FAILED";
    const message =
      safeStatus === 500
        ? "An unexpected error occurred."
        : candidate.message ?? "The request could not be completed.";
    if (safeStatus === 500) logger.error({ err: error, requestId: request.id }, "Request failed");
    return reply.code(safeStatus).send({ error: { code, message, requestId: request.id } });
  });
  server.setNotFoundHandler((request, reply) =>
    reply.code(404).send({
      error: { code: "NOT_FOUND", message: "Route not found.", requestId: request.id },
    }),
  );

  const routesModule = await import("./routes");
  await server.register(websocket, { options: { maxPayload: 64 * 1024 } });
  await server.register(routesModule.default, { prefix: "/api" });

  return server;
}
