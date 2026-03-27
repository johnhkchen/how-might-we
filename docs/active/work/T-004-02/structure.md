# Structure: T-004-02 cloudflare-worker-proxy

## Files Created

### `worker/package.json`
Minimal package manifest for the Worker project.
- `name`: `hmw-api-proxy`
- `scripts.deploy`: `wrangler deploy`
- `scripts.dev`: `wrangler dev`
- `devDependencies`: `wrangler`, `@cloudflare/workers-types`, `typescript`
- No runtime dependencies — Worker APIs are built into the runtime

### `worker/wrangler.toml`
Wrangler configuration.
- `name = "hmw-api-proxy"`
- `main = "src/index.ts"`
- `compatibility_date` set to a recent stable date
- `[vars]` section with `ALLOWED_ORIGIN = "*"` (configurable per environment)
- Secrets (`LAMBDA_URL`, `TURNSTILE_SECRET_KEY`) managed via `wrangler secret put`

### `worker/tsconfig.json`
TypeScript configuration targeting the Workers runtime.
- `types`: `["@cloudflare/workers-types"]`
- `target`: `"ES2022"`, `module`: `"ES2022"`, `moduleResolution`: `"bundler"`
- `strict`: `true`
- `noEmit`: `true` (wrangler handles compilation)

### `worker/src/index.ts`
The Worker entry point. Single file, ~150 lines. Organized as:

**Type: `Env` interface**
```typescript
interface Env {
  LAMBDA_URL: string;           // Lambda Function URL (secret)
  ALLOWED_ORIGIN: string;       // CORS origin (var, defaults to "*")
  TURNSTILE_SECRET_KEY?: string; // Turnstile secret (optional, future)
}
```

**Export: `default` handler object**
```typescript
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // 1. Handle CORS preflight (OPTIONS)
    // 2. Reject non-POST or non-/api/* paths
    // 3. Check rate limit
    // 4. (Future) Verify Turnstile token
    // 5. Proxy request to Lambda
    // 6. Return response with CORS headers
  }
}
```

**Function: `handleCors(request, env) → Response | null`**
- If OPTIONS, return 204 with CORS headers and stop
- Otherwise return null (continue to proxy)
- Headers: `Access-Control-Allow-Origin`, `Allow-Methods`, `Allow-Headers`, `Max-Age`

**Function: `checkRateLimit(ip: string) → boolean`**
- Module-level `Map<string, number[]>` for IP → timestamp arrays
- Sliding window: keep timestamps within last 60 seconds
- Returns `true` if under limit (10 requests/minute), `false` if exceeded
- Cleans up entries with empty timestamp arrays to prevent memory growth

**Function: `verifyTurnstile(token: string, env: Env) → Promise<boolean>`**
- If `TURNSTILE_SECRET_KEY` is not set, return `true` (skip verification)
- POST to `https://challenges.cloudflare.com/turnstile/v0/siteverify`
- Body: `{ secret, response: token }`
- Returns `result.success`

**Function: `proxyToLambda(request, env) → Promise<Response>`**
- Construct target URL: `env.LAMBDA_URL + new URL(request.url).pathname`
- Forward the request: `fetch(targetUrl, { method: request.method, headers: forwardHeaders, body: request.body })`
- Forward headers from client: `Content-Type` (strip `Host`, `cf-*` headers)
- Return `new Response(lambdaResponse.body, { status, headers: mergedHeaders })`
- Merged headers = Lambda response headers + CORS headers
- **No buffering** — `lambdaResponse.body` (ReadableStream) is passed directly

**Function: `addCorsHeaders(headers: Headers, env: Env) → Headers`**
- Clone headers, add CORS headers from env
- Used on both proxy responses and error responses

---

## Files Modified

### `package.json` (root)
Add convenience scripts:
- `"deploy:worker": "cd worker && npx wrangler deploy"`
- `"dev:worker": "cd worker && npx wrangler dev"`

### `CLAUDE.md`
Add worker commands to the Commands section:
```bash
# Worker (Cloudflare)
cd worker && npm install             # Install worker dependencies
cd worker && npx wrangler dev        # Local worker dev server
cd worker && npx wrangler deploy     # Deploy worker to Cloudflare
cd worker && npx wrangler secret put LAMBDA_URL  # Set Lambda URL secret
```

Add `worker/` to the Source Layout section.

---

## Files NOT Modified

- `backend/*` — No changes. Go CORS middleware stays for local dev.
- `frontend/*` — No changes. `PUBLIC_API_URL` already supports pointing to the Worker.
- `sst.config.ts` — No changes. Worker is deployed independently via wrangler.

---

## Module Boundaries

### Worker ↔ Frontend
- Frontend sets `PUBLIC_API_URL` to Worker URL in production
- Worker accepts POST requests on `/api/*` paths
- Worker returns SSE streams with CORS headers
- Contract: same API surface as the Lambda (POST /api/persona, /api/analyze, /api/expand, /api/refine)

### Worker ↔ Lambda
- Worker calls Lambda Function URL via `fetch()`
- Forwards request body and `Content-Type` header
- Passes through Lambda response body (ReadableStream) without buffering
- Worker does not interpret or transform the SSE payload

### Worker ↔ Cloudflare
- Deployed to Cloudflare's edge via `wrangler deploy`
- `LAMBDA_URL` stored as a wrangler secret (encrypted at rest)
- `ALLOWED_ORIGIN` stored as a wrangler variable (plaintext, configurable)
- Rate limit state lives in Worker isolate memory (per-isolate, not global)

---

## Request Flow (Production)

```
1. Browser POST /api/persona → CF Worker (edge)
2. Worker: OPTIONS? → return 204 with CORS headers
3. Worker: rate limit check → 429 if exceeded
4. Worker: Turnstile check → 403 if invalid (future)
5. Worker: fetch(LAMBDA_URL + "/api/persona", { body, headers })
6. Lambda: processes request, streams SSE via Function URL
7. Worker: return new Response(lambdaBody, { status, headers + CORS })
8. Browser: receives streaming SSE response
```

---

## Error Responses

All error responses from the Worker itself (not proxied Lambda errors):

| Condition | Status | Body |
|-----------|--------|------|
| Non-POST method (except OPTIONS) | 405 | `{ "error": "Method not allowed" }` |
| Path not starting with `/api/` | 404 | `{ "error": "Not found" }` |
| Rate limit exceeded | 429 | `{ "error": "Rate limit exceeded" }` |
| Turnstile verification failed | 403 | `{ "error": "Verification failed" }` |
| Lambda URL not configured | 502 | `{ "error": "Backend not configured" }` |
| Lambda fetch failed | 502 | `{ "error": "Backend unavailable" }` |

All error responses include CORS headers (so the frontend can read them).
