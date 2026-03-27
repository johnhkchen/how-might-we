# T-005-02 Review: Turnstile Bot Protection

## Summary

Added Cloudflare Turnstile bot protection to the HMW Workshop. The frontend embeds an invisible Turnstile widget that generates tokens, which are sent with every API request via the `X-Turnstile-Token` header. The Cloudflare Worker verifies tokens before proxying to Lambda.

The system is designed to be **opt-in**: when no site key is configured (dev, mock mode), Turnstile is completely disabled — no script interaction, no headers sent, no verification on the worker.

## Files Changed

### New Files

| File | Purpose |
|---|---|
| `frontend/src/lib/utils/turnstile.ts` | Turnstile token lifecycle manager — init, get/wait for token, reset, destroy |

### Modified Files

| File | Change |
|---|---|
| `worker/src/index.ts` | CORS `Allow-Headers` now includes `X-Turnstile-Token`; token read from `X-Turnstile-Token` header (was `cf-turnstile-response`) |
| `frontend/src/app.html` | Loads Turnstile script (`?render=explicit`, async/defer) |
| `frontend/src/lib/api/client.ts` | `apiFetch` refactored from const to async function; injects `X-Turnstile-Token` header when token available |
| `frontend/src/routes/workshop/+page.svelte` | Turnstile widget lifecycle: init on mount, destroy on unmount, reset after each API call |
| `frontend/.env` | Added `PUBLIC_TURNSTILE_SITE_KEY` (empty default) |
| `scripts/deploy.sh` | Passes `PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SITE_KEY` env var to frontend build |

## Acceptance Criteria Coverage

| Criterion | Status | Notes |
|---|---|---|
| Turnstile widget embedded on workshop page (invisible or managed mode) | Done | Invisible mode, explicit rendering via `turnstile.render()` |
| Token sent with each API request in `X-Turnstile-Token` header | Done | Injected by `apiFetch` wrapper in `client.ts` |
| Worker verifies token via Turnstile siteverify API before proxying | Done | Pre-existing `verifyTurnstile()` function; header name aligned |
| Invalid/missing tokens return 403 | Done | Pre-existing guard in worker; activated when `TURNSTILE_SECRET_KEY` is set |
| Turnstile site key configurable via environment variable | Done | `PUBLIC_TURNSTILE_SITE_KEY` in frontend, `TURNSTILE_SECRET_KEY` as wrangler secret |

## Test Coverage

| What | How | Status |
|---|---|---|
| TypeScript correctness | `npm run check` — 0 errors, 0 warnings | Pass |
| Lint | `npm run lint` — clean | Pass |
| Production build | `npm run build` — succeeds | Pass |
| Worker compilation | `npx tsc --noEmit` — clean | Pass |
| Deploy script syntax | `bash -n deploy.sh` — valid | Pass |
| E2E (Playwright) | Mock mode bypasses Turnstile entirely | Unaffected |

### Test Gaps

1. **No automated Turnstile integration test.** Turnstile requires a real browser and Cloudflare's challenge infrastructure. Testing with Cloudflare's always-pass test keys (`1x00000000000000000000AA` site key, `1x0000000000000000000000000000000AA` secret key) would validate the header flow end-to-end but requires a running worker. This is best verified during deploy with `verify-deploy.sh` (after setting test keys).

2. **No unit test for `turnstile.ts`.** The module is a thin wrapper around `window.turnstile` — testing it would mean mocking the Turnstile API, which tests the mock not the integration. Deliberately omitted.

3. **`apiFetch` signature change.** Changed from `typeof fetch` constant to async function. All callers in the codebase (`stream.ts`) already call it as `await apiFetch(...)`, so this is backwards-compatible. Verified via TypeScript check.

## Open Concerns

1. **Token timing on rapid calls.** If a user could somehow trigger two API calls within ~200ms (faster than Turnstile generates a new token), the second call would lack a token. This is currently mitigated by UI gating — each API call button is disabled while streaming. However, `waitForToken()` is exported for future use if needed.

2. **Turnstile script load failure.** If `challenges.cloudflare.com` is unreachable (e.g., content blocker, network issue), `window.turnstile` will be undefined, `initTurnstile()` will log a warning and no-op, and all API calls will proceed without a token. If the worker has Turnstile enforcement enabled, users will get 403 errors with no clear feedback. A future enhancement could detect this and show a user-facing message.

3. **Deploy verification compatibility.** `scripts/verify-deploy.sh` sends API requests without Turnstile tokens. When Turnstile is enabled on the worker, these tests will return 403. The recommended workflow: deploy with Turnstile disabled for verification, then enable by setting `TURNSTILE_SECRET_KEY` via `wrangler secret put`. Alternatively, use Cloudflare's always-pass test keys for the verification step.

4. **No `onDestroy` in Svelte 5 SSR.** `onDestroy` only runs client-side in SvelteKit, which is correct for our use case (Turnstile is browser-only). No issue, just noting for clarity.

## Architecture Notes

The design keeps Turnstile completely out of the backend (Go/Lambda) — it's handled entirely by the worker proxy and frontend. This means:
- Backend remains stateless and unaware of bot protection
- Turnstile can be enabled/disabled independently via worker secrets
- No backend deployment needed to toggle bot protection
