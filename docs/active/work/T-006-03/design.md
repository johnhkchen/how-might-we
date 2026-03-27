# T-006-03 Design: Lock Down CORS Origins

## Decision Summary

Use `FRONTEND_URL` from Doppler as the single source of truth for the allowed origin. Inject it into both the Worker (via wrangler secret) and Lambda Function URL (via SST environment variable) at deploy time. Add active origin validation in the Worker. Keep `*` defaults for local development.

## Options Evaluated

### Option A: Hard-code the CF Pages URL everywhere

Set `allowOrigins: ["https://hmw-workshop.pages.dev"]` directly in `sst.config.ts` and `wrangler.toml`.

- **Pro**: Simple, no deploy-time configuration
- **Pro**: Works immediately, no Doppler dependency at deploy time
- **Con**: Duplicates the URL in multiple files
- **Con**: Can't easily change for custom domains or staging environments
- **Con**: `wrangler.toml` vars are public — not a security issue, but the value would diverge from Doppler's FRONTEND_URL

### Option B: Single source of truth from Doppler (chosen)

Read `FRONTEND_URL` from Doppler and inject it at deploy time:
- Worker: `wrangler secret put ALLOWED_ORIGIN`
- Lambda: Pass as env var to `npx sst deploy` or as SST secret

- **Pro**: Single source of truth — change Doppler, redeploy, done
- **Pro**: Works for staging/custom domains without code changes
- **Pro**: Wrangler secrets override `[vars]`, so local dev stays on `*`
- **Con**: Slightly more complex deploy script
- **Con**: Requires Doppler access at deploy time (already required for other secrets)

### Option C: Extract CF Pages URL from deploy output

Deploy Pages first, capture the URL, then redeploy Lambda/Worker with it.

- **Pro**: Always matches actual deployment
- **Con**: Requires reordering deploy steps (Pages before Lambda)
- **Con**: Two Lambda deploys per full deploy (wasteful)
- **Con**: The Pages URL is already known — it's a fixed `<project>.pages.dev`

## Chosen: Option B

The FRONTEND_URL is already in Doppler, and the deploy script already reads Doppler for other configuration. Adding one more secret injection is trivial and maintains the existing pattern.

## Design Decisions

### 1. Worker origin validation

**Current behavior**: Worker always returns `Access-Control-Allow-Origin: <ALLOWED_ORIGIN>` regardless of the request's `Origin` header. This means even if `ALLOWED_ORIGIN` is set correctly, the header is returned unconditionally.

**New behavior**: When `ALLOWED_ORIGIN` is not `*`, the Worker validates the request's `Origin` header:
- If `Origin` matches `ALLOWED_ORIGIN` → return CORS headers with the specific origin
- If `Origin` is present but doesn't match → return 403 with no CORS headers
- If no `Origin` header (server-to-server, curl) → allow the request but don't set CORS headers

This is defense-in-depth beyond what CORS provides natively. CORS is browser-enforced, but active rejection prevents the response body from being readable even via CORS-ignoring clients.

**Exception**: OPTIONS preflight always returns CORS headers — browsers need them to decide whether to send the actual request.

Wait — actually, rejecting non-matching origins on non-OPTIONS is too aggressive. It would break:
- Health checks from monitoring tools
- The verify-deploy.sh script (which sends `Origin: https://example.com` in CORS test but no Origin for other tests)

**Revised approach**:
- **OPTIONS**: Return CORS headers only if origin matches (or ALLOWED_ORIGIN is `*`). Return 403 if origin doesn't match.
- **POST**: Always proxy the request. Set CORS headers only if origin matches. If origin doesn't match, the response won't have CORS headers and the browser will block it. Non-browser clients still work.

This is exactly how standard CORS servers work: the origin validation controls headers, not access.

### 2. Lambda Function URL CORS

Change `url: true` to `url: { cors: { allowOrigins: [frontendUrl] } }` in `sst.config.ts`.

The `FRONTEND_URL` will be passed as an environment variable to the SST deploy command. SST config runs as TypeScript, so `process.env.FRONTEND_URL` is available.

For local/CI where `FRONTEND_URL` isn't set, fall back to `["*"]`.

### 3. Deploy script changes

Add after the existing LAMBDA_URL secret step:
```bash
FRONTEND_URL=$(doppler secrets get FRONTEND_URL --plain -p hmw-workshop -c prd 2>/dev/null || echo "")
echo "$FRONTEND_URL" | npx wrangler secret put ALLOWED_ORIGIN
```

Also pass `FRONTEND_URL` to the SST deploy command:
```bash
FRONTEND_URL="$FRONTEND_URL" npx sst deploy --stage "$STAGE"
```

### 4. Verify script updates

The CORS preflight test currently uses `Origin: https://example.com`. After lockdown, this origin won't match. Two options:
1. Accept the CORS test with the production origin passed as an argument
2. Test that non-matching origins get rejected

**Choice**: Do both. Add a `FRONTEND_URL` parameter (optional, defaults to checking rejection behavior). Test that the correct origin gets CORS headers and an incorrect origin does not.

### 5. Documentation

Add a comment block in `deploy.sh` explaining how to add additional origins. Also add a comment in `wrangler.toml` explaining the `*` default is for local dev only.

## What's NOT Changing

- `backend/middleware.go` — local dev CORS is fine as-is
- Frontend code — no CORS config on the client side
- Vite proxy config — dev-only, unaffected
- Rate limiting — orthogonal to CORS
- Turnstile — orthogonal to CORS
