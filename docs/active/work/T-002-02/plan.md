# Plan — T-002-02: expand-hmw-endpoint

## Step 1: Implement handleExpand handler

**File**: `backend/handlers.go`

**Actions**:
1. Add `expandRequest` struct after the `analyzeRequest` struct (line ~44)
2. Replace the `handleExpand` function body (lines 82–85) with full implementation

**Verification**: `go build ./...` passes from `backend/`

## Step 2: Add unit tests for expand validation

**File**: `backend/handlers_test.go`

**Actions**:
1. Add `validAnalysis` const — minimal valid HMWAnalysis JSON string for reuse
2. Add 6 test functions:
   - `TestHandleExpand_EmptyBody`
   - `TestHandleExpand_InvalidJSON`
   - `TestHandleExpand_MissingOriginalStatement`
   - `TestHandleExpand_MissingUnderlyingTension`
   - `TestHandleExpand_MissingDomain`
   - `TestHandleExpand_MissingPersonaLabel`

**Verification**: `go test ./...` (unit tests only, no build tag) — all pass

## Step 3: Add integration test for expand endpoint

**File**: `backend/integration_test.go`

**Actions**:
1. Append `TestExpandEndpoint_Integration` after the analyze integration test
2. Uses realistic HMWAnalysis + ProblemContext payload
3. Validates SSE stream structure, final JSON shape, variant field completeness

**Verification**: `doppler run -- go test -tags=integration ./...` — skips gracefully without API key, passes with it

## Step 4: Verify build is green

**Actions**:
1. `cd backend && go build ./...` — compiles cleanly
2. `cd backend && go test ./...` — all unit tests pass
3. `cd backend && go vet ./...` — no issues

## Testing Strategy

| Layer | What | How | When |
|-------|------|-----|------|
| Unit | Input validation (6 cases) | httptest, assert 400 | Step 2 |
| Integration | Full SSE stream with real LLM | httptest server, ANTHROPIC_API_KEY | Step 3 (manual) |
| E2E | Frontend → backend flow | Playwright with mock fixtures | Existing fixtures already cover this |

Unit tests cover all validation branches. Integration test covers the happy path end-to-end. The BAML prompt itself is tested via `baml-cli test` (separate concern).

## Commit Strategy

Single commit after all steps complete — the handler and its tests are a single logical unit.
