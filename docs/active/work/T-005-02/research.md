# T-005-02 Research: Turnstile Bot Protection

## Worker — Current State

File: `worker/src/index.ts`

The worker already has significant Turnstile infrastructure in place:

1. **Env interface** (line 1–5): Declares `TURNSTILE_SECRET_KEY?: string` as optional.
2. **`verifyTurnstile()` function** (line 64–72): Calls Cloudflare's `https://challenges.cloudflare.com/turnstile/v0/siteverify` with `{ secret, response: token }`. Returns `result.success` boolean.
3. **Guard clause** (line 138–143): Checks `env.TURNSTILE_SECRET_KEY`; if set, reads `cf-turnstile-response` header from the incoming request. Returns 403 if token missing or verification fails. If the env var is unset, Turnstile is skipped entirely.

### Gaps in Worker

- **CORS Allow-Headers** (line 49): Currently only allows `Content-Type`. The Turnstile token header is not listed. Preflight requests sending a custom header will fail with CORS errors in browsers.
- **Header name**: Worker reads `cf-turnstile-response`. Acceptance criteria suggest `X-Turnstile-Token`. Need to pick one. `cf-turnstile-response` is a Cloudflare convention; `X-Turnstile-Token` is more explicit. Either works — just must be consistent between frontend and worker.

## Frontend — Current State

### API Client (`frontend/src/lib/api/client.ts`)

- Exports `apiFetch` — either real `fetch` or `mockFetch` depending on `VITE_MOCK_API`.
- Exports `apiUrl()` — prepends `PUBLIC_API_URL` (empty in dev, worker URL in production).
- No mechanism to inject extra headers into requests.

### Stream Client (`frontend/src/lib/api/stream.ts`)

- `streamFromAPI()` calls `apiFetch(apiUrl(endpoint), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })`.
- Headers are hardcoded inline — no hook for adding Turnstile token.

### Workshop Page (`frontend/src/routes/workshop/+page.svelte`)

- Calls `streamFromAPI()` for all 4 endpoints: `/api/persona`, `/api/analyze`, `/api/expand`, `/api/refine`.
- No Turnstile widget rendered anywhere.

### HTML Shell (`frontend/src/app.html`)

- Standard SvelteKit shell. No external scripts loaded.

### Environment Variables

- `frontend/.env`: Only `PUBLIC_API_URL` defined (empty for dev).
- SvelteKit convention: public env vars use `PUBLIC_` prefix, exposed via `$env/static/public`.

### Mock Mode (`frontend/src/lib/api/mock.ts`)

- When `VITE_MOCK_API=true`, `mockFetch` intercepts API calls and returns fixture data.
- Mock mode never hits the worker, so Turnstile is irrelevant there.

## Turnstile Integration Points

### Cloudflare Turnstile Flow

1. Frontend loads `https://challenges.cloudflare.com/turnstile/v0/api.js`.
2. Frontend renders `<div class="cf-turnstile" data-sitekey="...">` or calls `turnstile.render()`.
3. Turnstile runs invisible challenge, produces a one-time-use token string.
4. Frontend sends token to backend with each request.
5. Backend (worker) calls siteverify to validate token.
6. Token is single-use — must be refreshed after each verification.

### Key Considerations

- **Token is single-use**: Each API call consumes the token. A workshop session makes 4+ API calls. The widget must re-generate tokens. Turnstile supports explicit rendering with a callback, and `turnstile.reset()` to regenerate.
- **Invisible vs managed mode**: Invisible mode is best UX — user never sees a widget. Falls back to managed (visible challenge) only if Turnstile detects suspicious behavior.
- **Dev mode**: Vite proxies `/api/*` to `localhost:8080` (Go backend directly). No worker in the loop means no Turnstile needed. The frontend should skip Turnstile when `PUBLIC_TURNSTILE_SITE_KEY` is not set.
- **Mock mode**: `mockFetch` intercepts before any real network call. Turnstile irrelevant.

## Configuration Requirements

| Variable | Layer | Purpose |
|---|---|---|
| `PUBLIC_TURNSTILE_SITE_KEY` | Frontend (.env / build arg) | Turnstile widget site key |
| `TURNSTILE_SECRET_KEY` | Worker (wrangler secret) | Siteverify API secret |

Both already follow existing patterns:
- Frontend uses `PUBLIC_*` env vars via `$env/static/public`.
- Worker uses wrangler secrets (same pattern as `LAMBDA_URL`).

## Deploy Script

`scripts/deploy.sh` — 6-step deploy. No step for setting Turnstile secrets. The `TURNSTILE_SECRET_KEY` would be set once via `wrangler secret put` (same as `LAMBDA_URL`). The `PUBLIC_TURNSTILE_SITE_KEY` needs to be available at frontend build time (step 5).

## Verification Script

`scripts/verify-deploy.sh` — Tests don't send Turnstile tokens. If Turnstile is active, tests 2/3/4/5 will fail with 403. Either:
- Tests need to obtain a Turnstile token (not practical — requires browser), or
- Verification tests run before Turnstile secret is set, or
- Add a bypass mechanism for testing (not recommended for security).

This is an existing concern — the deploy script docs should note that verification tests require Turnstile to be disabled or a test key to be used. Cloudflare provides test site keys that always pass/fail.

## Files to Modify

| File | Change |
|---|---|
| `worker/src/index.ts` | Update CORS allow-headers, align header name |
| `frontend/src/app.html` | Load Turnstile script |
| `frontend/src/lib/api/client.ts` | Add Turnstile token header injection |
| `frontend/src/routes/workshop/+page.svelte` | Render Turnstile widget, manage token lifecycle |
| `frontend/.env` | Add `PUBLIC_TURNSTILE_SITE_KEY` |
| `worker/wrangler.toml` | (No change — secret set via CLI) |
| `scripts/deploy.sh` | Add step for `PUBLIC_TURNSTILE_SITE_KEY` at build time |
| `scripts/verify-deploy.sh` | Document Turnstile test key usage or adjust |

## Files NOT to Modify

- `backend/` — Backend (Go/Lambda) never sees or validates Turnstile. The worker handles it before proxying.
- `frontend/src/lib/api/stream.ts` — Headers should be injected at the `apiFetch` layer, not here.
- `frontend/src/lib/api/mock.ts` — Mock mode bypasses real fetch entirely.
