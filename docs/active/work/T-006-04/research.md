# T-006-04 Research: KV-Backed Rate Limiting

## Current Rate Limiting Implementation

### Location
- `worker/src/index.ts` — single file, ~257 lines
- Rate limiting logic: lines 9–98 (two in-memory data structures + helper functions)

### In-Memory Data Structures

**Per-IP sliding window** (`ipTimestamps: Map<string, number[]>`):
- Stores an array of Unix-ms timestamps per IP address
- Window size: 60 seconds (`RATE_LIMIT_WINDOW_MS = 60_000`)
- Default limit: 20 requests/minute (configurable via `RATE_LIMIT_IP_MAX` env var)
- Cleanup: when map exceeds 10,000 entries, prunes IPs with all-expired timestamps
- Returns `RateLimitResult` with `allowed`, `remaining`, `resetAt`

**Per-session lifetime counter** (`sessionCounts: Map<string, number>`):
- Stores a monotonically increasing counter per session token
- Default limit: 50 calls (configurable via `RATE_LIMIT_SESSION_MAX` env var)
- Session token comes from `X-Session-Token` header
- Cleanup: when map exceeds 10,000 entries, prunes exhausted sessions
- `resetAt` is always 0 (lifetime limit, no window)

### Rate Limit Headers
- `X-RateLimit-Limit`: the max allowed
- `X-RateLimit-Remaining`: remaining quota
- `X-RateLimit-Reset`: Unix seconds when oldest entry expires (IP only)
- `Retry-After`: seconds until retry (on 429 responses)
- All exposed via `Access-Control-Expose-Headers`

### Request Flow
1. CORS preflight check
2. Path filtering (`/api/*` only)
3. Method filtering (POST only)
4. IP rate limit check → 429 if exceeded
5. Session rate limit check → 429 if exceeded
6. Turnstile verification (if configured)
7. Proxy to Lambda

## Why In-Memory Is Insufficient

Cloudflare Workers run on an edge network with hundreds of locations. Each isolate gets its own copy of module-level state (`ipTimestamps`, `sessionCounts`). This means:

1. **Multi-isolate bypass**: A single edge location may spawn multiple isolates under load. Each isolate has independent counters.
2. **Multi-location bypass**: An attacker routing through different CF PoPs hits different isolates.
3. **Isolate recycling**: CF evicts idle isolates frequently. A new isolate starts with empty maps, resetting all limits.

The current implementation is best-effort — good enough to slow down casual abuse but trivially bypassable by a determined attacker.

## Cloudflare KV Characteristics

### API
- `env.NAMESPACE.get(key)` — read (returns `string | null`)
- `env.NAMESPACE.put(key, value, { expirationTtl })` — write with auto-expiry
- `env.NAMESPACE.delete(key)` — explicit delete
- Values up to 25 MiB, keys up to 512 bytes

### Consistency Model
- **Eventual consistency**: writes propagate globally in ~60 seconds
- Reads from the same location that wrote see the value immediately (read-your-own-writes)
- This is acceptable for rate limiting — worst case, a user gets a few extra requests through during propagation. The ticket acknowledges this.

### Pricing (Free Tier)
- 100,000 reads/day
- 1,000 writes/day
- 1 GiB storage
- Paid: $0.50/million reads, $5/million writes

### Cost Implications for Rate Limiting
Each request requires at minimum:
- 1 KV read (get current IP counter)
- 1 KV write (update IP counter)
- Optionally 1 KV read + 1 KV write for session counter

At 2-4 KV ops per request, the free tier supports ~250-500 requests/day. For a low-traffic workshop tool, this is likely sufficient for development/early production. The paid plan ($5/month Workers plan) includes 10M reads and 1M writes.

### Binding in wrangler.toml
```toml
[[kv_namespaces]]
binding = "RATE_LIMIT"
id = "abc123"          # from `wrangler kv namespace create "RATE_LIMIT"`
preview_id = "def456"  # from `wrangler kv namespace create "RATE_LIMIT" --preview`
```

Accessed via `env.RATE_LIMIT` in the worker (requires adding to `Env` interface).

## Existing Env Interface

```typescript
interface Env {
    LAMBDA_URL: string;
    ALLOWED_ORIGIN: string;
    TURNSTILE_SECRET_KEY?: string;
    RATE_LIMIT_IP_MAX?: string;
    RATE_LIMIT_SESSION_MAX?: string;
}
```

The `KVNamespace` type is provided by `@cloudflare/workers-types` (already a devDependency).

## Configuration Surface

- `wrangler.toml`: KV namespace binding + preview binding
- `deploy.sh`: may need to create namespace on first deploy
- `Env` interface: add `RATE_LIMIT?: KVNamespace` (optional for graceful degradation)

## Graceful Degradation Requirement

Acceptance criteria require fallback to in-memory if KV is unavailable. This means:
- The `RATE_LIMIT` KV binding must be optional in the `Env` interface
- If `env.RATE_LIMIT` is undefined, the existing in-memory logic should be used
- If a KV read/write throws, catch and fall back to in-memory for that request

## Key Design Constraints

1. **Atomic read-modify-write**: KV has no atomic increment. Must read → parse → increment → write. Race conditions possible between concurrent requests, but acceptable for rate limiting.
2. **TTL-based expiry**: KV supports `expirationTtl` (seconds), which auto-deletes keys. This eliminates the need for manual cleanup.
3. **Serialization**: Counters can be stored as simple JSON strings (timestamps array for IP, count for session).
4. **Key naming**: Need a scheme that avoids collisions (e.g., `ip:{address}`, `session:{token}`).
5. **Latency**: KV reads add ~10-50ms per request. Two KV operations per request adds 20-100ms. For a tool that's about to call an LLM (seconds), this is negligible.

## Files to Modify
- `worker/src/index.ts` — main implementation
- `worker/wrangler.toml` — KV namespace binding

## Files to Leave Unchanged
- `backend/` — no changes needed, rate limiting is entirely in the worker
- `frontend/` — no changes needed, rate limit headers are already handled
- `scripts/deploy.sh` — KV namespaces are created once via CLI, not per-deploy
