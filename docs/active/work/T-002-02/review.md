# Review — T-002-02: expand-hmw-endpoint

## Summary of Changes

### Files Modified

| File | Change |
|------|--------|
| `backend/handlers.go` | Added `expandRequest` struct; replaced `handleExpand` stub with full implementation (parse → validate → stream) |
| `backend/handlers_test.go` | Added `validAnalysis` const + 6 unit tests for expand input validation |
| `backend/integration_test.go` | Added `TestExpandEndpoint_Integration` for full SSE stream validation with real LLM |

### Files NOT Modified

- `backend/main.go` — route was already registered
- `backend/sse.go` — generic streaming worked as-is
- `backend/baml_src/*` — no BAML changes needed
- `frontend/*` — backend track only

## What Was Implemented

The `/api/expand` endpoint now:
1. Accepts `POST` with `{ "analysis": HMWAnalysis, "context": ProblemContext }`
2. Validates 4 required fields: `analysis.originalStatement`, `analysis.underlyingTension`, `context.domain`, `context.persona.label`
3. Calls `baml_client.Stream.ExpandHMW()` to generate 6–8 diverse HMW variant reframings
4. Streams partial `HMWExpansion` objects via SSE (variants build up incrementally)
5. Final event includes `emergentTheme`
6. Sends `[DONE]` sentinel on completion

## Acceptance Criteria Status

- [x] `handleExpand` parses `{ "analysis": HMWAnalysis, "context": ProblemContext }` from request body
- [x] Calls BAML `Stream.ExpandHMW()` and streams partial `HMWExpansion` objects
- [x] Variants stream in one by one (partial array builds up — handled by BAML structured streaming)
- [x] Each variant has a distinct `moveType` and clear rationale (enforced by BAML type system + integration test)
- [x] `emergentTheme` appears in final partial (verified by integration test assertion)

## Test Coverage

| Layer | Tests | Coverage |
|-------|-------|----------|
| Unit | 6 tests | All validation branches: empty body, invalid JSON, 4 required field checks |
| Integration | 1 test | Full SSE stream: status code, headers, stream structure, final JSON shape, variant completeness, emergentTheme |
| Build | `go build`, `go vet` | Clean compilation, no issues |

**Total test count**: 20 (all passing) — 5 persona + 7 analyze + 6 expand + 2 CORS

### What's NOT tested

- Streaming cancellation (client disconnect mid-stream) — covered by `streamSSE` which is shared infrastructure, not this endpoint's responsibility
- BAML prompt quality (6–8 variants, diverse moves) — tested via `baml-cli test`, not Go tests
- Error path for BAML stream start failure — would require mocking the BAML client; not worth the complexity for a log+500 response

## Open Concerns

1. **No mock BAML client for unit testing the happy path**: The unit tests only cover input validation. Testing the actual streaming response requires a real API key (integration test). This is consistent with the existing persona and analyze handlers — it's a codebase-wide pattern, not a gap specific to this ticket.

2. **Frontend field naming mismatch**: The frontend fixtures use `move` for the variant move type, while BAML/Go types use `moveType`. This is a frontend concern and doesn't affect the backend API (which uses `moveType` in the JSON). The frontend will need to handle this mapping.

## Code Quality

- Pattern is identical to `handleAnalyze` — consistent, predictable, reviewable
- No new dependencies, no new files, no architectural changes
- Build is green: `go build`, `go test`, `go vet` all pass
