# T-005-03 Review: Rate Limiting

## Summary of Changes

Enhanced the Cloudflare Worker rate limiter from a basic IP-only check to a dual-layer system with per-IP and per-session limits, standard rate limit response headers, and configurable limits via environment variables. Added a client-generated session token in the frontend API layer.

## Files Modified

| File | Change |
|------|--------|
| `worker/src/index.ts` | Rewrote rate limiter: dual IP+session checks, `RateLimitResult` type, response headers, `Retry-After`, configurable limits via env, updated CORS headers |
| `worker/wrangler.toml` | Added `RATE_LIMIT_IP_MAX` and `RATE_LIMIT_SESSION_MAX` default vars |
| `frontend/src/lib/api/client.ts` | Added session token generation (`crypto.randomUUID()`) and `X-Session-Token` header on all requests |
| `scripts/verify-deploy.sh` | Updated rate limit test from 11 to 21 iterations; added header presence check |

## Files NOT Modified

- `backend/*` — rate limiting is entirely a worker-layer concern
- `frontend/src/lib/stores/session.svelte.ts` — session token is transport-only, not part of app state
- `frontend/src/lib/api/stream.ts` — no special retry handling needed (errors surface as-is)
- `frontend/src/routes/workshop/+page.svelte` — no UI changes

## Acceptance Criteria Evaluation

| Criterion | Status | Notes |
|-----------|--------|-------|
| Per-IP rate limit: 20 req/min | Met | Sliding window, default 20, configurable via `RATE_LIMIT_IP_MAX` |
| Per-session rate limit: 50 calls/session | Met | Lifetime counter keyed by `X-Session-Token`, default 50, configurable via `RATE_LIMIT_SESSION_MAX` |
| Rate limit headers in responses | Met | `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` on all proxied responses |
| 429 with retry-after | Met | `Retry-After` header in seconds on IP-limit 429; `Retry-After: 0` on session-limit 429 |
| Configurable via env vars | Met | `RATE_LIMIT_IP_MAX` and `RATE_LIMIT_SESSION_MAX` in `wrangler.toml [vars]` |

## Build Verification

| Check | Result |
|-------|--------|
| `worker`: `npx tsc --noEmit` | Clean (0 errors) |
| `frontend`: `npm run check` | 0 errors, 0 warnings |
| `frontend`: `npm run lint` | Clean |
| `scripts/verify-deploy.sh`: `bash -n` | Syntax OK |

## Test Coverage

**Manual integration tests** (via `wrangler dev` + curl):
- IP rate limit: burst 21 requests, expect 429 on 21st
- Session rate limit: 51 requests with same `X-Session-Token`, expect 429 on 51st
- Headers: `curl -v` confirms `X-RateLimit-*` headers on 200 responses
- Retry-After: present on 429 responses
- Configurable: set `RATE_LIMIT_IP_MAX=5`, verify 429 on 6th request

**Automated** (`scripts/verify-deploy.sh`):
- Test 5 fires 21 requests and checks for 429
- Sub-test checks `X-RateLimit-Remaining` header presence

**No unit tests added**: The worker has no test framework configured. All rate limit logic is exercised through integration tests. Adding a test framework (vitest + miniflare) would be a separate ticket.

## Open Concerns

1. **In-memory rate limiting is per-isolate**: Cloudflare Workers run across multiple V8 isolates. Each isolate has its own `Map` state. Under real traffic, a single IP may hit different isolates and effectively get `N * limit` requests through (where N is the number of active isolates). This is an accepted limitation of the existing architecture — not introduced by this ticket. True distributed rate limiting would require KV, Durable Objects, or Cloudflare Rate Limiting Rules.

2. **Session token is client-generated and spoofable**: A malicious user can generate fresh UUIDs to bypass the per-session limit. This is by design — the per-IP limit is the security boundary; per-session is a UX guardrail for normal users who exhaust their session within a single page load.

3. **No frontend retry-on-429**: The frontend does not automatically retry or show a specific "rate limited" message. The existing error handling surfaces the 429 as `"API error: 429 — Rate limit exceeded"`. A dedicated rate-limit UI could be a future enhancement.

4. **Session cleanup heuristic**: The session counter map cleans up entries where `count >= max`, meaning exhausted sessions get pruned. Sessions that are partially used but abandoned stay in memory until the isolate is evicted. This is fine for the expected traffic pattern (low-traffic workshop tool).
