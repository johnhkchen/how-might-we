# Structure — T-007-01: Rate Limit User Feedback

## Files Modified

### 1. `frontend/src/lib/api/stream.ts`

**Changes:**
- Add `RateLimitError` class extending `Error`
  - Fields: `retryAfter: number` (seconds, 0 = permanent), `remaining: number`, `limit: number`, `isSessionLimit: boolean`
  - Exported so `+page.svelte` can use `instanceof`
- Add optional `options` parameter to `streamFromAPI`:
  ```ts
  interface StreamOptions {
    onHeaders?: (headers: Headers) => void;
  }
  ```
- In the non-ok response handler:
  - If `response.status === 429`, parse rate-limit headers and throw `RateLimitError`
  - Otherwise, throw generic `Error` (existing behavior)
- In the ok path: call `options.onHeaders?.(response.headers)` before reading the stream

**Public interface change:**
```ts
// Before
export async function streamFromAPI<T>(endpoint, body, onPartial): Promise<void>
// After
export async function streamFromAPI<T>(endpoint, body, onPartial, options?): Promise<void>
```

Backward compatible — existing callers without `options` work unchanged.

### 2. `frontend/src/routes/workshop/+page.svelte`

**Changes to `<script>` block:**

New reactive state (after existing error variables, ~line 78):
```
rateLimitRetryAfter: number = 0       // seconds remaining (0 = not rate-limited)
rateLimitRemaining: number | null = null  // from X-RateLimit-Remaining (null = unknown)
rateLimitSessionExhausted: boolean = false  // permanent session limit
```

New derived:
```
rateLimitActive = $derived(rateLimitRetryAfter > 0 || rateLimitSessionExhausted)
```

New `$effect` for countdown timer:
- When `rateLimitRetryAfter > 0`, start `setInterval(1000)` that decrements it
- Cleanup interval on effect re-run or when counter hits 0

New helper function `handleRateLimitError(err: RateLimitError)`:
- If `err.retryAfter === 0` and `err.isSessionLimit`: set `rateLimitSessionExhausted = true`
- Else: set `rateLimitRetryAfter = err.retryAfter`

New helper function `handleResponseHeaders(headers: Headers)`:
- Extract `X-RateLimit-Remaining`, update `rateLimitRemaining`

**Changes to 4 async functions:**
Each function's catch block gains:
```ts
if (e instanceof RateLimitError) {
    handleRateLimitError(e);
    return;  // don't set the stage-specific error
}
```

Each `streamFromAPI` call gets the 4th argument:
```ts
{ onHeaders: handleResponseHeaders }
```

**Changes to 4 button elements:**
Add `|| rateLimitActive` to each button's `disabled` expression.

**Changes to button labels:**
When `rateLimitActive && rateLimitRetryAfter > 0`, show "Wait {rateLimitRetryAfter}s..." instead of the normal label.

**Changes to template:**
Add a new rate-limit banner block (placed just inside `<div class="space-y-8">`, before stages):
```svelte
{#if rateLimitActive}
  <div class="bg-amber-50 border border-amber-300 rounded-lg p-4 text-sm text-amber-800">
    {#if rateLimitSessionExhausted}
      Session request limit reached. Please refresh to start a new session.
    {:else}
      Rate limit reached. You can try again in <strong>{rateLimitRetryAfter}s</strong>.
    {/if}
  </div>
{/if}
```

Add remaining-requests indicator below the header:
```svelte
{#if rateLimitRemaining !== null && !rateLimitActive}
  <p class="text-xs text-gray-400 text-right">{rateLimitRemaining} requests remaining</p>
{/if}
```

### 3. `frontend/tests/streaming.spec.ts`

**New test section:** `SSE streaming — rate limit handling`

Tests:
- `429 with Retry-After header shows rate limit message and countdown`
  - Route intercept returning 429 with `Retry-After: 5`, `X-RateLimit-Remaining: 0`
  - Verify amber banner appears with countdown
  - Verify buttons are disabled
- `429 with Retry-After: 0 (session limit) shows permanent message`
  - Route intercept returning 429 with `Retry-After: 0`
  - Verify "Session request limit" message appears
  - Verify no countdown
- `Countdown decrements and clears after reaching 0`
  - Set short Retry-After (2s), wait, verify banner disappears and buttons re-enable
- `X-RateLimit-Remaining shown on successful responses`
  - Route intercept returning 200 with `X-RateLimit-Remaining: 15`
  - Verify remaining indicator appears

## Files NOT Modified

- `worker/src/index.ts` — already sends correct headers, CORS exposes them
- `frontend/src/lib/api/client.ts` — no changes needed, apiFetch returns Response
- `frontend/src/lib/api/mock.ts` — mock doesn't simulate rate limiting; tests use Playwright route interception
- `frontend/src/lib/stores/session.svelte.ts` — rate-limit state is page-local, not session state
- No new component files — the rate-limit banner is small enough to inline in the page

## Component Boundaries

The `RateLimitError` is the only new export crossing module boundaries. Everything else is page-local state. This keeps the change self-contained.

## Ordering

1. `stream.ts` changes first (new error class + options param)
2. `+page.svelte` changes (consume new error, add UI)
3. Tests last (verify behavior)
