# T-006-04 Plan: KV-Backed Rate Limiting

## Step 1: Add KV Namespace Binding to wrangler.toml

Create KV namespaces and add binding configuration.

**Changes**: `worker/wrangler.toml` — add `[[kv_namespaces]]` block

**Note**: Actual namespace IDs require running `wrangler kv namespace create`. For now, use placeholder IDs that can be filled in during deploy. The binding name must match what the code references.

**Verify**: `cd worker && npx wrangler deploy --dry-run` should parse the config without errors (even with placeholder IDs).

## Step 2: Extend Env Interface and Add KV Rate Limit Functions

Add `RATE_LIMIT?: KVNamespace` to the `Env` interface and implement the two KV-backed rate limit functions.

**Changes**: `worker/src/index.ts`
- Add `RATE_LIMIT?: KVNamespace` to `Env`
- Add `checkIpRateLimitKV(kv, ip, max)` — async function that:
  1. Computes minute bucket key: `rl:ip:{ip}:{Math.floor(Date.now() / 60000)}`
  2. Reads current counter from KV (default 0)
  3. If counter >= max, return `{ allowed: false, remaining: 0, resetAt }`
  4. Increment and write back with 120s TTL
  5. Return `{ allowed: true, remaining: max - newCount, resetAt }`
  6. `resetAt` = end of current minute bucket in Unix ms
- Add `checkSessionRateLimitKV(kv, token, max)` — async function that:
  1. Key: `rl:session:{token}`
  2. Read counter (default 0), increment, write with 86400s TTL
  3. Return result with `resetAt: 0`

**Verify**: TypeScript compiles (`cd worker && npx tsc --noEmit`)

## Step 3: Update Main Handler for KV Dispatch with Fallback

Modify the fetch handler to use KV functions when available, falling back to in-memory.

**Changes**: `worker/src/index.ts` main handler
- IP rate limit section:
  ```
  let ipResult: RateLimitResult;
  if (env.RATE_LIMIT) {
      try { ipResult = await checkIpRateLimitKV(env.RATE_LIMIT, ip, ipMax); }
      catch { ipResult = checkIpRateLimit(ip, ipMax); }
  } else {
      ipResult = checkIpRateLimit(ip, ipMax);
  }
  ```
- Session rate limit section: same pattern with `checkSessionRateLimitKV`

**Verify**: TypeScript compiles. Existing behavior preserved when `RATE_LIMIT` is undefined.

## Step 4: Test Locally with wrangler dev

Run the worker locally and verify:
1. Without KV binding: in-memory fallback works, headers present
2. With `--kv` flag: KV path works

**Commands**:
```bash
cd worker && npx wrangler dev  # without KV — should use in-memory
# Test: curl -X POST http://localhost:8787/api/analyze -H "Content-Type: application/json"
# Verify: X-RateLimit-Remaining header present in response
```

## Step 5: Document KV Costs and Setup

Add a comment block in `worker/src/index.ts` near the KV functions documenting:
- Free tier limits (100k reads/day, 1k writes/day)
- Cost implications
- How to create the namespace (`wrangler kv namespace create`)

Also update `wrangler.toml` with comments explaining the binding.

**Verify**: Comments are accurate and actionable.

## Step 6: Verify Build

Run final checks:
- `cd worker && npx tsc --noEmit` — TypeScript compiles
- Review that rate limit headers are still correctly generated
- Verify graceful degradation path

## Testing Strategy

**Unit testing**: The worker doesn't have a test harness currently. Manual testing via `wrangler dev` + curl.

**Manual verification**:
1. Start worker without KV → verify in-memory rate limiting works (headers present)
2. Send 21 rapid requests → verify 429 on the 21st
3. Check `X-RateLimit-Remaining` decrements correctly
4. Check `X-RateLimit-Reset` is present and reasonable

**What we can't easily test locally**:
- Multi-isolate KV sharing (requires production or `wrangler dev --remote`)
- KV eventual consistency effects
- KV failure/fallback (would need to mock KV, no test framework in place)

**Acceptance criteria mapping**:
- [x] Rate limit counters stored in KV → Step 2 (KV functions)
- [x] Per-IP 20 req/min globally → Step 2 (KV counter with minute bucket)
- [x] Per-session 50 calls globally → Step 2 (KV lifetime counter)
- [x] KV namespace in wrangler.toml → Step 1
- [x] Rate limit headers present → Step 3 (unchanged header logic)
- [x] Fallback to in-memory → Step 3 (try/catch + env check)
- [x] KV costs documented → Step 5
