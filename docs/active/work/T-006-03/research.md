# T-006-03 Research: Lock Down CORS Origins

## Problem Statement

Both the Lambda Function URL and the CF Worker proxy currently allow `*` (all) origins for CORS. In production, only the CF Pages domain should be permitted.

## Current CORS Architecture

### Three CORS layers exist in the stack

1. **Go backend middleware** (`backend/middleware.go:8-27`)
   - Sets `Access-Control-Allow-Origin: *` for local development
   - **On Lambda**: skips entirely (`AWS_LAMBDA_RUNTIME_API` check at line 11) — delegates to Lambda Function URL CORS
   - Handles OPTIONS preflight locally, returns 204

2. **Lambda Function URL CORS** (`sst.config.ts:29`)
   - `url: true` → SST defaults: `allowHeaders: ["*"], allowMethods: ["*"], allowOrigins: ["*"]`
   - Configured in `.sst/platform/src/components/aws/function.ts:1963-1967`
   - SST supports `url: { cors: { allowOrigins: [...] } }` to restrict
   - This is AWS-level CORS — set on the Function URL resource itself

3. **CF Worker proxy** (`worker/src/index.ts:100-108`)
   - `corsHeaders()` uses `env.ALLOWED_ORIGIN || '*'`
   - `ALLOWED_ORIGIN` set to `"*"` in `wrangler.toml:6`
   - Applied to: OPTIONS preflight (line 179), all error responses (line 110-119), proxied responses (line 159)

### Production request flow

```
Browser (CF Pages) → CF Worker → Lambda Function URL → Go handler
```

- **Browser ↔ Worker**: CORS matters here. The Worker's `Access-Control-Allow-Origin` header determines if the browser accepts the response.
- **Worker → Lambda**: Server-to-server fetch. CORS headers on the Lambda response are present but ignored by the Worker (it overwrites them at line 159).
- Lambda Function URL CORS only matters if a browser directly hits the Lambda URL (bypassing the Worker).

### Local dev request flow

```
Browser (localhost:5173) → Vite proxy → Go server (localhost:8080)
```

- Vite proxies `/api/*` to `:8080` (same-origin from browser perspective)
- Go middleware adds `Access-Control-Allow-Origin: *` for direct access
- Worker is not involved locally

## Relevant Configuration Points

### Worker ALLOWED_ORIGIN (`worker/wrangler.toml`)

```toml
[vars]
ALLOWED_ORIGIN = "*"
```

- `[vars]` values are public, non-secret configuration
- Wrangler secrets (set via `wrangler secret put`) override `[vars]` at runtime
- The deploy script already uses `wrangler secret put` for `LAMBDA_URL` (line 61)

### SST Function URL config (`sst.config.ts:23-38`)

```ts
url: true,  // → defaults to allowOrigins: ["*"]
```

Can be changed to:
```ts
url: {
  cors: {
    allowOrigins: ["https://hmw-workshop.pages.dev"]
  }
}
```

### Doppler secrets

The ticket states `FRONTEND_URL` is already stored in Doppler. This can be read at deploy time via `doppler run` or `doppler secrets get FRONTEND_URL --plain`.

### Deploy script (`scripts/deploy.sh`)

- Step 2: Deploys Lambda via SST
- Step 3: Sets `LAMBDA_URL` secret on Worker
- Step 4: Deploys Worker
- Step 5-6: Builds and deploys frontend to CF Pages

The CF Pages URL is extracted at step 6 — after Lambda and Worker are already deployed. So FRONTEND_URL must be known ahead of time (from Doppler) rather than extracted from deploy output.

### Verify script (`scripts/verify-deploy.sh`)

- Test 1 (lines 30-58): Tests CORS preflight from `Origin: https://example.com`
- After CORS lockdown, this test will still get 204 but the `Access-Control-Allow-Origin` header won't match `example.com`, which is the correct behavior
- The test currently only checks for header *presence*, not header *value*

## Key Constraints

1. **Local dev must keep working** — Go middleware uses `*` only locally; Vite proxy makes CORS irrelevant for normal dev
2. **`wrangler dev` must keep working** — `wrangler.toml` `ALLOWED_ORIGIN = "*"` is used for local Worker testing; secrets override at runtime in production
3. **The CF Pages URL is stable** — CF Pages projects get a `<project-name>.pages.dev` domain; for this project it's likely `hmw-workshop.pages.dev`
4. **Lambda CORS is defense-in-depth** — since the Worker overwrites Lambda's CORS headers, Lambda CORS only matters for direct Lambda URL access

## Files to Modify

| File | Role | Change needed |
|------|------|---------------|
| `worker/wrangler.toml` | Worker config | Document that `ALLOWED_ORIGIN` default is for dev only |
| `worker/src/index.ts` | Worker entry | Add origin validation (reject mismatched Origin headers when not `*`) |
| `sst.config.ts` | Lambda infra | Restrict `url.cors.allowOrigins` |
| `scripts/deploy.sh` | Deploy orchestration | Set `ALLOWED_ORIGIN` secret on Worker |
| `scripts/verify-deploy.sh` | Post-deploy tests | Update CORS test to verify origin restriction |

## Files NOT to Modify

| File | Reason |
|------|--------|
| `backend/middleware.go` | Already correct: uses `*` only locally, skips on Lambda |
| `frontend/src/lib/api/client.ts` | No CORS config here — browser handles CORS automatically |
| `frontend/vite.config.ts` | Proxy config is for dev only, unaffected |
