# T-007-02 Review: Turnstile Failure Handling

## Summary of Changes

### Files Modified

| File | Lines Changed | Description |
|------|--------------|-------------|
| `frontend/src/app.html` | +14 | Turnstile script load/error/timeout detection |
| `frontend/src/lib/utils/turnstile.ts` | Rewrite (~150 lines) | Status tracking, retry, polling, callback system |
| `frontend/src/lib/api/stream.ts` | +18 | `TurnstileError` class + 403 detection |
| `frontend/src/routes/workshop/+page.svelte` | +40 | Warning banner, retry button, catch blocks |
| `frontend/tests/streaming.spec.ts` | +125 | 5 new test cases |

### No Files Created or Deleted

All changes are modifications to existing files.

## Acceptance Criteria Evaluation

- [x] **Detect Turnstile script load failure (timeout or error event):** `app.html` inline script sets `window.__turnstileScriptFailed` on `onerror` and after 5-second timeout. `turnstile.ts` reads these flags and notifies the page via `onTurnstileStatus` callback.

- [x] **Show a non-blocking warning banner if Turnstile can't load:** Amber banner at page top with `data-testid="turnstile-warning"`. Shows "Bot verification unavailable — requests may fail" for script load failures, "Bot protection check failed — try refreshing" for 403 responses.

- [x] **If a 403 is returned due to missing/invalid token, show a specific message:** `TurnstileError` class in `stream.ts` catches 403 responses. All 4 API function catch blocks set `turnstileWarning` and the stage-specific error variable with the specific message.

- [x] **Provide a "Retry verification" button that re-initializes Turnstile:** Button with `data-testid="turnstile-retry"` calls `retryTurnstile()` which destroys the widget, resets failure flags, and re-initializes if the script is now available. Only shown when `PUBLIC_TURNSTILE_SITE_KEY` is configured.

- [x] **Workshop still functions if Turnstile is disabled (no site key configured):** All Turnstile code is guarded by `PUBLIC_TURNSTILE_SITE_KEY` checks. When empty: no `initTurnstile` call, no status callback, no retry button, no script load warnings. If a 403 somehow occurs without a site key, the warning banner still shows (defensive).

## Test Coverage

| Test | What It Verifies |
|------|-----------------|
| `403 with "Verification failed" body is detected as Turnstile error` | Stream layer correctly identifies 403 + JSON body |
| `403 with non-JSON body uses default Turnstile error message` | Fallback message when body isn't JSON |
| `403 on persona refinement shows turnstile warning banner` | End-to-end: mock 403 → banner visible with correct text + stage error |
| `turnstile warning banner shows retry button only when site key is configured` | Retry button absent when no site key (test env) |
| `turnstile banner not visible when no 403 has occurred` | No false positives |

**Total tests:** 89 (84 existing + 5 new), all passing.

### Coverage Gaps

- **Script load failure UI test:** Not tested via Playwright because the Turnstile script isn't loaded in the test environment (no site key). The `onTurnstileStatus` callback path is exercised only in production. This is acceptable because the callback wiring is straightforward and the flag-setting logic in `app.html` is too tied to external script loading to meaningfully unit test.
- **Retry button functionality:** The retry button is tested for presence/absence but not for actual re-initialization (would require mocking `window.turnstile` in Playwright, which is fragile). The `retryTurnstile()` function logic is simple enough to be confident.
- **Token expiration mid-session:** The `expired-callback` auto-resets the widget (unchanged from before). No new UI for this — the user simply gets a 403 on next request and sees the banner. This is acceptable; true expiration handling would require pre-flight token validation.

## Architecture Notes

- `TurnstileError` follows the exact same pattern as `RateLimitError` from T-007-01
- Script detection uses `window.__turnstileScriptLoaded` / `window.__turnstileScriptFailed` as a bridge between the `app.html` inline script and the `turnstile.ts` module (no direct import possible from inline scripts)
- The `onTurnstileStatus` callback is a simple single-subscriber model (one callback at a time), which is sufficient since only the workshop page subscribes

## Open Concerns

1. **Single 403 error class for all 403s:** Currently, any 403 is treated as a Turnstile error. If the worker or backend ever returns 403 for non-Turnstile reasons (e.g., auth), this would show the wrong error message. Mitigation: the worker only returns 403 for Turnstile failures; other auth is handled differently (no auth exists today).

2. **Script timeout (5s) is hardcoded:** On very slow connections, the Turnstile script might take longer than 5s. The `initTurnstile` polling adds another 3s, giving 8s total before failure is reported. This seems generous enough for any reasonable network.

3. **No auto-retry on script failure:** If the Turnstile script fails (adblocker), the retry button will also fail because the script won't load on retry. The button is still useful for transient network errors where a retry might succeed.
