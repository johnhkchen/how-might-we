# Research — T-007-01: Rate Limit User Feedback

## Current Error Handling Flow

### Worker (rate limiting source)
**File:** `worker/src/index.ts`

The CF Worker implements two rate-limiting strategies:

1. **Per-IP sliding window** (`checkIpRateLimit`): 20 req/min default, configurable via `RATE_LIMIT_IP_MAX`. Uses in-memory `Map<string, number[]>` keyed by `cf-connecting-ip`.
2. **Per-session lifetime counter** (`checkSessionRateLimit`): 50 req/session default, configurable via `RATE_LIMIT_SESSION_MAX`. Uses `X-Session-Token` header.

When rate-limited, the worker returns:
- **Status:** `429`
- **Body:** `{"error": "Rate limit exceeded"}` or `{"error": "Session rate limit exceeded"}`
- **Headers:**
  - `X-RateLimit-Limit` — max requests in window
  - `X-RateLimit-Remaining` — remaining (always `0` on 429)
  - `X-RateLimit-Reset` — Unix timestamp (seconds) when oldest window entry expires
  - `Retry-After` — seconds until the client can retry (IP limit) or `"0"` (session limit)
  - CORS headers including `Access-Control-Expose-Headers` that already exposes all four rate-limit headers

Key detail: session rate limit returns `Retry-After: 0` because it's a lifetime cap (no recovery by waiting). IP rate limit returns a real `Retry-After` value computed as `Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))`.

### Non-429 responses also carry rate-limit headers
When requests succeed, the proxy attaches `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` via `rlHeaders` passed to `proxyToLambda`. These are available on every 200 response too.

### Frontend SSE Client
**File:** `frontend/src/lib/api/stream.ts`

`streamFromAPI<T>()` is the single entry point for all 4 API calls. On non-200:
```ts
let message = `API error: ${response.status} ${response.statusText}`;
// tries to parse JSON body for json.error
throw new Error(message);
```

No special handling for 429. The `response` object (and its headers) is discarded — only the error message string propagates.

### Frontend API Client
**File:** `frontend/src/lib/api/client.ts`

`apiFetch()` wraps `fetch` with session token and Turnstile headers. Returns raw `Response` — no header extraction or error interception.

### Workshop Page Error Handling
**File:** `frontend/src/routes/workshop/+page.svelte`

Each of the 4 async functions (`refinePersona`, `analyzeHMW`, `expandHMW`, `refineHMW`) follows the same pattern:
```ts
catch (e) {
    error = e instanceof Error ? e.message : 'An unexpected error occurred';
}
```

Errors are displayed in per-stage error divs:
```svelte
{#if error}
  <div class="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
    {error}
  </div>
{/if}
```

There are 4 separate error state variables: `error`, `analysisError`, `expandError`, `refineError`. Each displayed identically as a red banner with the raw error message string.

### Button Disable Logic
Buttons are currently disabled only during streaming (`session.isStreaming`, `isAnalyzing`, `isExpanding`, `isRefining`). No mechanism to disable during a rate-limit cooldown period.

### Mock API
**File:** `frontend/src/lib/api/mock.ts`

`mockFetch` always returns 200. No mock for 429 responses. Tests in `streaming.spec.ts` test error handling at the generic level (500, 503) but not 429 specifically.

## Headers Available at the Frontend

CORS `Access-Control-Expose-Headers` already includes:
- `X-RateLimit-Limit`
- `X-RateLimit-Remaining`
- `X-RateLimit-Reset`
- `Retry-After`

So the frontend **can** read these headers — no worker changes needed.

## Key Constraints

1. **streamFromAPI discards the Response object.** It reads the body as a stream and throws on non-200, but doesn't return the Response or its headers to callers.
2. **Error state is string-only.** The workshop page stores error messages as `string | null`. A structured error (with retryAfter, remaining, etc.) needs a different shape.
3. **4 independent error variables.** Each stage has its own error state and display block. Rate-limit state needs to affect all 4 (one rate limit blocks all).
4. **No shared timer/countdown mechanism exists.** A countdown timer that disables buttons and shows "try again in Xs" is new frontend behavior.
5. **Session rate limit has no recovery.** When `Retry-After: 0`, there's no countdown — it's permanent for the session. The UI message must distinguish this case.
6. **Dev mode (mock API) never triggers 429.** Need to decide whether to add mock support for testing or rely on Playwright route interception.

## Files to Modify

| File | Role |
|------|------|
| `frontend/src/lib/api/stream.ts` | Extract rate-limit headers from 429 responses |
| `frontend/src/routes/workshop/+page.svelte` | Consume structured error, manage countdown, disable buttons |
| `frontend/tests/streaming.spec.ts` | Add 429-specific test cases |
| Possibly new: `frontend/src/lib/stores/rateLimit.svelte.ts` or inline state | Countdown timer + rate-limit state |

## Patterns to Follow

- Svelte 5 runes (`$state`, `$derived`, `$effect`) — no legacy stores
- Error display pattern: `bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700`
- Tailwind utility classes, no custom CSS
- `resetTurnstile()` called in every finally block — must still happen on 429
