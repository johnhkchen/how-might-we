# Design: T-004-02 cloudflare-worker-proxy

## Decision Summary

Standalone Cloudflare Worker in a `worker/` directory, deployed via `wrangler deploy`, using in-memory rate limiting and pass-through streaming via `fetch()` + `Response` body piping.

---

## Option A: CF Pages Functions (edge middleware)

SvelteKit's `@sveltejs/adapter-cloudflare` supports a `functions/` directory that runs as CF Pages Functions. API routes could be defined there.

**Pros:**
- No separate deployment — ships with the frontend
- Same domain, no CORS issues between frontend and proxy
- Single `wrangler.toml` for everything

**Cons:**
- Couples proxy logic to the frontend deployment
- Pages Functions have different limits/behavior than standalone Workers
- Harder to test in isolation
- Muddies the SvelteKit adapter setup (adapter-cloudflare expects to own the Worker)
- Rate limiting state doesn't survive across Pages Function invocations

**Rejected:** Coupling the proxy to the frontend violates the architecture's separation of concerns and makes independent deployment impossible.

---

## Option B: SST Cloudflare Worker construct

Define the Worker in `sst.config.ts` using the Pulumi Cloudflare provider. SST v3 has `@pulumi/cloudflare` available.

**Pros:**
- Single IaC source for all infrastructure
- Can programmatically inject Lambda URL into Worker env
- Consistent deployment via `npx sst deploy`

**Cons:**
- SST's Cloudflare support is limited (v4 removed `sst.cloudflare.SvelteKit`)
- Requires Cloudflare API token in SST's provider config
- Adds complexity to the SST config for a simple Worker
- Debugging SST + Cloudflare provider issues is harder than standalone wrangler
- The spec says "deployable via `wrangler deploy`" — SST adds indirection

**Rejected:** Adds unnecessary coupling and complexity. Wrangler is the native, well-documented tool for Worker deployment. Lambda URL can be passed as a wrangler secret.

---

## Option C: Standalone Worker with `wrangler deploy` (Selected)

A `worker/` directory at the repo root containing a self-contained Worker project with its own `wrangler.toml`, `src/index.ts`, and minimal `package.json`.

**Pros:**
- Clean separation — Worker is its own deployable unit
- `wrangler deploy` is the standard CF workflow
- `wrangler dev` enables local testing of the Worker itself
- Lambda URL injected via `wrangler secret put LAMBDA_URL`
- Matches the acceptance criteria ("deployable via `wrangler deploy`")
- Minimal dependencies — Worker runtime has `fetch()`, `Request`, `Response` built in

**Cons:**
- Separate deployment step (not unified with `npx sst deploy`)
- Lambda URL must be manually set as a wrangler secret after each SST deploy

**Mitigations:**
- Root `package.json` gets a `deploy:worker` script for convenience
- Lambda URL rarely changes (only on fresh SST deploys or stage changes)

---

## Streaming Design

The Worker must pass SSE streams from Lambda to the client without buffering.

**Approach: Transparent fetch proxy**

```
Client request → Worker → fetch(LAMBDA_URL + path, { method, headers, body }) → Lambda
Lambda response (streaming) → Worker returns new Response(lambdaResponse.body, { headers })
```

- `fetch()` in Workers returns a `ReadableStream` body
- Returning that body directly in a `new Response()` streams it to the client
- No `TransformStream` needed — just pipe the body through
- SSE headers (`Content-Type: text/event-stream`, `Cache-Control: no-cache`) are forwarded from Lambda response
- Worker adds CORS headers on top

**Key detail**: Workers do NOT buffer `fetch()` responses by default when the body is streamed to the client. The Cloudflare edge streams chunks as they arrive from the origin.

---

## CORS Design

### Worker CORS Headers
```
Access-Control-Allow-Origin: <CF Pages domain or *>
Access-Control-Allow-Methods: POST, OPTIONS
Access-Control-Allow-Headers: Content-Type
Access-Control-Max-Age: 86400
```

- Origin will be configurable via env var (`ALLOWED_ORIGIN`)
- Defaults to `*` for development/staging flexibility
- OPTIONS preflight handled entirely by Worker — never reaches Lambda

### Go Backend CORS
- Keep existing `middleware.go` as-is for local development
- In production, Lambda only receives requests from the Worker (not browsers)
- No need to conditionally disable Go CORS — it's harmless overhead

---

## Rate Limiting Design

### Approach: In-memory Map with sliding window

```typescript
const rateLimits = new Map<string, number[]>();  // IP → array of timestamps
```

- On each request, check `cf-connecting-ip` header for client IP
- Push current timestamp, filter timestamps older than 60 seconds
- If count > 10, return 429 Too Many Requests
- Map lives in the Worker isolate's memory

**Why in-memory over Cache API:**
- Simpler to implement and test
- Good enough for prototype — rate limits are approximate anyway
- Workers reuse isolates across requests, so the Map persists for the isolate's lifetime
- The spec says "basic" — precise global rate limiting is T-005-03's job
- Cache API adds async overhead for every request

**Limitations:**
- Not shared across isolates/data centers (acceptable for basic limiting)
- Resets on redeploy (acceptable)
- Memory grows with unique IPs (mitigated by cleanup on each check)

---

## Turnstile Placeholder Design

- Add a code path that checks for a `cf-turnstile-response` header
- If `TURNSTILE_SECRET_KEY` env var is not set, skip verification entirely
- If set, verify token against Cloudflare's siteverify endpoint
- This allows T-005-02 to simply set the secret and add the frontend widget

---

## Worker Configuration

### `wrangler.toml`
```toml
name = "hmw-api-proxy"
main = "src/index.ts"
compatibility_date = "2024-09-23"

[vars]
ALLOWED_ORIGIN = "*"
```

### Secrets (set via `wrangler secret put`)
- `LAMBDA_URL` — Lambda Function URL from SST deploy output
- `TURNSTILE_SECRET_KEY` — (future) Turnstile verification secret

### Routes
- Worker responds to all paths — routes are determined by the request path
- Only `/api/*` paths are proxied to Lambda
- All other paths return 404

---

## File Layout

```
worker/
├── package.json           # Minimal: name, scripts, wrangler dev dep
├── wrangler.toml          # Worker config
├── tsconfig.json          # TypeScript config for Workers runtime
└── src/
    └── index.ts           # Worker entry point (~150 lines)
```

Single file for the Worker logic. No reason to split at this complexity level.

---

## What Won't Change

- `backend/middleware.go` — Keep as-is for local dev
- `backend/main.go` — No changes needed
- `frontend/vite.config.ts` — Dev proxy unchanged
- `frontend/src/lib/api/client.ts` — Already supports `PUBLIC_API_URL` env var
- `sst.config.ts` — No changes in this ticket (Worker is not SST-managed)
