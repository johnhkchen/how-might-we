# T-005-03 Plan: Rate Limiting

## Step 1: Update Worker Env Interface and Config

**Files**: `worker/src/index.ts`, `worker/wrangler.toml`

- Add `RATE_LIMIT_IP_MAX?: string` and `RATE_LIMIT_SESSION_MAX?: string` to `Env` interface.
- Add defaults in `wrangler.toml` `[vars]` section.
- Add a helper to parse config: `getLimit(val: string | undefined, fallback: number): number`.

**Verify**: TypeScript compiles (`npx tsc --noEmit` in worker directory).

## Step 2: Refactor Rate Limiter with Metadata Returns

**Files**: `worker/src/index.ts`

- Define `RateLimitResult` type: `{ allowed: boolean; remaining: number; resetAt: number }`.
- Rewrite `checkRateLimit` as `checkIpRateLimit(ip: string, max: number): RateLimitResult`.
  - Same sliding-window algorithm.
  - Calculate `remaining = max - validCount` (after push if allowed).
  - Calculate `resetAt` = earliest timestamp in valid array + window duration (when the oldest entry expires).
  - Return the result object instead of boolean.
- Add `checkSessionRateLimit(token: string, max: number): RateLimitResult`.
  - Maintain `sessionCounts: Map<string, number>`.
  - Increment count, return `{ allowed: count <= max, remaining: max - count, resetAt: 0 }`.
  - Periodic cleanup when map exceeds 10,000 entries (remove entries where count >= max, since those sessions are done).

**Verify**: TypeScript compiles.

## Step 3: Add Rate Limit Headers Helper

**Files**: `worker/src/index.ts`

- Create `rateLimitHeaders(result: RateLimitResult, max: number): Record<string, string>`.
  - `X-RateLimit-Limit`: `max.toString()`
  - `X-RateLimit-Remaining`: `Math.max(0, result.remaining).toString()`
  - `X-RateLimit-Reset`: `Math.ceil(result.resetAt / 1000).toString()` (Unix seconds, or omit if 0)
- Create helper for 429 response that includes `Retry-After` header (seconds until reset).

**Verify**: TypeScript compiles.

## Step 4: Update CORS Headers

**Files**: `worker/src/index.ts`

- Add `X-Session-Token` to `Access-Control-Allow-Headers`.
- Add `Access-Control-Expose-Headers` with `X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, Retry-After` so browsers can read them.

**Verify**: TypeScript compiles.

## Step 5: Update Main Fetch Handler

**Files**: `worker/src/index.ts`

- Parse limits from env: `const ipMax = getLimit(env.RATE_LIMIT_IP_MAX, 20)` etc.
- Replace `checkRateLimit(ip)` call with `checkIpRateLimit(ip, ipMax)`.
- If IP check fails: return 429 with rate limit headers + Retry-After.
- Extract `X-Session-Token` header; if present, call `checkSessionRateLimit(token, sessionMax)`.
- If session check fails: return 429 with session info.
- On successful proxy response, inject rate limit headers from IP result into the response.

**Verify**: TypeScript compiles. Test with `wrangler dev` + curl:
- `curl -v -X POST -H "Content-Type: application/json" -d '{}' http://localhost:8787/api/persona` — check rate limit headers in response.
- Fire 21 rapid requests — verify 429 on 21st.

## Step 6: Frontend Session Token

**Files**: `frontend/src/lib/api/client.ts`

- Add `const SESSION_TOKEN_HEADER = 'X-Session-Token'` and `const sessionToken = crypto.randomUUID()` at module scope.
- In `apiFetch()`, always set the session token header on outgoing requests.

**Verify**: `npm run check && npm run lint` in frontend directory.

## Step 7: Update Verify Script

**Files**: `scripts/verify-deploy.sh`

- Change Test 5 loop from `seq 1 11` to `seq 1 21`.
- Add a check for `X-RateLimit-Remaining` header presence in a normal 200 response.

**Verify**: Script is syntactically valid (bash -n).

## Step 8: End-to-End Verification

- Run `cd worker && npx tsc --noEmit` — worker compiles.
- Run `cd frontend && npm run check` — frontend compiles.
- Run `cd frontend && npm run lint` — no lint errors.

## Testing Strategy

| What | How | Type |
|------|-----|------|
| IP rate limit enforced at 20/min | curl burst of 21 requests against `wrangler dev` | Manual integration |
| Session limit enforced at 50 total | curl with same `X-Session-Token` 51 times | Manual integration |
| Rate limit headers present | curl -v, inspect response headers | Manual integration |
| 429 includes Retry-After | curl after exceeding limit, check header | Manual integration |
| Limits configurable | Set `RATE_LIMIT_IP_MAX=5` in wrangler.toml, verify 429 at 6th request | Manual integration |
| Frontend sends session token | Browser dev tools network tab, or Playwright test | Manual / E2E |
| TypeScript compiles | `npx tsc --noEmit` | Build |
| Frontend checks pass | `npm run check && npm run lint` | Build |
| Verify script passes | `bash scripts/verify-deploy.sh <URL>` | Integration |
