# T-006-03 Plan: Lock Down CORS Origins

## Step 1: Update Worker CORS logic with origin validation

**File**: `worker/src/index.ts`

Changes:
1. Refactor `corsHeaders(env)` → `corsHeaders(env, requestOrigin)` to conditionally include CORS headers based on origin matching
2. Update `jsonError()` to accept and pass `requestOrigin`
3. Update `proxyToLambda()` to accept and pass `requestOrigin`
4. In main `fetch()` handler, extract `Origin` header and pass through
5. For OPTIONS: return 403 if ALLOWED_ORIGIN is not `*` and origin doesn't match
6. For POST: always proxy, but only include CORS headers if origin matches

**Verification**:
- `cd worker && npx wrangler deploy --dry-run` (type-check + bundle)
- Review that `corsHeaders` returns empty when origin doesn't match

## Step 2: Add documentation comment to wrangler.toml

**File**: `worker/wrangler.toml`

Add comment above `ALLOWED_ORIGIN` explaining that `*` is for local dev and is overridden by a wrangler secret in production.

**Verification**: Visual review only.

## Step 3: Restrict Lambda Function URL CORS in SST config

**File**: `sst.config.ts`

Change `url: true` to `url: { cors: { allowOrigins: [...], allowMethods: [...], allowHeaders: [...] } }` with conditional logic:
- If `process.env.FRONTEND_URL` is set → use it as the single allowed origin
- Otherwise → fall back to `["*"]` for local/dev

**Verification**: `npx sst diff` or dry run to inspect the generated CloudFormation.

## Step 4: Update deploy script to inject FRONTEND_URL

**File**: `scripts/deploy.sh`

Changes:
1. Read `FRONTEND_URL` from environment at the top (alongside `TURNSTILE_SITE_KEY`)
2. Pass `FRONTEND_URL` as env var to `npx sst deploy`
3. After setting `LAMBDA_URL` secret, also set `ALLOWED_ORIGIN` secret on Worker if `FRONTEND_URL` is set
4. Print CORS configuration in the deploy summary

**Verification**: Read through the script for correctness. Actual deploy verification is deferred to production.

## Step 5: Update verify script for CORS origin testing

**File**: `scripts/verify-deploy.sh`

Changes:
1. Accept optional second argument `FRONTEND_URL`
2. If provided: test that CORS preflight with matching origin returns correct `Access-Control-Allow-Origin`
3. If provided: test that CORS preflight with non-matching origin does NOT return matching `Access-Control-Allow-Origin`
4. If not provided: keep existing behavior (check headers are present)

**Verification**: Read through the script for correctness.

## Step 6: Verify Go backend builds and local dev is unaffected

Run `cd backend && go build ./...` to confirm no regressions in the backend.

Verify `backend/middleware.go` still works correctly for local dev (it should — we're not modifying it).

## Step 7: Verify frontend checks pass

Run `cd frontend && npm run check && npm run lint` to confirm no regressions.

## Testing Strategy

| What | How | When |
|------|-----|------|
| Worker type-checks and bundles | `npx wrangler deploy --dry-run` | Step 1 |
| Go backend compiles | `go build ./...` | Step 6 |
| Frontend lint/check | `npm run check && npm run lint` | Step 7 |
| CORS validation logic correctness | Code review of origin matching | Step 1 |
| Deploy script correctness | Code review | Step 4 |
| Production CORS enforcement | `scripts/verify-deploy.sh` post-deploy | Post-deploy |
| Local dev unaffected | `wrangler.toml` default is still `*` | Step 2 |

## Commit Plan

- Single commit covering all changes (small, cohesive ticket)
- Alternatively, two commits if useful:
  1. Worker + wrangler.toml + sst.config.ts (code changes)
  2. Deploy + verify scripts (operational changes)
