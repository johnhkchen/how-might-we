# T-005-02 Progress: Turnstile Bot Protection

## Completed

### Step 1: Worker — CORS + Header Name Alignment
- Updated `Access-Control-Allow-Headers` to include `X-Turnstile-Token`
- Changed header read from `cf-turnstile-response` to `X-Turnstile-Token`
- Worker TypeScript compiles cleanly

### Step 2: Frontend — Turnstile Utility Module
- Created `frontend/src/lib/utils/turnstile.ts`
- Exports: `TOKEN_HEADER`, `initTurnstile()`, `getToken()`, `waitForToken()`, `resetTurnstile()`, `destroy()`
- TypeScript types for `window.turnstile` API declared inline
- Auto-refresh on token expiry via `expired-callback`

### Step 3: Frontend — Load Turnstile Script
- Added `<script>` tag to `frontend/src/app.html` with `?render=explicit` and `async defer`

### Step 4: Frontend — API Client Header Injection
- Refactored `apiFetch` from constant assignment to async wrapper function
- Injects `X-Turnstile-Token` header when a token is available
- Same function signature — no changes needed in callers

### Step 5: Frontend — Workshop Page Widget Lifecycle
- Added Turnstile imports and lifecycle hooks (`onMount`/`onDestroy`)
- Added hidden container div (off-screen positioned, `aria-hidden`)
- Added `resetTurnstile()` to all 4 API call `finally` blocks
- Added `PUBLIC_TURNSTILE_SITE_KEY` to `.env` (empty default)
- Fixed Svelte 5 reactivity warning for `bind:this` container

### Step 6: Deploy Script Update
- Added `TURNSTILE_SITE_KEY` variable to `scripts/deploy.sh`
- Passed `PUBLIC_TURNSTILE_SITE_KEY` to frontend build step

### Step 7: Verification
- `npm run check`: 0 errors, 0 warnings
- `npm run lint`: clean
- `npm run build`: success
- Worker `tsc --noEmit`: clean
- Deploy script `bash -n`: valid syntax

## Deviations from Plan

None. All steps executed as planned.
