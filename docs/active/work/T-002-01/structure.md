# Structure — T-002-01: analyze-hmw-endpoint

## Files Modified

### 1. `backend/handlers.go`

**Changes:**
- Add import for `baml_types "github.com/hmw-workshop/backend/baml_client/types"`
- Add `analyzeRequest` struct with `Statement string` and `Context baml_types.ProblemContext`
- Replace the placeholder `handleAnalyze` body (currently returns 501) with:
  - JSON decode into `analyzeRequest`
  - Validate `statement` is non-empty
  - Validate `context.Domain` is non-empty
  - Validate `context.Persona.Label` is non-empty
  - Call `baml_client.Stream.AnalyzeHMW(r.Context(), req.Statement, req.Context)`
  - Pass channel to `streamSSE(w, r, ch)`

**Interface:** The handler signature stays the same (`http.HandlerFunc`). The route is already wired in `main.go`.

### 2. `backend/handlers_test.go`

**Changes:**
- Add unit tests for `handleAnalyze`:
  - `TestHandleAnalyze_EmptyBody` — nil body → 400
  - `TestHandleAnalyze_InvalidJSON` — malformed JSON → 400
  - `TestHandleAnalyze_MissingStatement` — `{}` → 400
  - `TestHandleAnalyze_EmptyStatement` — `{"statement":""}` → 400
  - `TestHandleAnalyze_MissingContext` — statement only, no context → 400 (empty domain)
  - `TestHandleAnalyze_WhitespaceStatement` — `{"statement":"   "}` → 400

### 3. `backend/integration_test.go`

**Changes:**
- Add `TestAnalyzeEndpoint_Integration` following the same pattern as `TestPersonaEndpoint_Integration`:
  - POST with valid statement + full ProblemContext JSON
  - Verify 200 status, SSE content type, CORS headers
  - Parse SSE events, verify partials are valid JSON
  - Verify final event has all HMWAnalysis fields populated
  - Verify [DONE] sentinel

## Files NOT Modified

- `backend/main.go` — route already registered
- `backend/sse.go` — generic, works as-is
- `backend/middleware.go` — no changes needed
- `backend/baml_src/*.baml` — AnalyzeHMW function already defined
- `backend/baml_client/**` — generated code, not hand-edited
- All frontend files — backend-only ticket

## Module Boundaries

The handler imports from two BAML packages:
1. `baml_client` (top-level) — for `Stream.AnalyzeHMW()` and `StreamValue` type
2. `baml_client/types` — for `ProblemContext` struct used in request parsing

No new packages or modules are created. The request struct `analyzeRequest` is package-private, defined in `handlers.go` alongside the existing `personaRequest`.

## Ordering

1. Implement `handleAnalyze` in `handlers.go` (the core change)
2. Add unit tests in `handlers_test.go`
3. Add integration test in `integration_test.go`
4. Verify build compiles and unit tests pass
5. Verify integration test passes with live API key
