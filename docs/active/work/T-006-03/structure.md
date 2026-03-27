# T-006-03 Structure: Lock Down CORS Origins

## Files Modified

### 1. `worker/src/index.ts`

**`corsHeaders()` function** (lines 100-108) — refactor to accept the request origin:

```
function corsHeaders(env: Env, requestOrigin: string | null): Record<string, string>
```

Logic:
- If `ALLOWED_ORIGIN` is `*`, return `Access-Control-Allow-Origin: *` (current behavior)
- If `requestOrigin` matches `ALLOWED_ORIGIN`, return `Access-Control-Allow-Origin: <requestOrigin>`
- If `requestOrigin` doesn't match (or is null), return empty object (no CORS headers)

Other CORS header fields (`Allow-Methods`, `Allow-Headers`, `Expose-Headers`, `Max-Age`) are only included when the origin matches.

**`jsonError()` function** (line 110) — update signature to pass request origin:
```
function jsonError(message: string, status: number, env: Env, requestOrigin: string | null, extra?: Record<string, string>): Response
```

**Main handler** (`fetch()`, line 176) — extract `Origin` header early, pass to all functions:
```ts
const requestOrigin = request.headers.get('Origin');
```

**OPTIONS handler** (line 178) — return CORS headers only for matching origins. If origin doesn't match and `ALLOWED_ORIGIN` is not `*`, return 403.

**`proxyToLambda()`** (line 135) — update to accept and pass requestOrigin for CORS header injection on proxied responses.

### 2. `worker/wrangler.toml`

Add a comment explaining the `*` default:
```toml
[vars]
# Default for local development (wrangler dev). In production, this is
# overridden by a wrangler secret set during deploy (see scripts/deploy.sh).
ALLOWED_ORIGIN = "*"
```

### 3. `sst.config.ts`

Change `url: true` to:
```ts
url: {
  cors: {
    allowOrigins: process.env.FRONTEND_URL
      ? [process.env.FRONTEND_URL]
      : ["*"],
    allowMethods: ["POST", "OPTIONS"],
    allowHeaders: ["Content-Type"],
  },
},
```

This restricts Lambda Function URL CORS to the frontend origin when `FRONTEND_URL` is set (production deploy), and falls back to `*` for local/dev.

### 4. `scripts/deploy.sh`

**New: Read FRONTEND_URL** — add after the stage parsing block (before Step 1):
```bash
FRONTEND_URL="${FRONTEND_URL:-}"
if [[ -z "$FRONTEND_URL" ]]; then
  echo "  ⚠ FRONTEND_URL not set. CORS will allow all origins."
fi
```

**Step 2 modification** — pass FRONTEND_URL to SST deploy:
```bash
FRONTEND_URL="$FRONTEND_URL" npx sst deploy --stage "$STAGE"
```

**New Step 3b** — set ALLOWED_ORIGIN secret on Worker (after LAMBDA_URL):
```bash
if [[ -n "$FRONTEND_URL" ]]; then
  echo "$FRONTEND_URL" | npx wrangler secret put ALLOWED_ORIGIN
fi
```

### 5. `scripts/verify-deploy.sh`

**New parameter**: Accept optional `FRONTEND_URL` as second argument.

**Test 1 update**: Split into two sub-tests:
- 1a: CORS preflight from the allowed origin → should get matching `Access-Control-Allow-Origin`
- 1b: CORS preflight from a disallowed origin (`https://evil.example.com`) → should NOT get matching `Access-Control-Allow-Origin`

If `FRONTEND_URL` isn't provided, skip the origin-specific tests and just check that CORS headers are present (backwards-compatible behavior).

## Files NOT Modified

| File | Reason |
|------|--------|
| `backend/middleware.go` | Already correct — local dev uses `*`, Lambda skips |
| `backend/main.go` | No CORS logic |
| `frontend/*` | No CORS config on client side |
| `worker/package.json` | No new dependencies |

## Module Boundaries

- **Worker**: Sole owner of browser-facing CORS enforcement in production
- **SST config**: Owns Lambda Function URL CORS (defense-in-depth)
- **Deploy script**: Owns secret/env injection (single source of truth from Doppler/env)
- **Go middleware**: Owns local dev CORS only

## Ordering

1. `worker/src/index.ts` — core CORS logic change (can be tested with `wrangler dev`)
2. `worker/wrangler.toml` — documentation comment (no functional change)
3. `sst.config.ts` — Lambda CORS restriction
4. `scripts/deploy.sh` — deploy-time secret injection
5. `scripts/verify-deploy.sh` — updated verification tests
