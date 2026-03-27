# Plan — T-002-03: refine-hmw-endpoint

## Step 1: Implement handleRefine in handlers.go

1. Add `refineRequest` struct after `expandRequest`
2. Replace the `handleRefine` stub with the full implementation:
   - Decode JSON body
   - Validate domain, persona.label, candidates length
   - Call `baml_client.Stream.RefineHMW`
   - Stream SSE response

**Verify**: `cd backend && go build ./...` compiles cleanly.

## Step 2: Add unit tests in handlers_test.go

Add five validation test cases:
1. `TestHandleRefine_EmptyBody` — nil body → 400
2. `TestHandleRefine_InvalidJSON` — malformed JSON → 400
3. `TestHandleRefine_MissingDomain` — empty domain → 400
4. `TestHandleRefine_MissingPersonaLabel` — empty persona label → 400
5. `TestHandleRefine_EmptyCandidates` — zero candidates → 400

Add `validSession` const with minimal valid session JSON for readability.

**Verify**: `cd backend && go test ./... -count=1` — all unit tests pass.

## Step 3: Add integration test in integration_test.go

Add `TestRefineEndpoint_Integration` with:
- Realistic session payload (selected, skipped, edited candidates)
- SSE stream verification (content-type, events, [DONE])
- Final HMWRefinement shape validation
- Partial event JSON validity check

**Verify**: `cd backend && doppler run -- go test -tags=integration -run TestRefineEndpoint_Integration -v -count=1` (requires API key).

## Step 4: Full verification

- `cd backend && go build ./...` — clean build
- `cd backend && go test ./... -count=1` — all unit tests pass
- `cd backend && go vet ./...` — no issues

## Commit Strategy

Single commit after all code + tests are written and verified. This is a small, self-contained change (~60 lines of handler code, ~120 lines of tests).
