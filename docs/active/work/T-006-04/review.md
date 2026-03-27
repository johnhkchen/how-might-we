# T-006-04 Review: KV-Backed Rate Limiting

## Summary of Changes

### Files Modified

| File | Change |
|---|---|
| `worker/src/index.ts` | Added `RATE_LIMIT?: KVNamespace` to Env, added 2 KV rate limit functions (~40 lines), updated main handler dispatch logic (~20 lines) |
| `worker/wrangler.toml` | Added `[[kv_namespaces]]` binding with placeholder IDs and cost documentation comments |

### What Changed

1. **Env interface**: Added optional `RATE_LIMIT` KV namespace binding
2. **`checkIpRateLimitKV()`**: Fixed-window counter using minute-bucket keys in KV with 120s TTL
3. **`checkSessionRateLimitKV()`**: Lifetime counter in KV with 24h TTL for cleanup
4. **Main handler**: Conditional dispatch — uses KV when `env.RATE_LIMIT` is bound, falls back to in-memory on KV absence or error

### What Did NOT Change

- In-memory rate limit functions (preserved as fallback)
- Rate limit header generation
- CORS handling
- Turnstile verification
- Proxy logic
- Frontend code (no changes needed)
- Backend code (no changes needed)
- Deploy script (KV namespaces are created once via CLI, not per-deploy)

## Acceptance Criteria Assessment

| Criterion | Status | Notes |
|---|---|---|
| Rate limit counters stored in KV | Done | IP and session counters both use KV when bound |
| Per-IP 20 req/min globally | Done | Fixed-window counter in KV, shared across all isolates |
| Per-session 50 calls globally | Done | Lifetime counter in KV, shared across all isolates |
| KV namespace in wrangler.toml | Done | Binding configured with placeholder IDs |
| Rate limit headers present | Done | Unchanged — same `rateLimitResponseHeaders()` function |
| Fallback to in-memory if KV unavailable | Done | Three fallback paths: no binding, KV error, and no change for local dev |
| KV costs documented | Done | In wrangler.toml comments and KV function header comment |

## Test Coverage

### What Was Verified
- TypeScript compilation (`npx tsc --noEmit`) passes cleanly
- Code review of all logic paths

### What Was NOT Verified (Manual Steps Required)
- **KV namespace creation**: Placeholder IDs in wrangler.toml must be replaced with real namespace IDs. Run:
  ```bash
  cd worker
  npx wrangler kv namespace create "RATE_LIMIT"
  npx wrangler kv namespace create "RATE_LIMIT" --preview
  ```
  Then update the `id` and `preview_id` in `wrangler.toml`.

- **End-to-end KV behavior**: Requires `wrangler dev --remote` or production deploy to test actual KV reads/writes across isolates.

- **Fallback behavior under KV failure**: Would require mocking KV to throw. No test framework is currently set up for the worker.

### Test Gap
The worker has no automated test suite. This is a pre-existing gap — T-006-04 does not introduce it. The existing in-memory tests (manual curl) still work because the fallback path is the same code.

## Open Concerns

1. **Placeholder namespace IDs**: `wrangler.toml` contains `PLACEHOLDER_PRODUCTION_ID` and `PLACEHOLDER_PREVIEW_ID`. These MUST be replaced before deploying. `wrangler deploy` will fail with invalid IDs, so this is a safe failure mode.

2. **Fixed-window vs sliding-window**: The KV implementation uses fixed 1-minute windows instead of the in-memory sliding window. This means a burst at a window boundary could allow up to 2× the limit. This is an accepted tradeoff documented in the design — the in-memory sliding window was already ineffective across isolates.

3. **KV write costs on free tier**: Each request costs 2 KV writes (IP + session). The free tier allows 1,000 writes/day, supporting ~500 requests/day. For early usage this is fine; moderate traffic will require the $5/month Workers Paid plan.

4. **Race conditions on counter increment**: Two concurrent requests can read the same counter value and both write `count + 1` instead of `count + 2`. This allows occasional extra requests through — acceptable for rate limiting, documented in design.

5. **No automated worker tests**: The worker lacks a test harness entirely. This is pre-existing technical debt, not introduced by this ticket.

## Risk Assessment

**Low risk**. The change is additive — existing behavior is preserved as fallback. The KV path only activates when the namespace is bound. Local development (`wrangler dev` without `--kv`) continues to use in-memory rate limiting. Production deployment requires explicit namespace creation and ID configuration.
