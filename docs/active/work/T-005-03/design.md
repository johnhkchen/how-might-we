# T-005-03 Design: Rate Limiting

## Decision Summary

Enhance the existing in-memory sliding window rate limiter with per-session tracking, rate limit response headers, configurable limits via environment variables, and a client-generated session token. Keep the in-memory approach (no KV/Durable Objects) since the existing architecture already accepts approximate enforcement across isolates.

## Options Evaluated

### Option A: Enhanced In-Memory Rate Limiter (chosen)

Extend the current sliding-window approach to support two dimensions:
- **Per-IP**: 20 req/min (sliding window, same algorithm as today, just new limit)
- **Per-session**: 50 total API calls per session lifetime (simple counter keyed by session token)

The session token is a client-generated UUID sent via `X-Session-Token` header. The worker tracks `Map<sessionToken, count>` separately from the IP map.

**Pros**: Zero additional dependencies, zero additional latency, minimal code change, consistent with existing architecture.
**Cons**: In-memory state is per-isolate (not globally shared). Same limitation the current rate limiter already has — accepted in the existing design.

### Option B: Cloudflare KV-Backed Rate Limiter

Store rate limit state in Workers KV for cross-isolate persistence.

**Pros**: Globally consistent rate limits across all isolates.
**Cons**: KV reads add 10-50ms latency per request (on hot path before proxy). KV has eventual consistency (not strongly consistent for rate limiting). Requires KV namespace binding in wrangler.toml and additional setup. Overkill for a workshop tool with low traffic.

**Rejected**: Latency cost on every request is disproportionate. KV's eventual consistency means it wouldn't be precise anyway. The existing in-memory approach is already accepted.

### Option C: Cloudflare Rate Limiting Rules (WAF)

Use Cloudflare's built-in rate limiting rules (configured in dashboard or via API, not in worker code).

**Pros**: Globally enforced at the edge, no worker code needed for IP-based limits.
**Cons**: Cannot do per-session limiting (session token is app-level). Per-IP rules alone don't satisfy the acceptance criteria. Would need to combine with in-worker logic anyway. Requires specific Cloudflare plan features.

**Rejected**: Doesn't address per-session requirement. The ticket asks for configurable limits via worker env vars, implying in-worker control.

### Option D: Durable Objects

Use a Durable Object as a centralized rate limit coordinator.

**Pros**: Strongly consistent, globally shared state.
**Cons**: Massive over-engineering for this use case. Durable Objects add latency (single-region coordination). Requires wrangler config changes, new DO class, migration. Not justified for a low-traffic workshop tool.

**Rejected**: Complexity far exceeds benefit.

## Detailed Design

### Session Token Strategy

- **Generation**: Frontend generates a UUID v4 via `crypto.randomUUID()` once per page load. Stored in module-level variable (not persisted — refresh = new session).
- **Transmission**: Sent as `X-Session-Token` header on every API call via `apiFetch()`.
- **CORS**: The worker's CORS `Access-Control-Allow-Headers` must include `X-Session-Token`.
- **Spoofability**: A malicious user can generate fresh tokens to bypass session limits. This is acceptable — the per-IP limit is the hard defense; per-session is UX-level friction for normal users.

### Rate Limit Algorithm

**Per-IP (sliding window, existing pattern)**:
- Key: IP address from `cf-connecting-ip`
- Window: 60 seconds
- Max: 20 requests (configurable via `RATE_LIMIT_IP_MAX` env var)
- Returns remaining count and reset time

**Per-session (lifetime counter)**:
- Key: value of `X-Session-Token` header
- Max: 50 total calls (configurable via `RATE_LIMIT_SESSION_MAX` env var)
- No window — counts for the lifetime of the isolate's memory of that token
- If no session token provided, skip session check (don't block — IP limit still applies)

**Evaluation order**: IP check first (cheaper, protects infrastructure), then session check.

### Response Headers

All non-preflight responses include:
- `X-RateLimit-Limit`: The per-IP max (e.g., `20`)
- `X-RateLimit-Remaining`: Requests remaining in the current IP window
- `X-RateLimit-Reset`: Unix timestamp (seconds) when the oldest request in the window expires

On 429 responses, additionally:
- `Retry-After`: Seconds until the client should retry (derived from reset time)

### Configurable Environment Variables

Added to `Env` interface and `wrangler.toml [vars]`:
- `RATE_LIMIT_IP_MAX`: Per-IP max requests per minute (default: `20`)
- `RATE_LIMIT_SESSION_MAX`: Per-session max total calls (default: `50`)

### Frontend Changes

Minimal — only the API client layer:
1. Generate session token once at module load time in a new small utility or directly in `client.ts`.
2. Attach `X-Session-Token` header in `apiFetch()` alongside the Turnstile token.

No changes to the session store, stream handler, or UI components.

### Verify Script Update

Update `scripts/verify-deploy.sh` Test 5 to fire 21 requests (to exceed the new 20-request limit) instead of 11.

## Risk Assessment

- **Low risk**: All changes are in the worker and a single frontend utility file. No backend changes.
- **Isolate distribution**: Rate limits remain approximate across isolates. The verify-deploy script already warns about this.
- **Session token forgery**: Accepted as a non-goal. Per-IP is the security boundary; per-session is UX guardrail.
