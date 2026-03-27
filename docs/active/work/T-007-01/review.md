# Review — T-007-01: Rate Limit User Feedback

## Summary

This ticket replaces the generic "API error: 429" message with a dedicated rate-limit UX: a countdown banner, disabled buttons during cooldown, remaining-request indicator, and permanent session-limit message.

## Files Changed

| File | Lines | Change Description |
|------|-------|--------------------|
| `frontend/src/lib/api/stream.ts` | +45 | `RateLimitError` class, `StreamOptions` interface, 429 header extraction, `onHeaders` callback on success |
| `frontend/src/lib/api/mock.ts` | +18 | `__mockApiOverride` global for test-time response injection |
| `frontend/src/routes/workshop/+page.svelte` | +50, ~30 modified | Rate-limit reactive state, countdown `$effect`, banner/indicator UI, button disable/label updates across all 4 stages |
| `frontend/tests/streaming.spec.ts` | +175 | 7 new tests: 4 header-level + 3 E2E UI |

No files created or deleted beyond the work artifacts.

## Acceptance Criteria Coverage

| Criterion | Status | How Verified |
|-----------|--------|--------------|
| 429 shows dedicated rate limit message (not generic error) | ✅ | Amber banner with "Rate limit reached" message; test `429 on persona refinement shows rate limit banner` |
| Message includes how long to wait (from Retry-After) | ✅ | Banner shows `{retryAfter}s` countdown; test `429 on persona refinement shows rate limit banner` |
| Show remaining count from X-RateLimit-Remaining | ✅ | Indicator below header on successful responses via `onHeaders` callback; test `X-RateLimit-Remaining is accessible on successful responses` |
| Buttons disabled during retry-after period | ✅ | All 4 buttons add `\|\| rateLimitActive` to disabled; tests verify button is disabled |
| Countdown timer until user can try again | ✅ | `$effect` with `setInterval(1000)` decrements `rateLimitRetryAfter`; test `countdown decrements and banner clears after reaching 0` |
| Works for all 4 API endpoints | ✅ | All 4 catch blocks updated with `instanceof RateLimitError` check; all 4 `streamFromAPI` calls pass `onHeaders` |

## Test Coverage

**New tests (7):**
- `429 with Retry-After header provides structured rate limit info` — verifies headers are accessible
- `429 with Retry-After: 0 indicates session limit` — verifies session limit detection
- `X-RateLimit-Remaining is accessible on successful responses` — verifies remaining count on 200
- `429 without JSON body still provides rate limit headers` — edge case: non-JSON 429 body
- `429 on persona refinement shows rate limit banner and disables button` — E2E UI: banner, button state
- `session rate limit shows permanent message` — E2E UI: permanent session limit message
- `countdown decrements and banner clears after reaching 0` — E2E UI: countdown lifecycle

**Existing tests (77):** All pass unchanged.

**Total:** 84 tests, 0 failures.

## Test Gaps

- No E2E test for rate-limit triggering from Analyze, Expand, or Refine buttons specifically (only tested via Persona). The code paths are identical (same `handleRateLimitError` and `handleResponseHeaders`), so coverage is adequate.
- No test for the remaining-requests indicator rendering in the workshop UI (would require a mock that returns `X-RateLimit-Remaining` on successful SSE responses — the mock override mechanism only supports simple responses, not SSE streams with headers).
- No test for rapid consecutive 429s (the countdown should reset to the new `Retry-After` value). Low risk since the state assignment is a simple overwrite.

## Design Decisions

1. **Custom `RateLimitError` over generic error enrichment.** Clean `instanceof` check at call sites. Extends `Error` so stack traces still work.
2. **Page-local rate-limit state over global store.** Only the workshop page makes API calls. No need for a shared store.
3. **`onHeaders` callback over return-value refactoring.** Non-breaking — existing callers without the 4th param work unchanged.
4. **`__mockApiOverride` on window for tests.** Necessary because `mockFetch` is resolved at module import time and doesn't go through `window.fetch` or the network. The override is only used in test code.

## Open Concerns

1. **Session limit has no recovery path.** When `Retry-After: 0` (session limit), the message says "Please refresh to start a new session." Refreshing generates a new `crypto.randomUUID()` session token. This works, but the user loses all workshop state. A future ticket could add session export/restore.
2. **Remaining count only visible in production.** The `X-RateLimit-Remaining` header is only sent by the CF Worker, not the dev proxy. In local dev, the indicator never appears. This is correct behavior but may surprise developers.
3. **No auto-retry.** The AC doesn't call for it, and it adds complexity. If desired, it would be a separate ticket.

## Build Status

- `npm run check`: 0 errors, 0 warnings
- `npm run lint`: clean
- `npx playwright test`: 84 passed (41s)
