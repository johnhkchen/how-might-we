# T-005-03 Progress: Rate Limiting

## Completed

### Step 1: Worker Env Interface and Config
- Added `RATE_LIMIT_IP_MAX` and `RATE_LIMIT_SESSION_MAX` to `Env` interface
- Added `getLimit()` helper for safe parsing with fallback
- Added defaults in `wrangler.toml` `[vars]`

### Step 2: Refactored Rate Limiter
- Defined `RateLimitResult` type with `allowed`, `remaining`, `resetAt`
- Rewrote IP limiter as `checkIpRateLimit()` returning metadata
- Added `checkSessionRateLimit()` with lifetime counter and periodic cleanup

### Step 3: Rate Limit Headers
- Added `rateLimitResponseHeaders()` helper producing `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`
- Enhanced `jsonError()` to accept extra headers for 429 responses with `Retry-After`

### Step 4: CORS Headers Updated
- Added `X-Session-Token` to `Access-Control-Allow-Headers`
- Added `Access-Control-Expose-Headers` with rate limit header names

### Step 5: Main Fetch Handler Updated
- IP check returns `RateLimitResult`; 429 includes `Retry-After` header
- Session token extracted from `X-Session-Token`; checked against session limit
- Rate limit headers injected into proxied Lambda responses

### Step 6: Frontend Session Token
- Generated `sessionToken = crypto.randomUUID()` at module scope in `client.ts`
- `apiFetch()` always attaches `X-Session-Token` header
- Simplified header logic — headers are always constructed, turnstile token added conditionally

### Step 7: Verify Script Updated
- Test 5 loop changed from 11 to 21 iterations
- Added sub-test for `X-RateLimit-Remaining` header presence

### Step 8: Build Verification
- `worker`: `npx tsc --noEmit` — clean (0 errors)
- `frontend`: `npm run check` — 0 errors, 0 warnings
- `frontend`: `npm run lint` — clean
- `scripts/verify-deploy.sh`: `bash -n` — syntax OK

## Deviations from Plan

None. All steps executed as planned.

## Remaining

All implementation steps complete. Ready for review phase.
