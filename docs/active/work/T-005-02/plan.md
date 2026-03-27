# T-005-02 Plan: Turnstile Bot Protection

## Step 1: Worker — CORS + Header Name Alignment

**Files**: `worker/src/index.ts`

Changes:
1. Update `corsHeaders()` to include `X-Turnstile-Token` in `Access-Control-Allow-Headers`.
2. Change line 139 from `request.headers.get('cf-turnstile-response')` to `request.headers.get('X-Turnstile-Token')`.

**Verification**: Worker TypeScript compiles cleanly (`cd worker && npx tsc --noEmit`).

**Commit**: "feat(worker): align Turnstile header to X-Turnstile-Token and update CORS"

## Step 2: Frontend — Turnstile Utility Module

**Files**: `frontend/src/lib/utils/turnstile.ts` (new)

Create the token lifecycle manager:
- Type declarations for `window.turnstile` API.
- `initTurnstile(siteKey, container)` — explicit render, invisible mode, callback stores token.
- `getToken()` — returns current token or null.
- `waitForToken(timeoutMs)` — promise-based wait for token availability.
- `resetTurnstile()` — clears token, calls `turnstile.reset()`.
- `destroy()` — calls `turnstile.remove()`, clears all state.
- `TOKEN_HEADER` constant.
- Auto-refresh: set an `expired-callback` that resets the widget when token expires.

**Verification**: `npm run check` passes (TypeScript).

**Commit**: "feat(frontend): add Turnstile token lifecycle utility"

## Step 3: Frontend — Load Turnstile Script

**Files**: `frontend/src/app.html`

Add before `%sveltekit.head%`:
```html
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" async defer></script>
```

**Verification**: Dev server loads without errors. Script tag present in HTML source.

**Commit**: Combined with Step 2.

## Step 4: Frontend — API Client Header Injection

**Files**: `frontend/src/lib/api/client.ts`

1. Import `getToken`, `TOKEN_HEADER` from `$lib/utils/turnstile`.
2. Change `apiFetch` from a direct assignment to a wrapper function that injects the header.
3. Maintain the same function signature so `stream.ts` needs no changes.

**Verification**: `npm run check` passes. `npm run lint` passes. Mock mode still works (`npm run dev:mock`).

**Commit**: "feat(frontend): inject Turnstile token header in API client"

## Step 5: Frontend — Workshop Page Widget Lifecycle

**Files**: `frontend/src/routes/workshop/+page.svelte`, `frontend/.env`

1. Add `PUBLIC_TURNSTILE_SITE_KEY` to `.env` (empty default).
2. Import `initTurnstile`, `resetTurnstile`, `destroy` from `$lib/utils/turnstile`.
3. Import `PUBLIC_TURNSTILE_SITE_KEY` from `$env/static/public`.
4. Add `onMount`/`onDestroy` lifecycle hooks for Turnstile.
5. Add hidden container div for the widget.
6. Call `resetTurnstile()` in each API call's `finally` block.

**Verification**:
- `npm run check` and `npm run lint` pass.
- Dev server runs without errors (no site key = Turnstile skipped).
- With test site key `1x00000000000000000000AA`, Turnstile widget renders and generates tokens.

**Commit**: "feat(frontend): integrate Turnstile widget on workshop page"

## Step 6: Deploy Script Update

**Files**: `scripts/deploy.sh`

1. Add `TURNSTILE_SITE_KEY` variable (reads from env, defaults to empty).
2. Pass `PUBLIC_TURNSTILE_SITE_KEY="$TURNSTILE_SITE_KEY"` in the frontend build step.
3. Add comment documenting the Turnstile keys setup.

**Verification**: Script parses without syntax errors (`bash -n scripts/deploy.sh`).

**Commit**: "chore(deploy): pass Turnstile site key to frontend build"

## Step 7: Verify Build

Run full frontend verification:
- `cd frontend && npm run check`
- `cd frontend && npm run lint`
- `cd frontend && npm run build`
- `cd worker && npx tsc --noEmit`

Fix any issues discovered.

## Testing Strategy

| Layer | Method | Notes |
|---|---|---|
| Worker Turnstile logic | Already tested via `verify-deploy.sh` when deployed | Existing function is correct |
| `turnstile.ts` types | TypeScript compilation | No runtime tests needed — thin wrapper around browser API |
| `client.ts` header injection | Manual verification in browser DevTools | Check `X-Turnstile-Token` header in network tab |
| E2E (Playwright) | Existing tests run with mock mode | Turnstile is bypassed in mock mode — no changes needed |
| Integration | Manual test with test site key | Set `PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA` and verify widget appears |

No new automated tests are needed because:
1. Turnstile is a browser-only API — can't test in Node/Playwright without mocking, which would test the mock not Turnstile.
2. The worker verification logic already exists and is tested in deploy verification.
3. The frontend integration is thin glue code connecting Turnstile's JS API to our fetch wrapper.
