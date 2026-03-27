# T-007-02 Design: Turnstile Failure Handling

## Problem

Three distinct failure modes with no user feedback:
1. Turnstile script fails to load → requests go without token → 403
2. Widget errors or token expires → same silent 403 path
3. User has no way to recover — no retry mechanism, no explanation

## Decision 1: Script Load Detection

### Option A: `onload`/`onerror` callbacks on script tag
Add `onTurnstileLoad`/`onTurnstileError` global callbacks referenced by the script URL's `onload` param. Cloudflare's Turnstile API supports `?onload=callbackName`.

**Pro:** Native browser event, fires exactly once, reliable.
**Con:** Requires modifying `app.html` and adding global window functions.

### Option B: Polling for `window.turnstile`
Set a timeout (e.g., 5s) and poll every 500ms for `window.turnstile`.

**Pro:** No changes to script tag.
**Con:** Polling is wasteful; timeout is arbitrary; race with `onMount`.

### Option C: Event-based with `onload`/`onerror` on script element
Programmatically create the script element in `turnstile.ts` instead of `app.html`, attach `onload`/`onerror` event listeners.

**Pro:** Full control, can report status, retryable.
**Con:** Removes script from HTML (minor), changes load timing slightly.

**Decision: Option A** — Use Turnstile's built-in `?onload=callbackName` parameter with a global callback and a timeout fallback. This is the documented Cloudflare approach. Add `onerror` via a small inline script. Keep the `<script>` tag in `app.html` for proper early loading.

The callback sets a module-level `scriptLoaded` flag. A timeout (5s) sets `scriptFailed` if the callback hasn't fired. `initTurnstile` checks these states.

## Decision 2: State Management for Turnstile Status

### Option A: Module-level state in `turnstile.ts` with getter functions
Export `isTurnstileAvailable()`, `isTurnstileFailed()` functions that read module state.

**Pro:** Encapsulated, no store coupling.
**Con:** Workshop page needs to poll or call these at specific points.

### Option B: Reactive state via exported `$state` rune in `turnstile.ts`
Export reactive signals from `turnstile.ts` that the page can bind to.

**Pro:** Automatic UI updates.
**Con:** Mixes Svelte reactivity into a utility module.

### Option C: Callback-based — `initTurnstile` accepts `onStatusChange`
`initTurnstile` takes an optional callback `(status: 'ready' | 'failed' | 'error') => void`.

**Pro:** Decoupled, testable.
**Con:** Requires wiring callback in the page.

**Decision: Option A with a notification callback.** Keep module state in `turnstile.ts` (it already has module-level `currentToken`, `widgetId`). Add a `scriptLoaded` boolean and `scriptFailed` boolean. Export `isTurnstileReady()` and `isTurnstileFailed()`. Add an optional `onStatusChange` callback to `initTurnstile` so the workshop page can react. The page manages its own `$state` for the banner.

## Decision 3: 403 Error Handling

### Option A: Custom `TurnstileError` class (parallel to `RateLimitError`)
Add a `TurnstileError` class in `stream.ts`. Detect 403 + body contains "Verification failed" and throw it instead of generic `Error`.

**Pro:** Follows established pattern from T-007-01. Clean separation in catch blocks.
**Con:** Slightly fragile — depends on error message string from worker.

### Option B: Check status code only (403 = Turnstile error)
Any 403 is treated as a Turnstile failure.

**Pro:** Simple.
**Con:** If other 403 sources exist in the future, false positives.

**Decision: Option A.** Create `TurnstileError` class. Match on `response.status === 403` AND body `error` field containing "erification" (case-insensitive substring). This is specific enough to avoid false positives while tolerating minor message changes. The worker is our code — we control the message.

## Decision 4: Warning Banner UI

Follow the established rate-limit banner pattern:
- Amber/yellow banner at page top (non-blocking)
- For script load failure: "Bot verification unavailable — requests may fail. [Retry]"
- For 403 response: "Bot protection check failed — try refreshing" with a "Retry verification" button
- Banner has `data-testid` for Playwright testing

The "Retry verification" button calls a new `retryTurnstile()` function that:
1. Destroys the existing widget
2. Checks if `window.turnstile` is now available (script may have loaded late)
3. Re-initializes the widget
4. Clears the error banner if successful

## Decision 5: Graceful Degradation When Disabled

No changes needed. Current code already handles this:
- `PUBLIC_TURNSTILE_SITE_KEY` empty → `initTurnstile` never called → `getToken()` returns null → no header sent
- Worker without `TURNSTILE_SECRET_KEY` → skips validation → requests succeed

The only addition: ensure the Turnstile warning banner never shows when site key is empty.

## Rejected Approaches

1. **Retry queue** — Automatically re-send failed 403 requests after token refresh. Too complex; user can just click the button again.
2. **Global error boundary** — Wrap all API calls in a Turnstile-aware error handler. Over-engineered; the catch blocks are already per-stage.
3. **Turnstile status in session store** — Adds coupling between Turnstile (a browser/security concern) and session state (a domain concern). Keep separate.
4. **Loading the script programmatically** — Loses the benefit of early `<script>` tag loading. The `?onload=` approach gives us the same detection without sacrificing load timing.
