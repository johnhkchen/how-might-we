# T-005-02 Design: Turnstile Bot Protection

## Decision Summary

Use Turnstile in **invisible mode** with **explicit JS rendering**. Manage token lifecycle via a Svelte utility module. Inject the token header at the `apiFetch` layer so all API calls automatically include it.

## Option A: Implicit Widget Rendering (Rejected)

Drop a `<div class="cf-turnstile" data-sitekey="...">` into the page. Turnstile auto-renders and stores the token in a hidden input.

**Pros**: Minimal JS. Standard Turnstile pattern.
**Cons**: Token is single-use. After one API call consumes it, subsequent calls have no token. No way to programmatically reset without explicit rendering. Requires polling the DOM for the token value. Doesn't fit a SPA that makes multiple sequential API calls.

**Rejected**: Token lifecycle requires programmatic control.

## Option B: Explicit Rendering with Per-Request Reset (Rejected)

Call `turnstile.render()` once. Before each API call, call `turnstile.reset()` to get a fresh token. Wait for the callback before sending the request.

**Pros**: Clean programmatic control. Each request gets a fresh token.
**Cons**: `turnstile.reset()` is async — adds latency before every API call (Turnstile challenge takes 100–500ms). Four API calls means 4 extra round-trips to Turnstile. UX degradation.

**Rejected**: Per-request latency is unacceptable for streaming UX.

## Option C: Explicit Rendering with Pre-Fetched Token (Chosen)

Render Turnstile once on page load. Store the token. Send it with the next API call. After the API call starts, immediately reset Turnstile to pre-fetch the next token. Token is always ready when the user triggers the next action.

### How It Works

1. Page mounts → `turnstile.render()` with invisible mode and a callback.
2. Callback stores token in a module-level variable.
3. When `apiFetch` is called, it reads the current token and attaches it as a header.
4. After the fetch call is initiated, the caller resets Turnstile to pre-fetch the next token.
5. By the time the user triggers the next API call (typically seconds later), a fresh token is ready.

**Pros**: Zero added latency on API calls. Token is always pre-fetched. Simple lifecycle.
**Cons**: If user triggers two API calls in rapid succession (< 500ms), second call might not have a token yet. Mitigated by: (a) the UI naturally gates actions behind streaming completion, and (b) a fallback that waits for the token if needed.

### Token Staleness

Turnstile tokens expire after 300 seconds (5 minutes). A user idle for > 5 minutes would have a stale token. Mitigation: refresh the token on a 4-minute interval, or refresh on user interaction before the API call. Since the widget auto-refreshes when reset, and user actions are spaced out, this is a minor concern. Implementing a 4-minute auto-refresh timer is cheap insurance.

## Header Name Decision

Use **`X-Turnstile-Token`** as specified in the acceptance criteria. Update the worker to read this header instead of `cf-turnstile-response`.

Rationale: `X-Turnstile-Token` is more descriptive and aligns with the AC. `cf-turnstile-response` is a convention when Turnstile is natively integrated (e.g., CF Access), but we're doing custom integration.

## Architecture

```
┌─────────────────────────────────────────────────┐
│ Frontend (SvelteKit)                            │
│                                                 │
│  app.html ── loads turnstile/v0/api.js          │
│                                                 │
│  lib/utils/turnstile.ts ── token lifecycle      │
│    - render(siteKey, container) → widget ID     │
│    - getToken() → string | null                 │
│    - reset() → void                             │
│    - TOKEN_HEADER_NAME constant                 │
│                                                 │
│  lib/api/client.ts ── injects header            │
│    - apiFetch wraps fetch, adds X-Turnstile-... │
│                                                 │
│  workshop/+page.svelte                          │
│    - Renders invisible Turnstile container      │
│    - Calls reset() after each API call          │
└───────────────────────┬─────────────────────────┘
                        │ X-Turnstile-Token header
                        ▼
┌─────────────────────────────────────────────────┐
│ Worker (CF Worker)                              │
│  - Reads X-Turnstile-Token header               │
│  - Calls siteverify API                         │
│  - 403 if invalid/missing                       │
│  - CORS allows X-Turnstile-Token header         │
└─────────────────────────────────────────────────┘
```

## Graceful Degradation

- **No site key configured** (`PUBLIC_TURNSTILE_SITE_KEY` empty/unset): Frontend skips Turnstile entirely. No script loaded, no widget rendered, no header sent. Worker without `TURNSTILE_SECRET_KEY` skips verification. This is the dev/mock mode path.
- **Turnstile script fails to load**: `getToken()` returns null. API calls proceed without the header. If the worker has Turnstile enforcement on, they'll get 403. This is acceptable — if Turnstile is unreachable, something is very wrong.
- **Token not ready**: If `getToken()` returns null when a call is about to be made (e.g., rapid successive calls), wait up to 3 seconds for the token callback. If it doesn't arrive, proceed without it (will 403 if enforcement is on).

## Testing Strategy

- **E2E tests**: Run with mock mode. Turnstile is irrelevant (mockFetch bypasses network).
- **Worker tests**: Can test Turnstile verification logic with Cloudflare's test keys:
  - Site key `1x00000000000000000000AA` — always passes
  - Secret key `1x0000000000000000000000000000000AA` — always passes
- **Deploy verification**: `verify-deploy.sh` should use the always-pass test secret, or document that Turnstile must be disabled for verification.
- **Manual testing**: Set test site key in `.env` for local development with Turnstile enabled.

## Scope Boundaries

**In scope**: Frontend widget + token lifecycle, API client header injection, worker header alignment + CORS, env var configuration, deploy script update.

**Out of scope**: Rate limiting changes (already exists), backend changes (none needed), Turnstile analytics/reporting, custom challenge pages.
