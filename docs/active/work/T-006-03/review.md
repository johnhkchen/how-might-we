# T-006-03 Review: Lock Down CORS Origins

## Summary of Changes

Restricted CORS origins from `*` (all origins) to the production CF Pages URL across both the CF Worker proxy and Lambda Function URL. Local development is unaffected — `*` remains the default for `wrangler dev` and the Go middleware.

## Files Modified

| File | Change |
|------|--------|
| `worker/src/index.ts` | Added `isOriginAllowed()` for origin validation. Refactored `corsHeaders()`, `jsonError()`, and `proxyToLambda()` to accept `requestOrigin` parameter. OPTIONS returns 403 for disallowed origins. POST requests still proxy but omit CORS headers for non-matching origins. |
| `worker/wrangler.toml` | Added documentation comment explaining `ALLOWED_ORIGIN = "*"` is for local dev only and is overridden by a wrangler secret in production. Includes instructions for adding custom domains. |
| `sst.config.ts` | Changed `url: true` to explicit `url: { cors: { allowOrigins, allowMethods, allowHeaders } }`. Uses `process.env.FRONTEND_URL` when set, falls back to `["*"]` otherwise. |
| `scripts/deploy.sh` | Added `FRONTEND_URL` env var support. Passes it to SST deploy for Lambda CORS. Sets `ALLOWED_ORIGIN` wrangler secret on the Worker. Updated deploy summary with CORS info. |
| `scripts/verify-deploy.sh` | Accepts optional `FRONTEND_URL` second argument. When provided, tests both allowed-origin acceptance and disallowed-origin rejection. Without it, falls back to original basic CORS check. |

## Files NOT Modified (as expected)

| File | Reason |
|------|--------|
| `backend/middleware.go` | Already correct — `*` for local dev, skips on Lambda |
| `frontend/*` | No CORS config on client side |

## Acceptance Criteria Assessment

| Criterion | Status | Evidence |
|-----------|--------|----------|
| CF Worker `ALLOWED_ORIGIN` set to CF Pages URL | **Ready** | Deploy script sets via `wrangler secret put ALLOWED_ORIGIN`; needs actual deploy to activate |
| Lambda Function URL CORS restricted | **Ready** | `sst.config.ts` now uses `FRONTEND_URL` env var for `allowOrigins`; needs SST deploy |
| CORS preflight works from allowed origin | **Ready** | Worker returns 204 with matching CORS headers when origin matches |
| Requests from other origins rejected | **Ready** | OPTIONS returns 403; POST omits CORS headers (browser blocks) |
| Local dev still works | **Pass** | `wrangler.toml` default is `*`; Go middleware unchanged; `go build ./...` passes |
| Document how to add additional origins | **Pass** | Comment in `wrangler.toml` explains the secret override pattern |

## Test Coverage

| Test | Type | Status |
|------|------|--------|
| Worker TypeScript type-check (`tsc --noEmit`) | Static | Pass |
| Go backend build (`go build ./...`) | Static | Pass |
| Frontend check (`npm run check`) | Static | Pass (0 errors) |
| CORS origin matching logic | Code review | Verified — `isOriginAllowed()` is straightforward |
| Deploy script correctness | Code review | Verified — follows existing patterns |
| Verify script CORS tests | Code review | Verified — tests both allowed and disallowed origins |
| Production CORS enforcement | Integration | Deferred — requires actual deployment |

## Open Concerns

1. **Single origin only**: The current implementation supports exactly one allowed origin via `ALLOWED_ORIGIN`. If multiple origins are needed (e.g., CF Pages + custom domain), the Worker would need to accept a comma-separated list and check against all entries. This is a known limitation documented in the wrangler.toml comment — sufficient for now.

2. **Lambda CORS is defense-in-depth only**: Since the Worker overwrites Lambda's CORS headers on proxied responses, the Lambda Function URL CORS restriction only matters if someone discovers and directly accesses the Lambda URL. This is intentional.

3. **No automated integration test**: CORS enforcement can only be fully verified against a deployed Worker with the secret set. The verify script handles this post-deploy, but there are no unit tests for the Worker's origin validation logic (CF Workers don't have a standard test runner in this project's setup).

4. **Deploy ordering**: The `ALLOWED_ORIGIN` secret must be set before `wrangler deploy` for it to take effect on the current deployment. The deploy script handles this correctly (step 3b before step 4).

## Architecture Impact

Minimal. The change is confined to the CORS layer — no new files, no new dependencies, no structural changes. The Worker's public API contract is unchanged; only the CORS headers vary based on the requesting origin.
