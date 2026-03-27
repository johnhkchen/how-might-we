# Research: T-004-02 cloudflare-worker-proxy

## Objective

Map the codebase elements relevant to building a Cloudflare Worker that proxies requests from the frontend (CF Pages) to the Lambda Function URL, handling CORS, rate limiting, and Turnstile verification placeholder.

---

## Current Request Flow

### Local Development
```
Browser → localhost:5173 (SvelteKit) → Vite proxy /api/* → localhost:8080 (Go HTTP server)
```
- Vite config at `frontend/vite.config.ts` proxies `/api` to `http://localhost:8080`
- No CORS issues since same-origin via proxy

### Production (current, after T-004-01)
```
Browser → CF Pages (SvelteKit) → ??? → Lambda Function URL (Go + BAML)
```
- Lambda is deployed with streaming Function URL (SST config at `sst.config.ts`)
- Function URL is a raw AWS endpoint: `https://<id>.lambda-url.us-west-1.on.aws/`
- No proxy exists yet — frontend has no way to reach Lambda in production
- `frontend/src/lib/api/client.ts` uses `PUBLIC_API_URL` env var for the base URL

### Desired (after this ticket)
```
Browser → CF Pages (SvelteKit) → CF Worker → Lambda Function URL (Go + BAML)
```

---

## CORS Handling

### Current Go Middleware (`backend/middleware.go`)
- Sets `Access-Control-Allow-Origin: *` on all responses
- Allows `POST, OPTIONS` methods, `Content-Type` header
- Returns 204 for OPTIONS preflight
- T-004-01 review flagged wildcard origin as needing restriction in production

### Worker Implications
- Worker will handle CORS for the frontend-to-worker hop
- Go CORS middleware still needed for local dev (no worker locally)
- Worker should set `Access-Control-Allow-Origin` to the CF Pages domain specifically
- Worker handles OPTIONS preflight; Lambda never sees preflight requests

---

## SSE Streaming Path

### Backend Streaming (`backend/sse.go`)
- Sets `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`
- Writes `data: {json}\n\n` per partial, then `data: [DONE]\n\n`
- Calls `Flusher.Flush()` after each event

### Lambda Streaming (`backend/lambda.go`)
- `lambdaResponseWriter` implements `http.Flusher` via `io.Pipe`
- Headers signaled via `sync.Once` — first `Flush()` commits headers
- Lambda Function URL with `RESPONSE_STREAM` delivers events incrementally

### Frontend SSE Client (`frontend/src/lib/api/stream.ts`)
- Uses `fetch()` + `ReadableStream` reader (not EventSource)
- Buffers on `\n\n` boundaries, parses `data: ` prefix
- Processes `[DONE]` sentinel to detect end of stream

### Worker Streaming Constraint
- **Critical**: Worker must NOT buffer the SSE response
- Cloudflare Workers support `TransformStream` for pass-through streaming
- `fetch()` in a Worker returns a `ReadableStream` body — can be piped directly to the client response
- Headers like `Content-Type: text/event-stream` must be forwarded, not altered
- `Cache-Control: no-cache` must be preserved

---

## SST Configuration (`sst.config.ts`)

- Lambda deployed as `sst.aws.Function("HmwApi")` with `streaming: true`, `url: true`
- Returns `apiUrl` as output — this URL needs to be injected into the Worker as an env var
- No Cloudflare provider configured in SST yet
- Comment notes `sst.cloudflare.SvelteKit` was removed in SST v4
- SST v3 does have `@pulumi/cloudflare` available (found in `.sst/platform/`)

---

## Wrangler / Worker Infrastructure

### Available Tooling
- `wrangler@4.78.0` installed in `frontend/node_modules` (available as dev dependency)
- No `wrangler.toml` exists anywhere in the repo
- No `worker/` directory exists

### Deployment Options
1. **Standalone `wrangler deploy`** — Worker script + `wrangler.toml` in a `worker/` directory
2. **SST Cloudflare Worker construct** — Define Worker in `sst.config.ts` using Pulumi Cloudflare provider
3. **CF Pages Functions** — SvelteKit adapter-cloudflare supports `functions/` directory for edge middleware

### Cloudflare Workers Runtime
- V8 isolates, not Node.js — no `require()`, no Node built-ins
- `fetch()` API available for outbound requests
- `Request`/`Response` Web APIs
- Supports `TransformStream` for streaming
- KV, Durable Objects, Cache API available for state (rate limiting)
- `cf.connectingIP` or `request.headers.get('cf-connecting-ip')` for client IP
- 10ms CPU time limit on free plan (50ms on paid), but this is CPU time, not wall time

---

## Rate Limiting

### Requirements
- Basic rate limiting by IP: 10 requests/minute
- T-005-03 will add advanced rate limiting later (20 req/min per-IP, 50/session)

### Implementation Options in Workers
1. **In-memory Map** — Simple but per-isolate (resets on redeploy, doesn't share across isolates)
2. **Cloudflare Rate Limiting rules** — Configured in dashboard/API, not in Worker code
3. **Cache API** — Use `caches.default` to store counters per IP, with TTL
4. **KV** — Eventually consistent, not ideal for precise rate limiting
5. **Durable Objects** — Strong consistency but complex for basic use case

### For basic 10 req/min
- Cache API is the simplest in-worker approach that persists across isolate restarts
- Alternatively, in-memory Map is simplest to implement and "good enough" for prototyping

---

## Turnstile Verification

### Requirements
- Placeholder only in this ticket — T-005-02 handles full implementation
- Worker should have a code path for Turnstile token verification (skipped/stubbed)

### How Turnstile Works
- Frontend sends a `cf-turnstile-response` token in request headers or body
- Worker verifies token via `https://challenges.cloudflare.com/turnstile/v0/siteverify`
- Requires `TURNSTILE_SECRET_KEY` env var
- Returns `{ success: true/false }` — Worker blocks request if false

---

## Frontend API Client (`frontend/src/lib/api/client.ts`)

- `apiUrl(path)` prepends `PUBLIC_API_URL` env var (empty string in dev → relative URL → Vite proxy)
- In production, `PUBLIC_API_URL` should point to the Worker URL, not directly to Lambda
- Worker URL will be something like `https://hmw-api.<account>.workers.dev` or a custom domain

---

## Key Files Affected

| File | Role | Change Needed |
|------|------|--------------|
| `worker/src/index.ts` | Worker script | **Create** |
| `worker/wrangler.toml` | Worker config | **Create** |
| `worker/package.json` | Worker dependencies | **Create** (minimal) |
| `worker/tsconfig.json` | TypeScript config | **Create** |
| `sst.config.ts` | Infrastructure | May wire Worker URL as output |
| `package.json` (root) | Workspace scripts | Add deploy:worker script |
| `CLAUDE.md` | Documentation | Add worker commands |

---

## Constraints and Assumptions

1. **Free tier target**: Worker must work within Cloudflare free tier (100k requests/day, 10ms CPU time)
2. **Streaming is non-negotiable**: SSE must pass through without buffering
3. **Lambda URL is dynamic**: Changes per deploy — Worker needs it as env var, not hardcoded
4. **Two-hop latency**: Browser → Worker → Lambda adds ~10-30ms but is acceptable
5. **No authentication yet**: Worker is publicly accessible (Turnstile is future)
6. **Local dev unchanged**: Worker is production-only; local dev continues using Vite proxy
