# Plan: T-004-03 deploy-e2e-verification

## Step 1: Create deploy orchestration script

Create `scripts/deploy.sh`:
- Parse `--stage` argument (default `production`).
- Build backend binary via `backend/build.sh`.
- Run `npx sst deploy --stage $STAGE`, capture `apiUrl` from output.
- Set `LAMBDA_URL` wrangler secret on the Worker.
- Deploy Worker via `wrangler deploy`.
- Build frontend with `PUBLIC_API_URL` pointing to Worker.
- Deploy frontend to CF Pages via `wrangler pages deploy`.
- Print summary of all deployed URLs.

Verification: script is syntactically valid (`bash -n`), each step has clear error handling.

## Step 2: Create verification script

Create `scripts/verify-deploy.sh`:
- Accept `WORKER_URL` as first argument.
- Run 7 verification tests via curl:
  1. CORS preflight (OPTIONS -> 204 + headers)
  2. Endpoint reachability (POST -> 200 + event-stream)
  3. SSE streaming (data lines + [DONE] sentinel)
  4. Response time (time-to-first-byte < 2s warning)
  5. Rate limiting (11th request -> 429)
  6. Error handling (malformed JSON -> 400)
  7. Route rejection (GET -> 405, bad path -> 404)
- Output pass/fail per test with summary.

Verification: `bash -n` syntax check. Can be dry-run tested against local backend.

## Step 3: Update root package.json

Add convenience scripts:
- `deploy:all` -> `bash scripts/deploy.sh`
- `verify:deploy` -> `bash scripts/verify-deploy.sh`

Verification: `cat package.json | jq .scripts` shows new entries.

## Step 4: Update CLAUDE.md

Add deploy and verify commands to the Commands section.

Verification: commands are documented and accurate.

## Step 5: Build backend and deploy Lambda

Run `cd backend && bash build.sh` to cross-compile.
Run `npx sst deploy` to deploy/update Lambda.
Capture the `apiUrl` output.

Verification: SST deploy succeeds, `apiUrl` is a valid HTTPS URL.
Test: `curl -X POST <apiUrl>/api/persona -H 'Content-Type: application/json' -d '{"topic":"test"}'`
returns SSE stream.

## Step 6: Deploy Worker proxy

Set `LAMBDA_URL` secret on the Worker using the URL from Step 5.
Run `cd worker && npx wrangler deploy`.
Capture the Worker URL from deployment output.

Verification: Worker is accessible at its URL.
Test: `curl -X OPTIONS <worker-url>/api/persona -v` returns 204 with CORS headers.

## Step 7: Build and deploy frontend

Run `cd frontend && PUBLIC_API_URL=<worker-url> npm run build`.
Run `cd frontend && npx wrangler pages deploy .svelte-kit/cloudflare --project-name hmw-workshop`.
Capture the Pages URL from deployment output.

Verification: Pages URL loads the landing page.

## Step 8: Run verification script

Execute `bash scripts/verify-deploy.sh <worker-url>`.
All 7 tests should pass.

Verification: script output shows all tests passing.

## Step 9: Manual browser smoke test

Open the deployed CF Pages URL in a browser.
Walk through the full workshop flow:
1. Landing page loads without console errors.
2. Navigate to /workshop.
3. Enter a topic and persona -> SSE stream updates PersonaCard in real-time.
4. Analyze HMW -> AnalysisPanel shows streamed results.
5. Expand variants -> VariantGrid populates incrementally.
6. Refine a variant -> streamed refinement appears.
7. Check browser DevTools Network tab: no CORS errors, SSE events visible.

Verification: all steps complete successfully, no console errors.

## Step 10: Document results

Update `progress.md` with deploy results and any issues encountered.
Write `review.md` summarizing changes, verification results, and open concerns.

## Testing Strategy

- **Deploy script**: syntax check + actual deploy execution (Step 5-7).
- **Verify script**: syntax check + execution against deployed stack (Step 8).
- **CORS**: verified by both curl (verify script) and browser (manual test).
- **SSE streaming**: verified by curl (data lines check) and browser (real-time updates).
- **Rate limiting**: verified by verify script (11 rapid requests).
- **Frontend build**: `npm run check` and `npm run lint` before deploy.
- **Backend build**: `go build ./...` before cross-compile.

## Commit Strategy

1. Commit: Add deploy and verification scripts.
2. Commit: Deploy results and documentation updates.
