# T-005-03 Research: Rate Limiting

## Current State

### Existing Rate Limiter (`worker/src/index.ts`)

The worker already has a basic IP-based rate limiter:

- **Algorithm**: Sliding window — stores an array of timestamps per IP in a `Map<string, number[]>`.
- **Limits**: 10 requests per 60-second window (constants `RATE_LIMIT_MAX=10`, `RATE_LIMIT_WINDOW_MS=60_000`).
- **Enforcement**: `checkRateLimit(ip)` is called in the main `fetch` handler. Returns `false` when the window is full; the handler responds with `429 "Rate limit exceeded"`.
- **Cleanup**: Periodic purge when map exceeds 10,000 entries — removes IPs whose timestamps are all expired.
- **IP source**: `cf-connecting-ip` header (Cloudflare-populated), falls back to `"unknown"`.

### Limitations of Current Implementation

1. **In-memory only**: Cloudflare Workers use V8 isolates. Each isolate has its own memory. A single Worker script may run across many isolates, and in-memory state is **not shared** between them. The rate limit map resets on isolate eviction. Under real traffic, rate limits are approximate at best.

2. **No session tracking**: There is no concept of a session token or session ID anywhere in the stack. The frontend `SessionStore` is purely client-side Svelte state with no identifier sent to the server.

3. **No rate limit headers**: The 429 response includes only an error message JSON body and CORS headers. No `X-RateLimit-Remaining`, `X-RateLimit-Reset`, or `Retry-After` headers.

4. **Hardcoded limits**: `RATE_LIMIT_WINDOW_MS` and `RATE_LIMIT_MAX` are compile-time constants, not configurable via environment variables.

5. **No per-endpoint differentiation**: All `/api/*` POST requests share the same limit counter.

### Worker Environment & Capabilities

- **Env interface** (`worker/src/index.ts:1-5`): Currently exposes `LAMBDA_URL`, `ALLOWED_ORIGIN`, `TURNSTILE_SECRET_KEY`.
- **wrangler.toml**: Defines `[vars]` section with `ALLOWED_ORIGIN = "*"`. Secrets are set via `wrangler secret put`.
- **No KV or Durable Objects configured**: The worker has no persistent storage bindings. Adding KV would require a `kv_namespaces` entry in `wrangler.toml`.

### Frontend API Layer

- **`frontend/src/lib/api/client.ts`**: All API calls go through `apiFetch()`, which attaches an `X-Turnstile-Token` header when available. Does not send any session identifier.
- **`frontend/src/lib/api/stream.ts`**: SSE streaming client. Calls `apiFetch()`. Does not handle 429 responses or retry-after headers specially — they surface as thrown `Error("API error: 429 ...")`.
- **`frontend/src/lib/stores/session.svelte.ts`**: Pure client-side state. No session ID field. No persistence (page reload = fresh state).

### Backend

- **Stateless**: The Go backend has no session or rate-limit awareness. All protection is in the worker layer.
- **Endpoints**: POST `/api/persona`, `/api/analyze`, `/api/expand`, `/api/refine`. Each triggers an LLM call (expensive).

### Verification Script

- `scripts/verify-deploy.sh` includes a Test 5 (Rate limiting) that fires 11 rapid requests and expects a 429. Currently tuned to the 10-request limit. This test will need updating when the limit changes to 20.

## Acceptance Criteria Mapping

| Criterion | Current State |
|-----------|--------------|
| Per-IP 20 req/min | Partially met: 10 req/min exists, needs bump to 20 |
| Per-session 50 calls/session | Not met: no session concept exists |
| Rate limit headers (`X-RateLimit-Remaining`, `X-RateLimit-Reset`) | Not met |
| 429 with retry-after | Partially met: 429 returned, no `Retry-After` header |
| Configurable via env vars | Not met: constants are hardcoded |

## Constraints & Assumptions

1. **Workers isolate boundary**: Any in-memory rate limiting is best-effort. True distributed rate limiting requires Cloudflare's Rate Limiting Rules (paid feature on some plans), Durable Objects, or KV.
2. **Session token must be client-generated**: The backend is stateless and there's no login flow. The frontend must generate and send a session identifier. This is inherently spoofable — it provides abuse friction, not security.
3. **Session lifetime**: The ticket says "50 API calls per session." A session in this app is a single page load (no persistence). A new tab or page refresh = new session.
4. **Two concurrent agents**: This ticket is worker-track work. Frontend changes (adding a session header) are minimal and isolated to the API layer.
5. **Cloudflare Workers KV** is available and would provide cross-isolate persistence, but adds latency (~10-50ms per read). For this ticket's scope, in-memory with the understanding that it's approximate is likely acceptable — the verify-deploy test already acknowledges isolate distribution may mask rate limits.

## Files Relevant to This Ticket

| File | Role |
|------|------|
| `worker/src/index.ts` | Primary target: rate limit logic, response headers, env config |
| `worker/wrangler.toml` | Add new env vars for configurable limits |
| `frontend/src/lib/api/client.ts` | Add session token header to outgoing requests |
| `frontend/src/lib/api/stream.ts` | Potentially surface retry-after to callers |
| `scripts/verify-deploy.sh` | Update Test 5 for new limit (20 instead of 10) |
