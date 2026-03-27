# T-007-02 Structure: Turnstile Failure Handling

## Files Modified

### 1. `frontend/src/app.html`

**Change:** Add `?onload=__onTurnstileLoad` to script URL. Add inline `<script>` with:
- `window.__onTurnstileLoad` callback that sets a flag
- `onerror` handler on the Turnstile script element
- 5-second timeout to detect load failure

```
Before: <script src="...turnstile/v0/api.js?render=explicit" async defer></script>
After:  <script src="...turnstile/v0/api.js?render=explicit&onload=__onTurnstileLoad" async defer></script>
        + inline <script> with load/error/timeout detection
```

### 2. `frontend/src/lib/utils/turnstile.ts`

**Changes:**
- Add `scriptReady` and `scriptFailed` module-level booleans
- Add `statusCallback` to notify the page of state changes
- New export: `onTurnstileStatus(cb: (status: TurnstileStatus) => void): void`
- New export: `getTurnstileStatus(): TurnstileStatus`
- New export: `retryTurnstile(siteKey: string, container: HTMLElement): void`
- New type: `TurnstileStatus = 'loading' | 'ready' | 'failed' | 'error'`
- Modify `initTurnstile` to use `scriptReady` flag, with fallback polling (500ms x 6 = 3s)
- Modify `error-callback` to call status callback with 'error'
- Add `notifyScriptLoaded()` and `notifyScriptFailed()` — called from the global callbacks set in `app.html`

### 3. `frontend/src/lib/api/stream.ts`

**Changes:**
- Add `TurnstileError` class (parallel to `RateLimitError`)
  - Fields: `message: string`
  - No special headers to extract — just the status + body
- In `streamFromAPI`, add 403 detection before the generic error path:
  ```
  if (response.status === 403) → parse body → if matches "verification" → throw TurnstileError
  ```

### 4. `frontend/src/routes/workshop/+page.svelte`

**Changes:**
- Import `TurnstileError` from stream
- Import `onTurnstileStatus`, `retryTurnstile`, `getTurnstileStatus` from turnstile utils
- Add reactive state:
  - `turnstileWarning: string | null` — banner message
  - `turnstileFailed: boolean` — persistent failure flag
- In `onMount`: register status callback, check initial status
- In each catch block: add `instanceof TurnstileError` check before generic error
  - Set `turnstileWarning` to "Bot protection check failed — try refreshing"
  - Set the stage-specific error to the same message
- Add banner UI above rate-limit banner:
  ```svelte
  {#if turnstileWarning}
    <div class="bg-amber-50 ..." data-testid="turnstile-warning">
      {turnstileWarning}
      <button onclick={handleRetryTurnstile}>Retry verification</button>
    </div>
  {/if}
  ```
- Add `handleRetryTurnstile()` function:
  - Calls `retryTurnstile(PUBLIC_TURNSTILE_SITE_KEY, turnstileContainer)`
  - Clears `turnstileWarning` on success

### 5. `frontend/tests/streaming.spec.ts`

**New test sections:**
- `Turnstile error handling — stream layer`: 403 with "Verification failed" body throws TurnstileError
- `Turnstile UI — workshop page`:
  - 403 on persona refinement shows turnstile warning banner
  - Warning banner has "Retry verification" button
  - Workshop functions when Turnstile is not configured (no banner shown)

## Module Boundaries

```
app.html
  └── Sets window.__onTurnstileLoad / onerror / timeout
       │
       ▼
turnstile.ts (module state)
  ├── scriptReady / scriptFailed flags (set by app.html callbacks)
  ├── initTurnstile() — renders widget, waits for script if needed
  ├── retryTurnstile() — destroys + re-inits
  ├── onTurnstileStatus() — registers page callback
  └── getToken() — unchanged

stream.ts
  ├── TurnstileError class
  └── streamFromAPI() — detects 403, throws TurnstileError

workshop/+page.svelte
  ├── turnstileWarning state
  ├── catch(TurnstileError) in all 4 API functions
  └── Retry verification button → retryTurnstile()
```

## Ordering

1. `app.html` + `turnstile.ts` (script detection) — independent unit
2. `stream.ts` (TurnstileError class + 403 detection) — independent unit
3. `workshop/+page.svelte` (UI integration) — depends on both above
4. Tests — depends on all above

## No Files Created

All changes are modifications to existing files. No new files needed.
