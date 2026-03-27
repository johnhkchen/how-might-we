# T-005-03 Structure: Rate Limiting

## Files Modified

### `worker/src/index.ts` (primary target)

**Env interface** — add configurable rate limit vars:
```
RATE_LIMIT_IP_MAX?: string;      // parsed to number, default 20
RATE_LIMIT_SESSION_MAX?: string;  // parsed to number, default 50
```

**Rate limit module** — rewrite the rate limiting section:

1. **`RateLimitResult` type**: `{ allowed: boolean; remaining: number; resetAt: number }` — returned by both checkers so the caller can build headers.

2. **`checkIpRateLimit(ip: string, max: number): RateLimitResult`** — replaces current `checkRateLimit`. Same sliding-window algorithm but returns remaining/reset metadata instead of bare boolean. Window stays at 60s (constant).

3. **`checkSessionRateLimit(token: string, max: number): RateLimitResult`** — new. Simple counter map `Map<string, number>`. Increments on each call. Returns remaining = max - count. `resetAt` is not meaningful for lifetime counters; set to 0.

4. **Session counter map**: `const sessionCounts = new Map<string, number>()`. No TTL needed — isolate memory is ephemeral.

5. **`rateLimitHeaders(result: RateLimitResult, max: number): Record<string, string>`** — builds `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` headers from the IP result.

**CORS headers** — add `X-Session-Token` to `Access-Control-Allow-Headers`. Also add the rate limit response headers to `Access-Control-Expose-Headers` so the browser can read them.

**Main fetch handler** — updated flow:
1. CORS preflight (unchanged)
2. Path check (unchanged)
3. Method check (unchanged)
4. Parse config: `ipMax = parseInt(env.RATE_LIMIT_IP_MAX) || 20`, `sessionMax = parseInt(env.RATE_LIMIT_SESSION_MAX) || 50`
5. IP rate limit check — if denied, return 429 with headers + `Retry-After`
6. Session rate limit check — extract `X-Session-Token` header; if present, check counter; if denied, return 429 with headers
7. Turnstile (unchanged)
8. Lambda URL check (unchanged)
9. Proxy to Lambda — inject rate limit headers into proxied response

**429 error response** — enhanced `jsonError` or new helper that includes rate limit headers and `Retry-After`.

**Cleanup** — extend the periodic cleanup to also prune the session map when it grows large (>10,000 entries, similar to existing IP cleanup).

### `worker/wrangler.toml`

Add default values to `[vars]`:
```
RATE_LIMIT_IP_MAX = "20"
RATE_LIMIT_SESSION_MAX = "50"
```

### `frontend/src/lib/api/client.ts`

Add session token generation and attachment:
- Generate `sessionToken = crypto.randomUUID()` at module scope (runs once per page load).
- In `apiFetch()`, always attach `X-Session-Token: <sessionToken>` header.

No new files — this is a 3-line addition to the existing module.

### `scripts/verify-deploy.sh`

Update Test 5:
- Change loop from `seq 1 11` to `seq 1 21` (to exceed new 20-request limit).
- Optionally: add a sub-test verifying `X-RateLimit-Remaining` header is present in a normal response.

## Files NOT Modified

- `backend/*` — no backend changes (stateless, rate limiting is worker-layer concern)
- `frontend/src/lib/stores/session.svelte.ts` — no session ID in the store (the token is API-transport only)
- `frontend/src/lib/api/stream.ts` — no special 429/retry-after handling (errors already surface to UI)
- `frontend/src/routes/workshop/+page.svelte` — no UI changes for rate limiting
- `worker/package.json`, `worker/tsconfig.json` — no new dependencies

## Module Boundaries

```
worker/src/index.ts
  ├── Env interface (config)
  ├── Rate limiting (IP + session, headers)
  ├── CORS (updated allow/expose headers)
  ├── Turnstile verification (unchanged)
  ├── Lambda proxy (injects rate limit headers)
  └── Main fetch handler (orchestration)

frontend/src/lib/api/client.ts
  ├── Session token (module-level const)
  ├── apiFetch() (attaches token + turnstile headers)
  └── apiUrl() (unchanged)
```

## Change Ordering

1. Worker changes (rate limiter, headers, env config) — self-contained, testable via curl
2. Frontend changes (session token header) — depends on worker accepting the header via CORS
3. Verify script update — depends on new limit being deployed

All changes can land in a single commit since the worker and frontend changes are complementary and the frontend change is trivial.
