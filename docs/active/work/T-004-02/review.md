# Review: T-004-02 cloudflare-worker-proxy

## Summary

A Cloudflare Worker proxy was created in `worker/` that sits between the frontend (CF Pages) and the Lambda Function URL. The Worker handles CORS preflight and response headers, basic IP-based rate limiting (10 req/min sliding window), and includes a Turnstile verification placeholder. SSE streaming responses pass through without buffering. The Worker bundles to 3.68 KiB and is deployable via `wrangler deploy`.

## Files Created

- **`worker/package.json`** — Minimal project manifest with wrangler, @cloudflare/workers-types, typescript as devDependencies
- **`worker/wrangler.toml`** — Worker configuration: name `hmw-api-proxy`, TypeScript entry point, `ALLOWED_ORIGIN` var (defaults to `*`)
- **`worker/tsconfig.json`** — TypeScript config targeting ES2022 with Cloudflare Workers types
- **`worker/src/index.ts`** (~130 lines) — Worker entry point with:
  - `Env` interface: `LAMBDA_URL` (secret), `ALLOWED_ORIGIN` (var), `TURNSTILE_SECRET_KEY` (optional secret)
  - CORS: OPTIONS → 204 with headers; all responses get CORS headers injected
  - Rate limiting: `Map<string, number[]>` sliding window, 10 requests/minute per `cf-connecting-ip`
  - Turnstile: Active when `TURNSTILE_SECRET_KEY` is set, checks `cf-turnstile-response` header
  - Proxy: `fetch(LAMBDA_URL + path)` with body passthrough, response body streamed directly
  - Error handling: JSON errors with status codes (404, 405, 429, 403, 502) all include CORS headers

## Files Modified

- **`package.json`** (root) — Added `dev:worker` and `deploy:worker` scripts
- **`CLAUDE.md`** — Updated architecture (four layers), added Worker commands section, added `worker/` to source layout, added Worker convention note

## Files NOT Modified

- `backend/*` — No changes. Go CORS middleware remains for local development.
- `frontend/*` — No changes. `PUBLIC_API_URL` env var in `client.ts` already supports pointing to the Worker.
- `sst.config.ts` — No changes. Worker is deployed independently via wrangler.

## Acceptance Criteria Evaluation

| Criteria | Status | Evidence |
|----------|--------|---------|
| Worker script created in project | **Pass** | `worker/src/index.ts` + supporting config |
| Proxies POST requests to Lambda Function URL | **Pass** | Verified with `wrangler dev` + `curl` — request forwarded to backend |
| Passes through SSE streaming responses without buffering | **Pass** | Live test with `doppler run` backend — `data:` events streamed incrementally through Worker |
| Handles CORS preflight and response headers | **Pass** | OPTIONS → 204 with CORS headers; all responses include CORS headers |
| Basic rate limiting by IP (10 req/minute) | **Pass** | 11th request in a minute returns 429 |
| Deployable via `wrangler deploy` or integrated into SST config | **Pass** | `wrangler deploy --dry-run` succeeds (3.68 KiB bundle) |

## Test Coverage

- **TypeScript compilation**: `wrangler deploy --dry-run` bundles without errors
- **CORS preflight**: Manual test — OPTIONS returns 204 with four CORS headers
- **Route rejection**: Manual test — GET returns 405, non-/api/ paths return 404
- **Backend not configured**: Manual test — missing LAMBDA_URL returns 502 with clear error
- **Rate limiting**: Manual test — 10th POST from same IP returns 429
- **Proxy pass-through**: Manual test — Worker forwards request to backend, returns backend's JSON error response
- **SSE streaming**: Manual test with live BAML backend — partial JSON objects stream incrementally through Worker
- **Build verification**: `go build ./...`, `npm run check`, `npm run lint` all pass
- **No automated Worker tests**: The Worker is a thin proxy (~130 lines) best verified via integration tests (T-004-03 scope)

## Open Concerns

### 1. LAMBDA_URL Must Be Set as a Wrangler Secret
After each SST deploy that changes the Lambda URL, `wrangler secret put LAMBDA_URL` must be run. This is a manual step. Automation could be added via a deploy script that reads SST outputs, but that adds complexity for a rare operation.

### 2. Rate Limiting Is Per-Isolate, Not Global
The in-memory `Map` is scoped to a single Worker isolate. In production, Cloudflare distributes requests across multiple isolates and data centers. An attacker could exceed 10 req/min globally while staying under the limit from each isolate's perspective. This is acceptable for the basic rate limiting spec; T-005-03 addresses advanced rate limiting with Durable Objects or KV.

### 3. ALLOWED_ORIGIN Defaults to Wildcard
`ALLOWED_ORIGIN = "*"` in `wrangler.toml` should be restricted to the CF Pages domain before production use. This can be overridden per environment via `wrangler.toml` `[env.production.vars]` or `wrangler secret put ALLOWED_ORIGIN`.

### 4. No Automated E2E Tests
The full Browser → Worker → Lambda path has not been tested in a deployed environment. This is explicitly T-004-03's scope (E2E Deployment Verification).

### 5. `npm install --ignore-scripts` Required
`sharp` (a wrangler optional dependency) fails to build natively. Using `--ignore-scripts` works around this since sharp is not needed for Worker development. This is a known issue with wrangler's dependency tree and may resolve in a future version.
