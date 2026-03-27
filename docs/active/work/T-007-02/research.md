# T-007-02 Research: Turnstile Failure Handling

## Current Turnstile Integration

### Script Loading (`frontend/src/app.html:8`)

```html
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" async defer></script>
```

- Loaded with `async defer` — non-blocking but no guarantee of timing
- No `onerror` handler — script failures are completely silent
- No readiness detection — code just checks `window.turnstile` once at mount

### Token Lifecycle (`frontend/src/lib/utils/turnstile.ts`)

Module-level state:
- `currentToken: string | null` — latest valid token
- `widgetId: string | null` — Turnstile widget handle
- `resolveWaiter` — one-shot promise resolver for `waitForToken()`

Key functions:
- `initTurnstile(siteKey, container)` — renders invisible widget. If `window.turnstile` is undefined, logs `console.warn` and returns. No retry, no error propagation.
- `getToken()` — returns `currentToken` synchronously (null if unavailable)
- `waitForToken(timeoutMs=3000)` — waits up to 3s for a token via callback
- `resetTurnstile()` — clears token and resets widget (called after every API request)
- `destroy()` — removes widget, clears all state

Widget callbacks:
- `callback` — stores token, resolves any pending waiter
- `expired-callback` — clears token, auto-resets widget (no UI feedback)
- `error-callback` — clears token (no UI feedback, no retry)

### API Client (`frontend/src/lib/api/client.ts`)

```typescript
const turnstileToken = getToken();
if (turnstileToken) {
    headers.set(TOKEN_HEADER, turnstileToken);
}
```

- Attaches `X-Turnstile-Token` only if token is non-null
- If Turnstile failed/not loaded/expired, request goes out without the header
- No warning or fallback logic

### Worker Validation (`worker/src/index.ts:305-311`)

```typescript
if (env.TURNSTILE_SECRET_KEY) {
    const token = request.headers.get('X-Turnstile-Token') || '';
    if (!token || !(await verifyTurnstile(token, env.TURNSTILE_SECRET_KEY))) {
        return jsonError('Verification failed', 403, env, requestOrigin);
    }
}
```

- Only validates if `TURNSTILE_SECRET_KEY` is set (optional)
- Missing token → 403 with body `{"error": "Verification failed"}`
- Invalid token → same 403 response (no distinction)
- No specific error code or header to distinguish Turnstile 403 from other 403s

### Workshop Page Integration (`frontend/src/routes/workshop/+page.svelte`)

- Imports `PUBLIC_TURNSTILE_SITE_KEY` from static env
- `onMount`: calls `initTurnstile()` if site key is set and container exists
- `onDestroy`: calls `destroyTurnstile()`
- All 4 API functions call `resetTurnstile()` in their `finally` block
- Invisible widget container rendered only when site key is set

### Error Display Pattern (workshop page)

Each stage has its own error state (`error`, `analysisError`, `expandError`, `refineError`).
Errors are displayed as red banners:
```svelte
<div class="mt-4 bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
    {error}
</div>
```

A 403 currently shows: `"API error: 403 — Verification failed"` — generic, no retry option.

## Dependency: T-007-01 (Rate Limit User Feedback)

Completed. Established patterns this ticket should follow:
- `RateLimitError` custom error class in `stream.ts` for 429 detection
- `__mockApiOverride` mechanism in `mock.ts` for injecting test responses
- Page-level reactive state for banner visibility
- `$effect` for countdown timers
- `data-testid` attributes on all testable elements
- Tests: route-level mock overrides + `__mockApiOverride` for workshop page tests

## Failure Scenarios to Handle

1. **Script never loads** — adblocker, network error, CDN outage
2. **Script loads but widget errors** — `error-callback` fires, token stays null
3. **Token expires mid-session** — `expired-callback` fires, auto-reset may fail
4. **Worker returns 403** — missing or invalid token when enforcement is on
5. **No site key configured** — Turnstile disabled, workshop should work normally

## Constraints

- Turnstile widget is invisible — user never sees a challenge, just the effects of failure
- Token is consumed once per request (reset in `finally`) — fresh token needed each time
- `window.turnstile` availability depends on external CDN script load timing
- Worker currently returns identical 403 for "no token" and "bad token"
- Workshop page already has 5 stage-specific error variables — adding more state adds complexity
- Rate limit banner pattern (amber, non-blocking, page-level) is the established UI pattern

## Files Relevant to This Ticket

| File | Role |
|------|------|
| `frontend/src/app.html` | Turnstile script tag |
| `frontend/src/lib/utils/turnstile.ts` | Token lifecycle, failure detection |
| `frontend/src/lib/api/stream.ts` | Error class for 403, SSE client |
| `frontend/src/lib/api/client.ts` | Token header injection |
| `frontend/src/routes/workshop/+page.svelte` | Turnstile init, error display, retry UI |
| `frontend/src/lib/api/mock.ts` | `__mockApiOverride` for tests |
| `frontend/tests/streaming.spec.ts` | Test patterns to follow |
| `worker/src/index.ts` | 403 response source (read-only context) |
