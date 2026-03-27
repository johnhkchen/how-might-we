# Progress — T-002-01: analyze-hmw-endpoint

## Completed

### Step 1: Implement handleAnalyze
- Added `baml_types` import for `baml_client/types` package
- Defined `analyzeRequest` struct with `Statement` and `Context` fields
- Implemented `handleAnalyze` with:
  - JSON body parsing
  - Validation: statement non-empty, context.domain non-empty, context.persona.label non-empty
  - Call to `baml_client.Stream.AnalyzeHMW(r.Context(), req.Statement, req.Context)`
  - SSE streaming via `streamSSE(w, r, ch)`
- Build verified: `go build ./...` passes

### Step 2: Unit tests
- Added 7 test cases to `handlers_test.go`:
  - `TestHandleAnalyze_EmptyBody` — nil body → 400
  - `TestHandleAnalyze_InvalidJSON` — malformed JSON → 400
  - `TestHandleAnalyze_MissingStatement` — no statement → 400
  - `TestHandleAnalyze_EmptyStatement` — empty string → 400
  - `TestHandleAnalyze_WhitespaceStatement` — whitespace only → 400
  - `TestHandleAnalyze_MissingContext` — no context (empty domain) → 400
  - `TestHandleAnalyze_MissingPersonaLabel` — empty persona label → 400
- All tests pass: `go test -run TestHandleAnalyze ./...`

### Step 3: Integration test
- Added `TestAnalyzeEndpoint_Integration` to `integration_test.go`
- Tests full SSE flow: POST → verify 200, SSE content type, CORS, partial events, final HMWAnalysis fields, [DONE] sentinel
- Skips gracefully when ANTHROPIC_API_KEY not set

### Step 4: Final verification
- `go build ./...` — clean
- `go test ./...` — all unit tests pass (including persona + CORS tests)
- Integration test skips correctly (no API key in Doppler)

## Deviations from Plan
None.
