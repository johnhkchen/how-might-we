# Plan — T-007-01: Rate Limit User Feedback

## Step 1: Add RateLimitError and options to streamFromAPI

**File:** `frontend/src/lib/api/stream.ts`

1. Define and export `RateLimitError` class:
   - Extends `Error`
   - Constructor takes `{ retryAfter, remaining, limit, isSessionLimit, message }`
   - Stores all fields as public readonly properties
2. Add `StreamOptions` interface with optional `onHeaders` callback
3. Add 4th parameter `options?: StreamOptions` to `streamFromAPI`
4. In the `!response.ok` branch:
   - If `response.status === 429`: extract `Retry-After`, `X-RateLimit-Remaining`, `X-RateLimit-Limit` from `response.headers`, parse JSON body for error message, throw `RateLimitError`
   - Else: existing behavior (throw generic Error)
5. In the ok path (before reading stream): call `options?.onHeaders?.(response.headers)`

**Verify:** `npm run check` passes. Existing callers still compile (no required params added).

## Step 2: Add rate-limit state and handlers to workshop page

**File:** `frontend/src/routes/workshop/+page.svelte`

1. Import `RateLimitError` from `$lib/api/stream`
2. Add reactive state:
   - `rateLimitRetryAfter = $state(0)`
   - `rateLimitRemaining: number | null = $state(null)`
   - `rateLimitSessionExhausted = $state(false)`
3. Add derived: `rateLimitActive = $derived(rateLimitRetryAfter > 0 || rateLimitSessionExhausted)`
4. Add `$effect` for countdown:
   - Guard: only run when `rateLimitRetryAfter > 0`
   - `setInterval(1000)` that decrements `rateLimitRetryAfter`
   - When it hits 0, clear interval
   - Return cleanup function
5. Add `handleRateLimitError(err: RateLimitError)` function
6. Add `handleResponseHeaders(headers: Headers)` function
7. Update all 4 catch blocks to check `instanceof RateLimitError` first
8. Pass `{ onHeaders: handleResponseHeaders }` as 4th arg to all 4 `streamFromAPI` calls

**Verify:** `npm run check` passes.

## Step 3: Update UI — rate-limit banner, remaining indicator, button states

**File:** `frontend/src/routes/workshop/+page.svelte`

1. Add rate-limit banner after the `<div class="space-y-8">` opening, before Stage 1
2. Add remaining-requests indicator below the header
3. Update all 4 button `disabled` attrs to include `|| rateLimitActive`
4. Update button labels: when `rateLimitActive && rateLimitRetryAfter > 0`, show "Wait {rateLimitRetryAfter}s..."
5. Add `data-testid="rate-limit-banner"` to the banner div
6. Add `data-testid="rate-limit-remaining"` to the remaining indicator

**Verify:** `npm run check` passes. Visual inspection with mock or manual 429 route.

## Step 4: Add Playwright tests

**File:** `frontend/tests/streaming.spec.ts`

1. Add `test.describe('Rate limit feedback')` with 4 tests:
   a. 429 with `Retry-After: 5` → amber banner visible, buttons disabled
   b. 429 with `Retry-After: 0` → session limit message, no countdown
   c. Countdown decrements (use `Retry-After: 2`, wait 3s, verify banner gone)
   d. `X-RateLimit-Remaining` on 200 → remaining indicator visible

**Verify:** `npx playwright test` passes.

## Step 5: Final verification

1. `npm run check` — TypeScript + Svelte checks
2. `npm run lint` — ESLint
3. `npx playwright test` — all tests
4. Manual test: use route interception in browser to trigger 429 and verify UX

## Acceptance Criteria Mapping

| AC | Step |
|----|------|
| 429 shows dedicated rate limit message | Steps 1, 2, 3 |
| Message includes how long to wait (Retry-After) | Steps 1, 3 |
| Show remaining request count (X-RateLimit-Remaining) | Steps 1, 2, 3 |
| Buttons disabled during retry-after period | Steps 2, 3 |
| Countdown timer until user can try again | Steps 2, 3 |
| Works for all 4 API endpoints | Step 2 (all 4 catch blocks updated) |
