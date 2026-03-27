# Progress — T-007-01: Rate Limit User Feedback

## Completed Steps

### Step 1: RateLimitError + options in streamFromAPI ✅
- Added `RateLimitError` class with `retryAfter`, `remaining`, `limit`, `isSessionLimit` fields
- Added optional `StreamOptions` with `onHeaders` callback
- 429 responses throw `RateLimitError` instead of generic `Error`
- `onHeaders` called on successful responses for remaining-count tracking

### Step 2: Rate-limit state and handlers in workshop page ✅
- Added `rateLimitRetryAfter`, `rateLimitRemaining`, `rateLimitSessionExhausted` state
- Added `rateLimitActive` derived state
- Added `$effect` countdown timer (1s interval, auto-cleanup)
- Added `handleRateLimitError` and `handleResponseHeaders` helpers
- Updated all 4 catch blocks with `instanceof RateLimitError` check
- Added `{ onHeaders: handleResponseHeaders }` to all 4 `streamFromAPI` calls

### Step 3: UI updates ✅
- Rate-limit banner (amber) with countdown or session-limit message
- Remaining-requests indicator below header
- All 4 buttons add `|| rateLimitActive` to disabled condition
- Buttons show "Wait Xs..." countdown text when rate-limited
- data-testid attributes on new elements

### Step 4: Playwright tests ✅
- 4 header-level tests (429 parsing, session limit, remaining on 200, plain-text 429)
- 3 E2E UI tests (banner + disable, session limit permanent, countdown clears)
- Added `__mockApiOverride` mechanism to mock.ts for test overrides
- All 84 tests pass (81 existing + 7 new, 0 failures)

### Step 5: Final verification ✅
- `npm run check`: 0 errors, 0 warnings
- `npm run lint`: clean
- `npx playwright test`: 84 passed

## Deviations from Plan

- Added `__mockApiOverride` to `mock.ts` to enable E2E testing of 429 UI behavior. The mock system intercepts requests before `window.fetch`, so Playwright route interception couldn't reach API calls. The override mechanism allows tests to inject specific responses.

## Files Modified

| File | Change |
|------|--------|
| `frontend/src/lib/api/stream.ts` | `RateLimitError` class, `StreamOptions` interface, 429 handling |
| `frontend/src/lib/api/mock.ts` | `__mockApiOverride` for test-time response injection |
| `frontend/src/routes/workshop/+page.svelte` | Rate-limit state, countdown timer, banner, button updates |
| `frontend/tests/streaming.spec.ts` | 7 new tests (4 header-level + 3 E2E UI) |
