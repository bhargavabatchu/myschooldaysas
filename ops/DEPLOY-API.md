# Deploying the Campus Live API

Vercel hosts only the Next.js web app. The Fastify API must run on an
always-on host (it holds DB pools, serves the classroom board WebSocket, and
mints LiveKit tokens). Recommended: Render or Railway (~$5–7/month).

## Option A — Render (Blueprint)

1. Push this repo to GitHub (the `render.yaml` blueprint is included).
2. Render dashboard → **New → Blueprint** → pick the repo → apply.
3. Fill in the prompted secret values (see table below).
4. After deploy, copy the service URL (e.g. `https://campus-live-api.onrender.com`).
5. In **Vercel** → project settings → Environment Variables, set:
   - `API_ORIGIN` = `https://campus-live-api.onrender.com`
   - `NEXT_PUBLIC_SUPABASE_URL` = your Supabase URL
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = your publishable key
   - `NEXT_PUBLIC_ENABLE_LIVE_CLASSES` = `true`
6. Redeploy the Vercel project.

## Option B — Railway / Fly

- Build: `npm ci --include=dev && npm run build --workspace=@workspace/api-server`
- Start: `npm run start --workspace=@workspace/api-server`
- Health check: `GET /api/healthz`

## Required environment variables on the API host

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `CAMPUS_DATABASE_URL` | Supabase pooler URL for the `campus_app.<project-ref>` role (from your root `.env`) |
| `SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `SUPABASE_SECRET_KEY` | Supabase service-role key |
| `SUPABASE_JWKS_URL` | `https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json` |
| `INTERNAL_API_KEY` | any random 32+ char string |
| `ENABLE_REDIS` | `false` (readiness falls back gracefully) |
| `ENABLE_ONLINE_PAYMENTS` | `false` until Razorpay is configured |

### Live classes (optional but wanted)

| Variable | Value |
|---|---|
| `ENABLE_LIVE_CLASSES` | `true` |
| `LIVEKIT_PUBLIC_URL` | `wss://<your-project>.livekit.cloud` |
| `LIVEKIT_API_KEY` | from LiveKit Cloud |
| `LIVEKIT_API_SECRET` | from LiveKit Cloud |

Create the free project at https://cloud.livekit.io → Project Settings → API Keys.

## Post-deploy checks

1. `curl https://<api-host>/api/healthz` → `{"status":"ok"}`
2. Sign in on the Vercel site with Organization `my-school-days`
   (see `creds/admin-credentials.json`).
3. Live class: teacher starts a session → camera/mic connect → student joins
   subscribe-only → teacher grants mic → attendance records.
