import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Embedded Campus Live API: the entire Fastify app (all /api routes) runs
 * inside this Next.js deployment, so a single Vercel project serves both the
 * web app and the API. Requests are dispatched through Fastify's inject()
 * against the app built by @workspace/api-server buildApp().
 */
type CampusApi = {
  inject: (options: {
    method: string;
    url: string;
    headers: Record<string, string>;
    payload?: string;
    simulate?: { contentLength: boolean };
  }) => Promise<{
    statusCode: number;
    headers: Record<string, string | string[]>;
    rawPayload: Buffer;
  }>;
};

const globalForApi = globalThis as unknown as {
  __campusApi?: { app: CampusApi; ready: Promise<CampusApi> };
};

async function initialize(): Promise<CampusApi> {
  const [{ buildApp }, { assertLeastPrivilegeDatabaseRole, pool }] = await Promise.all([
    import("@workspace/api-server"),
    import("@workspace/db"),
  ]);
  const app = (await buildApp()) as unknown as CampusApi;
  await assertLeastPrivilegeDatabaseRole(pool);
  return app;
}

function getApi(): Promise<CampusApi> {
  if (!globalForApi.__campusApi) {
    globalForApi.__campusApi = { app: undefined as never, ready: initialize() };
  }
  return globalForApi.__campusApi.ready;
}

function invalidConfig(message: string) {
  return NextResponse.json(
    { error: { code: "API_NOT_CONFIGURED", message } },
    { status: 503 },
  );
}

async function dispatch(request: NextRequest, pathSegments: string[]): Promise<NextResponse> {
  let api: CampusApi;
  try {
    api = await getApi();
  } catch (error) {
    const message = error instanceof Error ? error.message : "The API could not start.";
    return invalidConfig(message.replace(/postgres(?:ql)?:\/\/\S+/gi, "[redacted]"));
  }

  const url = new URL(request.url);
  const path = pathSegments.map((segment) => encodeURIComponent(segment)).join("/");
  const target = `/api/${path}${url.search}`;

  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    if (["host", "content-length", "connection", "accept-encoding", "x-forwarded-*"].includes(key) || key.startsWith("x-forwarded-")) {
      return;
    }
    headers[key] = value;
  });

  let payload: string | undefined;
  if (request.method !== "GET" && request.method !== "HEAD") {
    payload = await request.text();
  }

  let response;
  try {
    response = await api.inject({
      method: request.method,
      url: target,
      headers,
      ...(payload === undefined ? {} : { payload }),
      simulate: { contentLength: false },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The request could not be dispatched.";
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message } },
      { status: 500 },
    );
  }

  const responseHeaders = new Headers();
  for (const [key, value] of Object.entries(response.headers)) {
    if (["content-length", "transfer-encoding", "connection", "keep-alive"].includes(key)) continue;
    for (const item of Array.isArray(value) ? value : [value]) {
      responseHeaders.append(key, item);
    }
  }

  const body = request.method === "HEAD" ? null : new Uint8Array(response.rawPayload);
  return new NextResponse(body, { status: response.statusCode, headers: responseHeaders });
}

type RouteContext = { params: Promise<{ path: string[] }> };

export async function GET(request: NextRequest, context: RouteContext) {
  return dispatch(request, (await context.params).path);
}

export async function POST(request: NextRequest, context: RouteContext) {
  return dispatch(request, (await context.params).path);
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  return dispatch(request, (await context.params).path);
}

export async function PUT(request: NextRequest, context: RouteContext) {
  return dispatch(request, (await context.params).path);
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  return dispatch(request, (await context.params).path);
}

export async function HEAD(request: NextRequest, context: RouteContext) {
  return dispatch(request, (await context.params).path);
}

export async function OPTIONS(request: NextRequest, context: RouteContext) {
  return dispatch(request, (await context.params).path);
}
