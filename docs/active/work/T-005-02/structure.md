# T-005-02 Structure: Turnstile Bot Protection

## File Changes

### New Files

#### `frontend/src/lib/utils/turnstile.ts`

Turnstile token lifecycle manager. Encapsulates all interaction with the Turnstile JS API.

```
Exports:
  TOKEN_HEADER = 'X-Turnstile-Token'
  initTurnstile(siteKey: string, container: HTMLElement): void
  getToken(): string | null
  resetTurnstile(): void
  destroy(): void

Internal state:
  let currentToken: string | null = null
  let widgetId: string | null = null
  let resolveWaiter: ((token: string) => void) | null = null

Behavior:
  - initTurnstile(): Calls window.turnstile.render() with invisible mode.
    Callback sets currentToken and resolves any pending waiter.
  - getToken(): Returns currentToken (may be null).
  - waitForToken(timeoutMs): Returns a promise that resolves when token
    is available or rejects on timeout.
  - resetTurnstile(): Sets currentToken = null, calls turnstile.reset(widgetId).
  - destroy(): Calls turnstile.remove(widgetId), clears state.
```

Global type declaration for `window.turnstile` API (inline or separate `.d.ts`):
```ts
interface TurnstileAPI {
  render(container: string | HTMLElement, options: TurnstileOptions): string;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
}
interface TurnstileOptions {
  sitekey: string;
  callback: (token: string) => void;
  'expired-callback'?: () => void;
  'error-callback'?: () => void;
  size?: 'invisible' | 'normal' | 'compact';
}
declare global {
  interface Window { turnstile?: TurnstileAPI; }
}
```

### Modified Files

#### `frontend/src/app.html`

Add Turnstile script tag (conditionally — always load, but the JS module will no-op if no site key):

```html
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" async defer></script>
```

Load with `?render=explicit` so it doesn't auto-scan for `.cf-turnstile` divs. The `async defer` attributes ensure it doesn't block page load.

#### `frontend/src/lib/api/client.ts`

Modify `apiFetch` to inject the Turnstile token header.

Current: `apiFetch` is assigned once at module load (either `fetch` or `mockFetch`).

New: Wrap the chosen fetch in a function that adds the `X-Turnstile-Token` header from `getToken()`.

```
Before:
  export const apiFetch = getApiFetch();

After:
  const baseFetch = getApiFetch();

  export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const token = getToken();
    if (token && init?.headers) {
      const headers = new Headers(init.headers);
      headers.set(TOKEN_HEADER, token);
      return baseFetch(input, { ...init, headers });
    }
    return baseFetch(input, init);
  }
```

Import `getToken` and `TOKEN_HEADER` from `../utils/turnstile`.

Note: `apiFetch` changes from a `typeof fetch` constant to an async function with the same signature. Callers (`stream.ts`) already call it as a function — no caller changes needed.

#### `frontend/src/routes/workshop/+page.svelte`

Add Turnstile widget initialization and lifecycle management.

Changes:
1. Import `{ initTurnstile, resetTurnstile, destroy }` from `$lib/utils/turnstile`.
2. Import `PUBLIC_TURNSTILE_SITE_KEY` from `$env/static/public`.
3. Add a hidden `<div>` for the Turnstile widget container.
4. On mount (`onMount`): if site key is set, call `initTurnstile(siteKey, container)`.
5. On destroy (`onDestroy`): call `destroy()`.
6. After each `streamFromAPI()` call completes (in finally blocks): call `resetTurnstile()`.

The hidden div sits at the bottom of the page, invisible to the user:
```html
<div bind:this={turnstileContainer} style="display:none"></div>
```

Actually, for invisible mode, Turnstile may need the container to be in the DOM but doesn't need it visible. `display:none` may interfere. Use a positioned-off-screen approach or just let it render naturally (invisible mode produces no visible UI).

#### `frontend/.env`

Add:
```
PUBLIC_TURNSTILE_SITE_KEY=
```

Empty by default (disables Turnstile in dev). Set to the real site key for production builds.

#### `worker/src/index.ts`

Two changes:

1. **CORS headers** — Add `X-Turnstile-Token` to `Access-Control-Allow-Headers`:
```
'Access-Control-Allow-Headers': 'Content-Type, X-Turnstile-Token',
```

2. **Header name** — Change `cf-turnstile-response` to `X-Turnstile-Token`:
```ts
const token = request.headers.get('X-Turnstile-Token') || '';
```

#### `scripts/deploy.sh`

Add `PUBLIC_TURNSTILE_SITE_KEY` to the frontend build step. The site key should be passed as an environment variable:

```bash
# Step 5: Build frontend
PUBLIC_API_URL="$WORKER_URL" PUBLIC_TURNSTILE_SITE_KEY="$TURNSTILE_SITE_KEY" npm run build
```

Add a variable at the top that reads from env or prompts:
```bash
TURNSTILE_SITE_KEY="${TURNSTILE_SITE_KEY:-}"
```

#### `scripts/verify-deploy.sh`

Document at the top that verification requires either:
- Turnstile disabled (`TURNSTILE_SECRET_KEY` not set on worker), or
- Using Cloudflare's always-pass test keys

No code changes needed — the tests already work when Turnstile is disabled (no secret key = skip verification in worker).

## Component Boundaries

```
turnstile.ts  ←  Pure utility, no framework dependency. Manages window.turnstile API.
     ↑
client.ts     ←  Imports getToken() to inject header. No Turnstile awareness beyond that.
     ↑
stream.ts     ←  Unchanged. Uses apiFetch which now auto-injects the header.
     ↑
+page.svelte  ←  Owns widget lifecycle (init on mount, reset after calls, destroy on unmount).
```

## Ordering

1. Worker CORS + header name alignment (no frontend dependency).
2. `turnstile.ts` utility (no dependency on other changes).
3. `app.html` script tag (no dependency).
4. `client.ts` header injection (depends on turnstile.ts).
5. `+page.svelte` widget lifecycle (depends on turnstile.ts).
6. `.env` + deploy script updates (config, no code dependency).

Steps 1–3 can be done in parallel. Step 4 depends on 2. Step 5 depends on 2.
