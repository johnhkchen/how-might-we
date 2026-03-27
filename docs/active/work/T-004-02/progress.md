# Progress: T-004-02 cloudflare-worker-proxy

## Completed

### Step 1: Scaffold Worker Project
- Created `worker/package.json` with wrangler, @cloudflare/workers-types, typescript
- Created `worker/wrangler.toml` with name, main, compatibility_date, ALLOWED_ORIGIN var
- Created `worker/tsconfig.json` targeting ES2022 with Workers types
- `npm install --ignore-scripts` succeeded (sharp native build skipped, not needed)
- `npx wrangler --version` confirms 4.78.0

### Step 2: Implement Worker Entry Point
- Created `worker/src/index.ts` (~130 lines)
- Env interface: LAMBDA_URL, ALLOWED_ORIGIN, TURNSTILE_SECRET_KEY
- CORS handling: OPTIONS returns 204 with full CORS headers; all responses include CORS
- Route validation: 404 for non-/api/ paths, 405 for non-POST
- Rate limiting: sliding window Map, 10 req/min per IP (cf-connecting-ip)
- Turnstile placeholder: verifies token if TURNSTILE_SECRET_KEY is set, skips otherwise
- Proxy: fetch to LAMBDA_URL + pathname, passes body stream directly (no buffering)
- Error responses: JSON with appropriate status codes and CORS headers
- `npx wrangler deploy --dry-run` succeeds: 3.68 KiB / gzip 1.38 KiB

### Step 3: Update Root Configuration
- Added `dev:worker` and `deploy:worker` scripts to root `package.json`
- Updated `CLAUDE.md`: architecture, commands, source layout, conventions

### Step 4: Local Testing
All tests passed via `wrangler dev`:

| Test | Result |
|------|--------|
| CORS preflight (OPTIONS) | 204 with all CORS headers |
| 404 for non-API path | `{"error":"Not found"}` |
| 405 for GET on /api/* | `{"error":"Method not allowed"}` |
| 502 when LAMBDA_URL missing | `{"error":"Backend not configured"}` |
| Rate limiting at 10 req/min | 429 after 10th request |
| Proxy to local backend | Request forwarded, response proxied back |
| SSE streaming pass-through | Partial JSON objects streamed incrementally via Worker |

### Step 5: Verify Build and Lint
- `go build ./...` — passes (no backend changes)
- `npm run check` — 0 errors, 0 warnings
- `npm run lint` — passes

## Deviations from Plan

- Used `--ignore-scripts` for `npm install` to avoid sharp native build failure (sharp is an optional wrangler dependency not needed for Worker development)
- Tested SSE streaming with `doppler run` for live API key, confirming real BAML streaming works through the proxy
