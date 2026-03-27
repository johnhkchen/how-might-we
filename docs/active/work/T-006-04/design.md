# T-006-04 Design: KV-Backed Rate Limiting

## Option 1: Full KV — Store Timestamps Array in KV

Store the same sliding-window timestamp array currently in memory, but serialize it to KV.

**Key format**: `ip:{address}` → JSON array of Unix-ms timestamps
**Operation**: Read array, filter expired, check length, push new timestamp, write back.

Pros:
- Exact parity with current in-memory behavior
- Accurate sliding window

Cons:
- Large KV values for active IPs (up to 20 timestamps × ~13 bytes = ~260 bytes, fine)
- Read + parse + filter + serialize + write on every request — two KV ops minimum
- Race condition: two concurrent requests read the same array, both append, one write wins (counter goes backward). Acceptable for rate limiting but imprecise.
- 2 KV writes per request (IP + session) eats into free tier quickly

## Option 2: KV Counter with TTL Window

Store a simple counter per key with a TTL matching the rate limit window.

**Key format**: `ip:{address}:{window}` where `{window}` is `Math.floor(Date.now() / 60000)` (minute bucket)
**Operation**: Read counter (or 0 if null), increment, write with 120s TTL.

For sessions: `session:{token}` → counter, no TTL (lifetime limit), but set a long TTL (24h) for cleanup.

Pros:
- Simple: one read + one write per rate limit check
- Small values (just a number)
- Auto-cleanup via TTL
- Counter races lose at most 1-2 requests — perfectly fine for rate limiting

Cons:
- Fixed-window instead of sliding-window. A burst at a window boundary could allow 2× the limit in quick succession (e.g., 20 requests at 0:59, 20 more at 1:00). This is a well-known tradeoff.
- Slightly different behavior from current implementation (but the current implementation's precision is already illusory given isolate boundaries)

## Option 3: Cloudflare Rate Limiting API (Built-in)

Use Cloudflare's built-in Rate Limiting rules instead of implementing in the worker.

Pros:
- Zero code, managed service
- Dashboard configuration

Cons:
- Costs extra ($0.05 per 10,000 good requests on the legacy plan)
- Less control over headers and error messages
- Can't implement per-session limits (only IP-based)
- Doesn't satisfy the ticket's requirement to use KV

**Rejected**: Doesn't meet acceptance criteria (must use KV), can't do session limits.

## Option 4: Durable Objects

Use Durable Objects for strongly consistent counters.

Pros:
- Atomic operations, no race conditions
- Single point of consistency per key

Cons:
- More expensive than KV
- More complex architecture (needs a DO class, routing logic)
- Overkill — the ticket explicitly states KV is sufficient
- Adds latency (every request routes to a single location)

**Rejected**: Ticket says KV is sufficient. Unnecessary complexity and cost.

## Decision: Option 2 — KV Counter with TTL Window

### Rationale

1. **Simplicity**: One read + one write per check. No array serialization.
2. **Auto-cleanup**: TTL handles expiry. No need for manual garbage collection.
3. **Cost efficiency**: Minimizes KV operations.
4. **Good enough precision**: Fixed-window rate limiting is industry-standard. The current sliding window's precision is already illusory across isolates. A fixed 1-minute window with 20 req/min is perfectly adequate.
5. **Race conditions are harmless**: Two requests racing to increment might both read "5" and write "6" instead of "7". This means occasionally allowing 1-2 extra requests — irrelevant for abuse prevention.

### Key Schema

| Key Pattern | Value | TTL | Purpose |
|---|---|---|---|
| `ip:{address}:{minuteBucket}` | counter (string) | 120s | Per-IP per-minute limit |
| `session:{token}` | counter (string) | 86400s (24h) | Per-session lifetime limit |

The minute bucket is `Math.floor(Date.now() / 60000)`. Using 120s TTL (2× window) ensures the key exists for the full minute plus cleanup buffer.

### Graceful Degradation Strategy

```
if env.RATE_LIMIT exists:
    try KV read/write
    on error → fall back to in-memory for this request
else:
    use in-memory (current behavior)
```

This means the existing in-memory code stays. The KV path is an overlay that takes priority when available. This keeps the worker functional even if:
- KV namespace isn't bound (local dev without `--kv`)
- KV service is temporarily unavailable
- Binding is misconfigured

### Rate Limit Headers with Fixed Window

- `X-RateLimit-Remaining`: `max - counter` (from KV value)
- `X-RateLimit-Reset`: end of current minute bucket in Unix seconds
- `Retry-After`: seconds until next minute bucket (on 429)

### Session Rate Limiting

Session counters are simpler — just a monotonic counter with a 24h TTL. No windowing needed. The `resetAt` stays 0 (consistent with current behavior).

### Cost Analysis for Documentation

At steady state with ~100 users/day, ~10 API calls each = 1,000 requests/day:
- IP rate limit: 1,000 reads + 1,000 writes = well within free tier
- Session rate limit: 1,000 reads + 1,000 writes = well within free tier
- Total: ~2,000 reads + ~2,000 writes/day (free tier: 100k reads, 1k writes)

The writes may exceed the free tier under moderate load. The $5/month Workers Paid plan (10M reads, 1M writes) is the natural upgrade path.
