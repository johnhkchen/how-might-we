# T-007-02 Plan: Turnstile Failure Handling

## Step 1: Script Load Detection (`app.html` + `turnstile.ts`)

### app.html
- Add `&onload=__onTurnstileLoad` to the Turnstile script URL
- Add inline script before the Turnstile script that:
  - Defines `window.__onTurnstileLoad` callback
  - Adds `onerror` to the Turnstile script element after DOM ready
  - Sets a 5-second timeout for load failure detection
  - Calls into `turnstile.ts` exports via window bridge functions

### turnstile.ts
- Add `TurnstileStatus` type export
- Add module-level `scriptReady`, `scriptFailed` flags
- Add `statusCallback` variable for page notification
- Export `notifyScriptLoaded()` — sets `scriptReady=true`, calls status callback
- Export `notifyScriptFailed()` — sets `scriptFailed=true`, calls status callback
- Export `onTurnstileStatus(cb)` — registers callback, calls immediately with current status
- Export `getTurnstileStatus()` — returns current status
- Modify `initTurnstile()`:
  - If `window.turnstile` exists, render immediately (existing behavior)
  - If `scriptFailed` is true, call status callback with 'failed', return
  - If neither, wait up to 3s for script via interval polling (500ms checks)
  - On success, render widget
  - On timeout, mark failed and notify
- Add `retryTurnstile(siteKey, container)`:
  - Call `destroy()` to clean up existing widget
  - Reset `scriptFailed` flag
  - If `window.turnstile` is now available, re-init immediately
  - Otherwise, notify 'failed' (script still not loaded)
- Modify `error-callback` in widget options to call status callback with 'error'

**Verify:** Import the new exports in a scratch check — `npm run check`.

## Step 2: TurnstileError in stream.ts

- Add `TurnstileError` class extending `Error`:
  ```typescript
  export class TurnstileError extends Error {
      constructor(message: string) {
          super(message);
          this.name = 'TurnstileError';
      }
  }
  ```
- In `streamFromAPI`, before the generic error throw, add:
  ```typescript
  if (response.status === 403) {
      // parse body for verification failure message
      let msg = 'Bot protection check failed — try refreshing';
      try {
          const text = await response.text();
          const json = JSON.parse(text);
          if (json.error) msg = json.error;
      } catch { /* use default */ }
      throw new TurnstileError(msg);
  }
  ```

**Verify:** `npm run check` passes.

## Step 3: Workshop Page Integration

- Import `TurnstileError` from stream
- Import `onTurnstileStatus`, `retryTurnstile`, `getTurnstileStatus` from turnstile
- Import `TurnstileStatus` type
- Add state variables:
  ```typescript
  let turnstileWarning: string | null = $state(null);
  let turnstileFailed = $state(false);
  ```
- In `onMount`, after existing Turnstile init:
  ```typescript
  onTurnstileStatus((status) => {
      if (status === 'failed' || status === 'error') {
          turnstileFailed = true;
          turnstileWarning = 'Bot verification unavailable — requests may fail';
      } else if (status === 'ready') {
          turnstileFailed = false;
          turnstileWarning = null;
      }
  });
  ```
- Add `handleRetryTurnstile()`:
  ```typescript
  function handleRetryTurnstile() {
      if (PUBLIC_TURNSTILE_SITE_KEY && turnstileContainer) {
          retryTurnstile(PUBLIC_TURNSTILE_SITE_KEY, turnstileContainer);
      }
  }
  ```
- In all 4 catch blocks, add before the generic else:
  ```typescript
  } else if (e instanceof TurnstileError) {
      turnstileFailed = true;
      turnstileWarning = 'Bot protection check failed — try refreshing';
      error = 'Bot protection check failed — try refreshing';
  } else {
  ```
- Add banner markup above rate-limit banner:
  ```svelte
  {#if turnstileWarning && PUBLIC_TURNSTILE_SITE_KEY}
    <div class="bg-amber-50 border border-amber-300 rounded-lg p-4 text-sm text-amber-800 flex items-center justify-between"
         data-testid="turnstile-warning">
      <span>{turnstileWarning}</span>
      <button class="..." onclick={handleRetryTurnstile} data-testid="turnstile-retry">
        Retry verification
      </button>
    </div>
  {/if}
  ```
  - Only shows when site key is configured (AC: workshop functions without Turnstile)

**Verify:** `npm run check` and `npm run lint` pass.

## Step 4: Tests

Add to `streaming.spec.ts`:

### TurnstileError detection tests
- 403 with "Verification failed" body → TurnstileError thrown
- 403 with non-JSON body → TurnstileError with default message

### Workshop UI tests
- 403 on persona refinement → turnstile warning banner visible with correct text
- Turnstile warning banner has "Retry verification" button
- Banner not visible when no 403 has occurred

**Verify:** `npx playwright test` — all tests pass.

## Step 5: End-to-End Verification

- `npm run check` — TypeScript/Svelte checks clean
- `npm run lint` — ESLint clean
- `npx playwright test` — all tests pass (existing + new)
- Manual verification: no banner when site key is empty, banner appears on 403
