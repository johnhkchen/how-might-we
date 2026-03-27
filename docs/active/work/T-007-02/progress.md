# T-007-02 Progress: Turnstile Failure Handling

## Step 1: Script Load Detection — DONE

- Modified `app.html`: added inline script with `__onTurnstileLoad` callback, `onerror` handler, and 5-second timeout
- Added `&onload=__onTurnstileLoad` to Turnstile script URL
- Updated `turnstile.ts`: added `TurnstileStatus` type, `scriptReady`/`scriptFailed` flags via window globals, `onTurnstileStatus()` callback registration, `notifyScriptLoaded()`/`notifyScriptFailed()` exports, and `retryTurnstile()` function
- Modified `initTurnstile()` to poll for script availability (500ms x 6 = 3s) when not immediately ready
- Extracted widget rendering into `renderWidget()` helper

## Step 2: TurnstileError in stream.ts — DONE

- Added `TurnstileError` class extending `Error` (parallel to `RateLimitError`)
- Added 403 detection in `streamFromAPI()` before generic error path
- 403 responses parse body for error message, throw `TurnstileError`

## Step 3: Workshop Page Integration — DONE

- Imported `TurnstileError`, `onTurnstileStatus`, `retryTurnstile`, `TurnstileStatus`
- Added `turnstileWarning` and `turnstileFailed` reactive state
- Registered `onTurnstileStatus` callback in `onMount` (only when site key configured)
- Added `handleRetryTurnstile()` function
- Updated all 4 catch blocks with `TurnstileError` handling
- Added amber warning banner with conditional "Retry verification" button
- Banner shows regardless of site key config (server can return 403 even without client-side Turnstile)
- Retry button only shows when site key is configured (retry is meaningless without it)

**Deviation from plan:** Changed banner condition from `turnstileWarning && PUBLIC_TURNSTILE_SITE_KEY` to just `turnstileWarning`. Reason: the worker can enforce Turnstile even if the frontend doesn't have the site key configured (misconfiguration scenario). The 403 error banner should always show.

## Step 4: Tests — DONE

Added 5 new tests:
- `403 with "Verification failed" body is detected as Turnstile error`
- `403 with non-JSON body uses default Turnstile error message`
- `403 on persona refinement shows turnstile warning banner`
- `turnstile warning banner shows retry button only when site key is configured`
- `turnstile banner not visible when no 403 has occurred`

## Step 5: Verification — DONE

- `npm run check`: 0 errors, 0 warnings
- `npm run lint`: clean
- `npx playwright test`: 89 tests pass (including 5 new)
