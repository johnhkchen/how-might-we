# Progress: T-004-03 deploy-e2e-verification

## Completed

### Step 1: Created deploy orchestration script
- `scripts/deploy.sh` — Full-stack deploy: backend build, SST deploy, Worker secret +
  deploy, frontend build + Pages deploy. Syntax-validated.

### Step 2: Created verification script
- `scripts/verify-deploy.sh` — 7 automated tests via curl. Syntax-validated.
- Fixed bash arithmetic bug (`((PASS++))` -> `$((PASS + 1))`) under `set -e`.
- Fixed test payload format to match persona endpoint (`rawInput` field).

### Step 3: Updated root package.json
- Added `deploy:all` and `verify:deploy` scripts.

### Step 4: Updated CLAUDE.md
- Added deploy scripts to Commands section.
- Added `scripts/` to Source Layout.

### Step 5: Built backend and deployed Lambda
- Cross-compiled Go binary (20M bootstrap).
- Set `AnthropicApiKey` SST secret for production stage.
- SST deploy successful: `https://wsre5lr4hf6hetpv3n7txzd6y40geldh.lambda-url.us-west-1.on.aws/`
- Verified Lambda SSE streaming works directly (23 events, correct `data:` format).

### Step 6: Deployed Worker proxy
- Set `LAMBDA_URL` wrangler secret on `hmw-api-proxy`.
- Deployed Worker: `https://hmw-api-proxy.john-hk-chen.workers.dev`
- Verified CORS preflight (OPTIONS -> 204 with headers).

### Step 7: Built and deployed frontend
- Fixed pre-existing type error: `HMWVariant.move` -> `HMWVariant.moveType` to match
  BAML output. Fixed in 5 files: session.svelte.ts, VariantCard.svelte, ExportPanel.svelte,
  ClipBoard.svelte, plus test fixtures (expansion.ts, refinement.ts).
- Created `frontend/.env` with `PUBLIC_API_URL=` for dev (fixes svelte-check).
- Built with `PUBLIC_API_URL=https://hmw-api-proxy.john-hk-chen.workers.dev`.
- Deployed to CF Pages: `https://f6d9eb4c.hmw-workshop.pages.dev`

### Step 8: Ran verification script
All 11 tests passed, 1 warning (expected):
- CORS preflight: 204 + headers present (3 checks)
- Endpoint reachability: 200 OK
- SSE streaming: data lines present, [DONE] sentinel, 23 events
- Response time: 84ms TTFB (well under 2s target)
- Rate limiting: warning (per-isolate distribution, expected in production)
- Error handling: 400 for malformed JSON
- Route rejection: 405 GET, 404 bad path

### Step 9: Verified frontend pages
- Landing page loads (200), HTML correct ("HMW Workshop", "Start a Session" link).
- Workshop page loads (200).

### Build Verification
- `go build ./...`: passes
- `npm run check`: passes (0 errors)
- `npm run lint`: passes

## Deviations from Plan

1. **SST secret missing**: Production stage had no `AnthropicApiKey`. Set it before deploy.
2. **Type mismatch fix**: Pre-existing `HMWVariant.move` vs BAML's `moveType` field name
   mismatch caused svelte-check to fail with 4 errors (workshop page) + 19 errors (fixtures).
   Fixed as part of "own all issues" mandate.
3. **Frontend .env file**: Created `frontend/.env` to declare `PUBLIC_API_URL` for svelte-check.
4. **Verification script bugs**: Fixed bash arithmetic under `set -e` and test payload format.
5. **Manual browser test**: Not possible in this CLI session. All mechanical checks pass.
   The deployed site is accessible and verifiable by a human.

## Deployed URLs

| Component | URL |
|-----------|-----|
| Lambda | https://wsre5lr4hf6hetpv3n7txzd6y40geldh.lambda-url.us-west-1.on.aws/ |
| Worker | https://hmw-api-proxy.john-hk-chen.workers.dev |
| Frontend | https://f6d9eb4c.hmw-workshop.pages.dev |
