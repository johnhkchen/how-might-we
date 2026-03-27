# Structure: T-004-03 deploy-e2e-verification

## Files Created

### `scripts/deploy.sh` (~80 lines)
Orchestrates the full-stack deploy sequence:
- Accepts optional `--stage` argument (default: `production`).
- Step 1: `cd backend && bash build.sh` — cross-compile Go binary.
- Step 2: `npx sst deploy --stage $STAGE` — deploy Lambda, capture `apiUrl` from JSON output.
- Step 3: Set `LAMBDA_URL` on Worker via `wrangler secret put` (pipes from SST output).
- Step 4: `cd worker && npx wrangler deploy` — deploy Worker proxy.
- Step 5: Extract Worker URL from wrangler output.
- Step 6: `cd frontend && PUBLIC_API_URL=$WORKER_URL npm run build` — build frontend.
- Step 7: `cd frontend && npx wrangler pages deploy .svelte-kit/cloudflare --project-name hmw-workshop` — deploy to CF Pages.
- Each step has error handling (set -euo pipefail) with clear error messages.
- Prints summary of deployed URLs at the end.

### `scripts/verify-deploy.sh` (~100 lines)
Post-deploy verification script:
- Accepts `WORKER_URL` and `PAGES_URL` as arguments (or reads from deploy output).
- Test 1: CORS preflight — `OPTIONS /api/persona`, verify 204 + CORS headers present.
- Test 2: Endpoint reachability — `POST /api/persona` with minimal valid payload,
  verify 200 + `Content-Type: text/event-stream`.
- Test 3: SSE streaming — capture response body, verify `data: ` lines present and
  `data: [DONE]` sentinel received.
- Test 4: Response time — measure time-to-first-byte, warn if > 2 seconds.
- Test 5: Rate limiting — send 11 rapid POST requests, verify 429 on 11th.
- Test 6: Error handling — send malformed JSON, verify 400 error response.
- Test 7: Route rejection — GET request returns 405, non-/api/ path returns 404.
- Reports pass/fail for each test with colored output.

### `docs/active/work/T-004-03/progress.md`
Implementation progress tracking.

### `docs/active/work/T-004-03/review.md`
Final review artifact.

## Files Modified

### `package.json` (root)
Add deploy orchestration scripts:
```json
"deploy:all": "bash scripts/deploy.sh",
"verify:deploy": "bash scripts/verify-deploy.sh"
```

### `CLAUDE.md`
Add deploy scripts to Commands section:
```bash
# Full-stack deploy
bash scripts/deploy.sh              # Deploy all (backend + worker + frontend)
bash scripts/verify-deploy.sh       # Verify deployed stack
```

## Files NOT Modified

- `backend/*` — Backend is already deployed and working (T-004-01).
- `worker/*` — Worker code is complete (T-004-02). Only deployed via existing command.
- `frontend/src/*` — No frontend code changes needed.
- `frontend/svelte.config.js` — Already configured for adapter-cloudflare.
- `frontend/wrangler.toml` — Already configured for Pages deployment.
- `sst.config.ts` — Lambda config is complete. Frontend TODO comment remains (SST v4 gap).

## Dependency Order

```
1. scripts/deploy.sh        (new — orchestration script)
2. scripts/verify-deploy.sh (new — verification script)
3. package.json              (modified — add script aliases)
4. CLAUDE.md                 (modified — document new commands)
5. Execute deploy            (runtime — run deploy.sh)
6. Execute verify            (runtime — run verify-deploy.sh)
7. Manual browser test       (runtime — visual verification)
```

## Module Boundaries

- Deploy script: only calls existing build/deploy commands. No new infrastructure code.
- Verify script: standalone, no dependencies beyond curl. Does not modify any state.
- Both scripts are pure orchestration — they compose existing tools, not replace them.
- Frontend env var `PUBLIC_API_URL` is the only cross-boundary configuration, set at
  build time by the deploy script.
