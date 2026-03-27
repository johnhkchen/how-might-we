# Plan: T-004-02 cloudflare-worker-proxy

## Step 1: Scaffold Worker Project

**Create:**
- `worker/package.json` — name, scripts (dev, deploy), devDependencies (wrangler, @cloudflare/workers-types, typescript)
- `worker/wrangler.toml` — name, main, compatibility_date, vars
- `worker/tsconfig.json` — Workers-compatible TS config

**Verify:**
- `cd worker && npm install` succeeds
- `npx wrangler --version` runs from worker directory

**Commit:** "scaffold worker project with wrangler config"

---

## Step 2: Implement Worker Entry Point

**Create:** `worker/src/index.ts`

Implement in order:
1. `Env` interface with `LAMBDA_URL`, `ALLOWED_ORIGIN`, `TURNSTILE_SECRET_KEY?`
2. CORS handling — `handleCors()` returns 204 for OPTIONS, null otherwise
3. `addCorsHeaders()` helper to inject CORS headers into any response
4. Route validation — reject non-POST or non-`/api/` paths with 404/405
5. `checkRateLimit()` — sliding window Map, 10 req/min per IP
6. `verifyTurnstile()` — placeholder, returns true if no secret configured
7. `proxyToLambda()` — fetch to Lambda URL, return streaming response
8. Main `fetch()` handler composing all the above

**Verify:**
- TypeScript compiles without errors: `cd worker && npx wrangler deploy --dry-run`

**Commit:** "implement worker proxy with CORS, rate limiting, and streaming"

---

## Step 3: Update Root Configuration

**Modify:** `package.json` (root)
- Add `"deploy:worker": "cd worker && npx wrangler deploy"`
- Add `"dev:worker": "cd worker && npx wrangler dev"`

**Modify:** `CLAUDE.md`
- Add Worker commands section
- Add `worker/` to source layout

**Verify:**
- Root scripts reference correct paths

**Commit:** "add worker deploy scripts and docs"

---

## Step 4: Local Testing with `wrangler dev`

**Test sequence:**
1. `cd worker && npx wrangler dev` — starts local Worker on port 8787
2. Test CORS preflight: `curl -X OPTIONS http://localhost:8787/api/persona -v`
   - Expect: 204 with CORS headers
3. Test 404 for non-API paths: `curl http://localhost:8787/health -v`
   - Expect: 404 with error JSON
4. Test 405 for GET: `curl http://localhost:8787/api/persona -v`
   - Expect: 405 with error JSON
5. Test proxy (requires Lambda URL secret set, or backend running):
   - If backend running locally: set `LAMBDA_URL=http://localhost:8080` in wrangler.toml [dev] vars
   - `curl -X POST http://localhost:8787/api/persona -H "Content-Type: application/json" -d '{"rawInput":"test"}' --no-buffer`
   - Expect: SSE stream forwarded from backend
6. Test rate limiting: send 11 rapid requests to same endpoint
   - Expect: 11th request returns 429

**No automated tests** — Worker is a thin proxy layer best tested via integration. Automated E2E testing is T-004-03's scope.

---

## Step 5: Verify Build and Lint

**Run:**
- `cd worker && npx wrangler deploy --dry-run` — confirms Worker bundles correctly
- `cd backend && go build ./...` — confirm no backend regressions
- `cd frontend && npm run check && npm run lint` — confirm no frontend regressions

**Commit:** (if any fixes needed)

---

## Testing Strategy

| What | How | When |
|------|-----|------|
| TypeScript compiles | `wrangler deploy --dry-run` | Step 2 |
| CORS preflight | `curl -X OPTIONS` against `wrangler dev` | Step 4 |
| Route rejection (404/405) | `curl` against `wrangler dev` | Step 4 |
| SSE streaming pass-through | `curl --no-buffer` against `wrangler dev` with backend running | Step 4 |
| Rate limiting triggers at 11th request | Rapid `curl` loop | Step 4 |
| No regressions | `go build`, `npm run check`, `npm run lint` | Step 5 |
| Full E2E (Browser → Worker → Lambda) | Out of scope (T-004-03) | — |

---

## Risk Mitigations

1. **Streaming buffering**: If Worker buffers SSE, the UX breaks. Mitigation: test with `curl --no-buffer` to confirm chunked delivery.
2. **LAMBDA_URL not set**: Worker returns 502 with clear error message rather than crashing.
3. **Rate limit memory**: Unbounded IP entries could exhaust memory. Mitigation: cleanup stale entries on every check.
4. **Wrangler version drift**: Pin wrangler version in `worker/package.json`.

---

## Out of Scope

- Deploying the Worker to production (requires CF account setup)
- Setting `LAMBDA_URL` secret (depends on which stage/account)
- Frontend `PUBLIC_API_URL` configuration (T-004-03)
- Turnstile frontend widget (T-005-02)
- Advanced rate limiting with per-session tracking (T-005-03)
