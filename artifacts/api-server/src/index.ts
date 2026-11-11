import { buildApp } from "./app";
import { logger } from "./lib/logger";
import { assertLeastPrivilegeDatabaseRole, pool } from "@workspace/db";

/**
 * Standalone API server (single long-lived process). The Next.js deployment
 * embeds the same app via buildApp() + inject instead of this entrypoint.
 */
const config = (await import("./lib/config")).loadRuntimeConfig();

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "Graceful shutdown started");
  const timeout = setTimeout(() => process.exit(1), 10_000);
  timeout.unref();
  try {
    await (globalThis as { __campusServer?: { close: () => Promise<void> } }).__campusServer?.close();
    await pool.end();
    process.exit(0);
  } catch (error) {
    logger.error({ err: error }, "Graceful shutdown failed");
    process.exit(1);
  }
}

try {
  const server = await buildApp();
  (globalThis as { __campusServer?: unknown }).__campusServer = server;
  await assertLeastPrivilegeDatabaseRole(pool);
  await server.listen({ port: config.PORT, host: "0.0.0.0" });
  const rawServer = (server.server as unknown as { headersTimeout: number });
  rawServer.headersTimeout = 10_000;
  logger.info({ port: config.PORT, runtime: "fastify" }, "Server listening");
} catch (error) {
  logger.error({ err: error }, "API server startup failed");
  await pool.end();
  process.exit(1);
}

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));
