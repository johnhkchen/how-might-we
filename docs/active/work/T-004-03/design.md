# Design: T-004-03 deploy-e2e-verification

## Decision 1: Frontend Deployment Method

### Options

**A. `wrangler pages deploy` (CLI)**
- Build locally with `PUBLIC_API_URL` set, then deploy output directory.
- Pros: simple, no dashboard setup, scriptable, aligns with Worker's CLI deploy model.
- Cons: requires local build with correct env var, no automatic git-triggered rebuilds.

**B. CF Dashboard (git-linked Pages project)**
- Connect repo to CF Pages, set build command and env vars in dashboard.
- Pros: automatic deploys on push, preview deploys per branch.
- Cons: requires manual dashboard setup, ties deployment to git pushes (less control),
  adds a dependency on CF dashboard state that isn't captured in code.

**C. SST `sst.cloudflare.StaticSite`**
- Use SST construct to manage CF Pages deployment.
- Pros: infrastructure-as-code alongside Lambda.
- Cons: SST v4 dropped SvelteKit adapter; StaticSite requires prerendering (not suitable
  for SvelteKit with adapter-cloudflare which produces a Worker-backed Pages project).
  Would require significant adapter changes.

### Decision: Option A — `wrangler pages deploy`

Rationale: Simplest path, scriptable, and consistent with the Worker deployment model.
The frontend is a static SvelteKit build with adapter-cloudflare. We build locally (or in
CI) with `PUBLIC_API_URL` set, then deploy the output. A convenience script ties it together.

Option B is a good future upgrade (especially with CI) but adds dashboard state management
outside the ticket scope. Option C is blocked by SST v4's removal of the SvelteKit construct.

## Decision 2: Deploy Orchestration

### Options

**A. Manual sequential commands**
- Run `backend/build.sh`, `npx sst deploy`, `wrangler secret put`, `wrangler deploy`,
  `npm run build`, `wrangler pages deploy` in order.
- Pros: transparent, easy to debug.
- Cons: error-prone manual sequence, easy to forget a step.

**B. Single deploy script**
- Shell script that orchestrates all steps, reads SST output for Lambda URL,
  passes it to wrangler.
- Pros: one command, repeatable, captures the dependency chain.
- Cons: slightly more complex, but manageable.

### Decision: Option B — Deploy script with manual verification steps

A `scripts/deploy.sh` script that:
1. Builds the backend binary (`backend/build.sh`).
2. Deploys Lambda via SST (`npx sst deploy`), captures `apiUrl` output.
3. Sets `LAMBDA_URL` wrangler secret on the Worker.
4. Deploys the Worker (`wrangler deploy`).
5. Builds the frontend with `PUBLIC_API_URL` pointing to the Worker.
6. Deploys frontend to CF Pages (`wrangler pages deploy`).

The script handles the dependency chain (SST output -> Worker secret -> frontend env var).
Manual verification steps are documented separately.

## Decision 3: E2E Verification Approach

### Options

**A. Manual curl tests only**
- Test each endpoint from the terminal, check CORS headers, SSE streaming.
- Pros: fast, no new code.
- Cons: doesn't test the browser path, misses frontend integration issues.

**B. Automated E2E with Playwright against deployed URL**
- Add a Playwright test that hits the deployed Worker URL.
- Pros: repeatable, catches regressions.
- Cons: requires real LLM calls (costs), test environment config, flaky due to network.

**C. Verification script (curl + checks) + manual browser smoke test**
- Shell script that verifies CORS, connectivity, SSE streaming via curl.
- Manual browser test of the full workshop flow.
- Pros: automated for the mechanical checks, manual for the visual/UX flow.
- Cons: not fully automated.

### Decision: Option C — Verification script + manual browser smoke test

Rationale: The mechanical checks (CORS preflight, endpoint reachability, SSE streaming,
rate limiting) can be reliably tested via curl. The full workshop UX flow (persona -> analyze
-> expand -> refine) is best verified manually in the browser for this initial deployment.
Automated Playwright E2E against production is a future enhancement.

## Decision 4: CORS Header Duplication

Research identified a risk: both Lambda (Go middleware) and Worker set CORS headers.
The Worker's `proxyToLambda` copies Lambda's response headers then sets CORS headers on top:

```typescript
const responseHeaders = new Headers(lambdaResponse.headers);
for (const [key, value] of Object.entries(corsHeaders(env))) {
    responseHeaders.set(key, value);  // .set() REPLACES, doesn't append
}
```

`Headers.set()` replaces existing values, so the Worker's CORS headers override Lambda's.
No duplication occurs. No fix needed.

## Decision 5: ALLOWED_ORIGIN Configuration

Research noted `ALLOWED_ORIGIN = "*"` should be restricted before production. For this
ticket's initial deployment:
- Keep `*` during verification to avoid debugging CORS issues that mask real problems.
- Document the restriction as a post-verification hardening step.
- The Worker already supports overriding via `wrangler secret put ALLOWED_ORIGIN`.

## Architecture Summary

```
Deploy script (scripts/deploy.sh)
  1. backend/build.sh -> bootstrap binary
  2. npx sst deploy -> apiUrl output
  3. wrangler secret put LAMBDA_URL (Worker)
  4. cd worker && wrangler deploy
  5. PUBLIC_API_URL=<worker-url> npm run build (frontend)
  6. wrangler pages deploy .svelte-kit/cloudflare

Verification script (scripts/verify-deploy.sh)
  - CORS preflight check
  - POST /api/persona with test payload
  - SSE streaming validation
  - Rate limit check (11 rapid requests)
  - Response time measurement

Manual browser test
  - Full workshop flow on CF Pages URL
```
