# Research: T-004-03 deploy-e2e-verification

## Scope

Deploy full stack (Lambda backend, CF Worker proxy, CF Pages frontend) and verify
the end-to-end flow: browser -> Worker -> Lambda -> BAML/Claude -> SSE stream back.

## Current Deployment State

### Backend (Lambda via SST)
- `sst.config.ts` defines `HmwApi` Lambda: `provided.al2023`, arm64, streaming enabled,
  Function URL enabled, 512 MB RAM, 5-min timeout.
- `backend/build.sh` cross-compiles Go+CGo (BAML) with zig for linux/arm64 -> `bootstrap`.
- Secret: `AnthropicApiKey` (SST Secret) -> `ANTHROPIC_API_KEY` env var.
- Deploy: `npx sst deploy` -> outputs `apiUrl` (the Lambda Function URL).
- Previous deploy succeeded (commit cd79530 "Deploy backend to Lambda with SSE streaming end-to-end").

### Worker Proxy (Cloudflare Worker)
- `worker/src/index.ts`: CORS, rate limiting (10 req/min per IP), Turnstile placeholder,
  transparent SSE proxy to Lambda (no buffering).
- `worker/wrangler.toml`: name `hmw-api-proxy`, `ALLOWED_ORIGIN = "*"`.
- Secrets needed: `LAMBDA_URL` (from SST output), optionally `TURNSTILE_SECRET_KEY`.
- Deploy: `cd worker && npx wrangler deploy` (independent from SST).
- Created in T-004-02, tested locally but not deployed to production yet.

### Frontend (SvelteKit -> Cloudflare Pages)
- `frontend/svelte.config.js`: uses `@sveltejs/adapter-cloudflare`.
- `frontend/wrangler.toml`: name `hmw-workshop`, output `.svelte-kit/cloudflare`.
- `frontend/src/lib/api/client.ts`: `PUBLIC_API_URL` env var (empty in dev, Worker URL in prod).
- Build: `cd frontend && npm run build` -> `.svelte-kit/cloudflare/`.
- Deploy: not yet configured. `sst.config.ts` has a TODO for CF Pages (SST v4 removed
  `sst.cloudflare.SvelteKit`). Options: `wrangler pages deploy`, CF dashboard, or
  `sst.cloudflare.StaticSite`.
- No `.env` files exist; `PUBLIC_API_URL` must be set at build time or as CF Pages env var.

## Request Flow (Production)

```
Browser (CF Pages)
  -> POST /api/{persona,analyze,expand,refine}
  -> CF Worker (hmw-api-proxy.*.workers.dev)
     - OPTIONS preflight -> 204 + CORS headers
     - Rate limit check (10/min per IP)
     - Proxy: fetch(LAMBDA_URL + pathname, {body, Content-Type})
  -> Lambda Function URL
     - Go handler: decode JSON, call BAML stream, write SSE events
     - lambdaResponseWriter streams via io.Pipe
     - LambdaFunctionURLStreamingResponse sends chunks
  <- SSE: "data: {partial}\n\n" ... "data: [DONE]\n\n"
  <- Worker passes response.body through (no buffering)
  <- Browser ReadableStream reader parses SSE, calls onPartial()
```

## Environment Variable Chain

| Variable | Where Set | Purpose |
|----------|-----------|---------|
| `ANTHROPIC_API_KEY` | SST Secret -> Lambda env | BAML client auth |
| `LAMBDA_URL` | Wrangler secret on Worker | Worker -> Lambda proxy target |
| `ALLOWED_ORIGIN` | `wrangler.toml` var | CORS origin (default `*`) |
| `PUBLIC_API_URL` | CF Pages env var or build-time | Frontend -> Worker URL |

## CORS Configuration

Both backend (Go `middleware.go`) and Worker set CORS headers. In production, the Worker's
CORS headers override backend's because it rebuilds the response headers. Both currently
allow `Origin: *`. The Worker uses `ALLOWED_ORIGIN` env var which can be restricted.

## SSE Streaming Path (Critical)

1. Backend `sse.go`: sets `Content-Type: text/event-stream`, `Cache-Control: no-cache`,
   `Connection: keep-alive`. Calls `Flusher.Flush()` after each event.
2. Lambda adapter `lambda.go`: `lambdaResponseWriter` implements `http.Flusher`. First
   `Flush()` signals headers ready, unblocks `LambdaFunctionURLStreamingResponse`.
   Subsequent writes flow through `io.Pipe` directly to Lambda's streaming response.
3. Worker `index.ts`: `return new Response(lambdaResponse.body, ...)` — passes the
   ReadableStream without buffering.
4. Frontend `stream.ts`: uses `response.body.getReader()` to consume chunks, splits on
   `\n\n`, parses `data: ` lines, calls `onPartial()`.

## Frontend Deployment Gap

SST v4 dropped `sst.cloudflare.SvelteKit`. The `sst.config.ts` has a TODO noting this.
Options for deploying the frontend:
1. `wrangler pages deploy .svelte-kit/cloudflare` — direct Pages deployment via CLI.
2. CF Dashboard -> Pages project linked to git repo with build command.
3. `sst.cloudflare.StaticSite` — SST construct for static assets (would need prerendering).

Option 1 is simplest and aligns with the Worker's independent deployment model.

## Testing Constraints

- No CI/CD pipeline exists; all deploys are manual CLI commands.
- No automated E2E tests for deployed environments (Playwright tests use mock fixtures).
- The 4 endpoints to test: `/api/persona`, `/api/analyze`, `/api/expand`, `/api/refine`.
- Each endpoint streams SSE responses requiring a real BAML/Claude call (costs apply).
- Verification must cover: CORS (no browser errors), SSE streaming (no dropped events),
  response time (first SSE event < 2 seconds), full workshop flow.

## Dependencies

- T-004-02 (Worker proxy): complete, code exists in `worker/`.
- T-004-01 (Lambda deploy): complete (commit cd79530), Lambda deployed and tested.
- AWS credentials: needed for `npx sst deploy` (profile `sst`).
- CF credentials: needed for `wrangler deploy` and `wrangler pages deploy`.
- Doppler: not needed in production (secrets injected via SST/Wrangler).

## Risks

1. **Lambda cold start** may exceed the 2-second first-event target on initial requests.
2. **CF Pages env vars**: `PUBLIC_API_URL` is a SvelteKit `$env/static/public` import —
   it must be set at **build time**, not runtime. CF Pages sets env vars for build, so
   this works, but if deploying via `wrangler pages deploy` the build must happen locally
   with the env var set.
3. **Double CORS headers**: Both Lambda and Worker set CORS. Worker rebuilds response headers
   from Lambda and adds its own CORS, so Lambda's CORS headers get forwarded too. This could
   result in duplicate `Access-Control-Allow-Origin` headers. Need to verify browsers handle
   this correctly (they may reject if two different values are present).
