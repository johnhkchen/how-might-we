# Review: T-004-03 deploy-e2e-verification

## Summary

Full stack deployed and verified end-to-end: Lambda backend (SST), Cloudflare Worker proxy,
and SvelteKit frontend on Cloudflare Pages. Automated verification script confirms CORS,
SSE streaming, error handling, and route rejection all work correctly through the Worker
proxy. A pre-existing type mismatch (`HMWVariant.move` vs BAML's `moveType`) was fixed
across 7 files.

## Files Created

- **`scripts/deploy.sh`** (~80 lines) — Full-stack deploy orchestration. Builds backend,
  deploys Lambda via SST, sets Worker secrets, deploys Worker, builds and deploys frontend
  to CF Pages. Captures and chains outputs between steps.
- **`scripts/verify-deploy.sh`** (~115 lines) — Post-deploy verification. 7 test suites:
  CORS preflight, endpoint reachability, SSE streaming, response time, rate limiting,
  error handling, route rejection. Color-coded pass/fail/warn output.
- **`frontend/.env`** — Declares `PUBLIC_API_URL=` (empty for dev). Fixes svelte-check
  error about unknown env import.

## Files Modified

- **`package.json`** (root) — Added `deploy:all` and `verify:deploy` script aliases.
- **`CLAUDE.md`** — Added deploy/verify commands, added `scripts/` to source layout.
- **`frontend/src/lib/stores/session.svelte.ts`** — Renamed `HMWVariant.move` to
  `HMWVariant.moveType` to match BAML output field name.
- **`frontend/src/lib/components/VariantCard.svelte`** — Updated 3 references:
  `candidate.variant.move` -> `candidate.variant.moveType`.
- **`frontend/src/lib/components/ExportPanel.svelte`** — Updated 1 reference.
- **`frontend/src/lib/components/ClipBoard.svelte`** — Updated 3 references.
- **`frontend/tests/fixtures/expansion.ts`** — Updated 12 fixture objects: `move:` -> `moveType:`.
- **`frontend/tests/fixtures/refinement.ts`** — Updated 7 fixture objects: `move:` -> `moveType:`.

## Acceptance Criteria Evaluation

| Criteria | Status | Evidence |
|----------|--------|---------|
| Frontend deployed to CF Pages with `PUBLIC_API_URL` pointing to worker | **Pass** | `https://f6d9eb4c.hmw-workshop.pages.dev` loads, built with `PUBLIC_API_URL=https://hmw-api-proxy.john-hk-chen.workers.dev` |
| Full workshop flow works from deployed site | **Partial** | Landing page and workshop page load (200). Full interactive flow requires manual browser test (not possible in CLI). Mechanical checks (CORS, SSE streaming, error handling) all pass. |
| SSE streaming works through worker proxy without dropped events | **Pass** | 23 SSE events received through Worker, `[DONE]` sentinel confirmed |
| CORS works correctly (no browser console errors) | **Pass** | OPTIONS returns 204 with all CORS headers; POST responses include CORS headers. curl verification confirms no header issues. |
| Response times acceptable (first SSE event within 2 seconds) | **Pass** | 84ms TTFB measured via curl (well under 2s) |

## Test Coverage

- **Automated verification**: 11 passing tests, 1 expected warning via `verify-deploy.sh`.
- **Frontend type checks**: `npm run check` — 0 errors (175 files).
- **Frontend lint**: `npm run lint` — clean.
- **Backend build**: `go build ./...` — passes.
- **Backend cross-compile**: `build.sh` — produces 20M bootstrap binary.
- **SST deploy**: successful, Lambda Function URL active and streaming.
- **Worker deploy**: successful (3.68 KiB), CORS and proxy working.
- **Pages deploy**: successful (19 files uploaded), landing and workshop pages load.

### Not Tested (Requires Browser)
- Full interactive workshop flow (persona -> analyze -> expand -> refine -> clip).
- Real-time streaming UX updates in the browser.
- Browser DevTools Network tab for CORS errors.
- These require manual browser testing at `https://f6d9eb4c.hmw-workshop.pages.dev`.

## Open Concerns

### 1. CF Pages URL Is Deployment-Specific
The deployed URL `f6d9eb4c.hmw-workshop.pages.dev` is specific to this deployment.
The production URL is `hmw-workshop.pages.dev` (the main Pages project URL). Future
deployments will get new deployment-specific URLs, but the project URL stays the same.

### 2. `ALLOWED_ORIGIN` Still Wildcard
The Worker's `ALLOWED_ORIGIN` is `*`. Before true production use, this should be restricted
to the CF Pages domain. Override via `wrangler secret put ALLOWED_ORIGIN <pages-domain>`.

### 3. Rate Limiting Is Per-Isolate
As documented in T-004-02 review, the in-memory rate limiter doesn't aggregate across
Worker isolates. The verification test correctly treats this as a warning, not a failure.
T-005-03 addresses global rate limiting.

### 4. Lambda Cold Start
TTFB was 84ms in this test (warm Lambda). First request after idle period will incur a
cold start (estimated 1-3s for a 20M Go binary). This may exceed the 2s target on rare
occasions. Provisioned concurrency or warming pings could address this if needed.

### 5. Pre-Existing Type Mismatch Fixed
The `HMWVariant.move` / `moveType` inconsistency between the frontend TypeScript types
and the BAML schema predated this ticket. The fix aligns the frontend with the BAML output.
This means the expand and refine flows were previously broken in production (using `undefined`
for the move type badge). The fix makes these flows work correctly.

### 6. Manual Browser Test Outstanding
The full workshop UX flow has not been tested interactively. A human should navigate to
`https://f6d9eb4c.hmw-workshop.pages.dev/workshop` and walk through:
setup -> analyze -> expand -> refine -> clip to confirm the complete flow.
