# Single-deployment setup: Vercel (web + API) + Supabase (DB + auth)

The whole product runs as **one Next.js deployment on Vercel**. The Fastify
API is embedded in the app (`artifacts/campus-live/src/app/api/[...path]/route.ts`
dispatches into the Fastify instance built by `artifacts/api-server/src/app.ts`),
so there is no separate API host to run or pay for.

```
Browser → Vercel (Next.js: pages + embedded /api routes)
        → Supabase (Postgres with tenant RLS, Auth, REST RPC for the login profile)
        → LiveKit Cloud (video media only — browser connects directly)
```

## Vercel environment variables

Set these in Project → Settings → Environment Variables:

| Variable | Value |
|---|---|
| `CAMPUS_DATABASE_URL` | Supabase **transaction pooler** URL for the `campus_app.<project-ref>` role (from root `.env`) |
| `CAMPUS_DB_POOL_MAX` | `2` (serverless instances share the pooler; keep per-instance pools small) |
| `SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `SUPABASE_SECRET_KEY` | Supabase service-role key |
| `SUPABASE_JWKS_URL` | `https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json` |
| `INTERNAL_API_KEY` | any random 32+ character string |
| `ENABLE_REDIS` | `false` (the readiness probe skips Redis) |
| `ENABLE_ONLINE_PAYMENTS` | `false` (until Razorpay is configured) |
| `NEXT_PUBLIC_SUPABASE_URL` | same as `SUPABASE_URL` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable (anon) key |
| `NEXT_PUBLIC_ENABLE_LIVE_CLASSES` | `true` |

### Live classes (video)

WebRTC media cannot run serverless; the browser connects directly to LiveKit Cloud.
Create a free project at https://cloud.livekit.io, then add:

| Variable | Value |
|---|---|
| `ENABLE_LIVE_CLASSES` | `true` |
| `LIVEKIT_PUBLIC_URL` | `wss://<your-project>.livekit.cloud` |
| `LIVEKIT_API_KEY` | from LiveKit Cloud → Settings → API Keys |
| `LIVEKIT_API_SECRET` | from LiveKit Cloud |

## Classroom board

The board WebSocket cannot be served by Vercel functions. The board
automatically uses **HTTP polling** (`NEXT_PUBLIC_BOARD_TRANSPORT` defaults to
`polling`): ops post immediately and every client syncs about once per second
from `board.ops` (durable, deduplicated, replay-capped — same data the
WebSocket used). Set `NEXT_PUBLIC_BOARD_TRANSPORT=ws` only when the API runs
on a standalone host (see `ops/DEPLOY-API.md`).

## Sign-in

Login goes directly from the browser to Supabase Auth
(`supabase.auth.signInWithPassword`); the campus profile (org, roles,
must-change-password) is fetched through the `my_campus_profile` PostgREST
RPC (identity migration `identity:007`). No API involvement is required to
sign in, and the embedded API verifies the same Supabase access token on
every request.

## Deploy checklist

1. Push `main` → Vercel builds (`vercel.json`): typecheck libs + api-server,
   build the campus-live workspace (which bundles the embedded API).
2. `https://<deployment>.vercel.app/api/healthz` → `{"status":"ok"}`.
3. Sign in at `/login` with the organization slug + admin account
   (`creds/admin-credentials.json`).
4. Live class smoke test once LiveKit Cloud vars are set.

## Standalone API (optional)

`artifacts/api-server` still runs as a single Node process
(`npm run start --workspace=@workspace/api-server`, or the Render blueprint in
`render.yaml`) for self-hosting or WebSocket board mode.
