import type { NextConfig } from "next";

const configuredBasePath = process.env.BASE_PATH;
const basePath = configuredBasePath && configuredBasePath !== "/" ? configuredBasePath : undefined;
// Optional: proxy /api to an external API host for hybrid debugging.
// By default the API is embedded (src/app/api/[...path]/route.ts).
const apiOrigin = process.env.API_ORIGIN?.replace(/\/+$/, "");

const nextConfig: NextConfig = {
  ...(basePath ? { basePath } : {}),
  allowedDevOrigins: ["127.0.0.1", "localhost", ...(process.env.REPLIT_DEV_DOMAIN ? [process.env.REPLIT_DEV_DOMAIN] : [])],
  poweredByHeader: false,
  // The embedded API brings the Fastify app and its Node dependencies into
  // the server bundle; keep native/CJS packages external so Next loads them
  // at runtime instead of bundling.
  serverExternalPackages: ["pg", "pino", "fastify", "@fastify/websocket", "livekit-server-sdk"],
  transpilePackages: ["@workspace/api-server", "@workspace/db", "@workspace/api-zod"],
  async rewrites() {
    if (!apiOrigin) return [];
    // beforeFiles so an explicitly configured API_ORIGIN overrides the
    // embedded /api app route (hybrid debugging only).
    return {
      beforeFiles: [{ source: "/api/:path*", destination: `${apiOrigin}/api/:path*` }],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
