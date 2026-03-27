# Research — T-002-04: backend-e2e-flow-test

## Objective

Verify the complete backend pipeline end-to-end: persona → analyze → expand → refine. Each endpoint streams SSE events via BAML's structured streaming. The e2e test must chain outputs across all four stages and validate structure, streaming protocol, and error handling.

## Existing Code

### Backend Architecture

- **main.go** — Registers four POST routes on `http.NewServeMux`: `/api/persona`, `/api/analyze`, `/api/expand`, `/api/refine`. Wraps with `corsMiddleware`. Listens on `:8080` (or `$PORT`).
- **handlers.go** — One handler per BAML function. Each: decodes JSON body, validates required fields, calls `baml_client.Stream.<Function>()`, passes the channel to `streamSSE()`.
- **sse.go** — Generic `streamSSE[TStream, TFinal]()` function. Writes `text/event-stream` headers, iterates the BAML channel, marshals each partial/final to `data: {json}\n\n`, ends with `data: [DONE]\n\n`.
- **middleware.go** — Sets `Access-Control-Allow-Origin: *`, `Allow-Methods: POST, OPTIONS`, `Allow-Headers: Content-Type`. OPTIONS returns 204.

### BAML Types (types.baml)

Key data flow:
1. `RefinePersona(rawInput: string) -> Persona` — Produces `Persona { label, role, goals[], frustrations[], context, influencers[] }`
2. `AnalyzeHMW(statement: string, context: ProblemContext) -> HMWAnalysis` — Needs `ProblemContext { domain, persona: Persona, constraints[] }`. Returns `HMWAnalysis { originalStatement, implicitUser, embeddedAssumptions[], scopeLevel, solutionBias?, underlyingTension, initialReframing }`
3. `ExpandHMW(analysis: HMWAnalysis, context: ProblemContext) -> HMWExpansion` — Returns `HMWExpansion { variants: HMWVariant[], emergentTheme? }`
4. `RefineHMW(session: HMWSession) -> HMWRefinement` — Session bundles context, analysis?, candidates[], clippedIds[], iterationCount. Returns `HMWRefinement { newVariants[], tensions[], recommendation?, suggestedNextMove? }`

### Existing Tests

- **handlers_test.go** (26 tests, all pass) — Unit tests for input validation only. Tests empty body, invalid JSON, missing required fields for all four endpoints. Also tests CORS headers and OPTIONS preflight. Does NOT test happy-path or SSE streaming because it can't — `httptest.NewRecorder` doesn't implement `http.Flusher`, and the BAML client requires an API key.
- **integration_test.go** (build tag `integration`, 4 tests) — Tests each endpoint independently against the real LLM API. Uses `httptest.NewServer` (which supports streaming). Checks SSE format, [DONE] sentinel, final JSON structure validation. Skips if `ANTHROPIC_API_KEY` not set. Does NOT chain endpoints together — each test uses hardcoded input, not output from the previous stage.

### SSE Protocol

Each endpoint streams: `data: {partial_json}\n\n` (repeated), then `data: {final_json}\n\n`, then `data: [DONE]\n\n`. The final event before [DONE] contains the complete structured response.

### Streaming Type System

`baml_client.StreamValue[TStream, TFinal]` has: `IsError bool`, `Error error`, `IsFinal bool`, `Final() *TFinal`, `Stream() *TStream`. Stream types are in `baml_client/stream_types/` with optional fields (pointers) for progressive filling.

### Test Infrastructure

- Go 1.24, `go test` with build tags for integration tests
- `httptest.NewServer` provides a real TCP server that supports `http.Flusher`
- `doppler run -- go test -tags=integration ./...` injects `ANTHROPIC_API_KEY`
- No test helper functions exist for SSE parsing — each integration test reimplements the scanner logic

## Gaps Identified

1. **No chained e2e test** — Integration tests call each endpoint with hardcoded data. No test passes persona output → analyze → expand → refine as a pipeline.
2. **Duplicated SSE parsing** — Each integration test has identical `bufio.Scanner` + `data:` prefix stripping code.
3. **No error validation tests against running server** — Unit tests check validation via `httptest.NewRecorder`, but never against a `httptest.NewServer` with full middleware.
4. **No test for mid-stream disconnect** — Context cancellation path in `streamSSE` is untested.
5. **Frontend fixtures use `move` field but BAML types use `moveType`** — The expansion fixtures have `move` instead of `moveType`. This is a frontend fixture naming issue, not a backend concern.

## Constraints

- Integration tests require `ANTHROPIC_API_KEY` and hit real LLM API (cost + latency)
- BAML client is generated code — cannot be mocked without an interface layer
- `httptest.NewRecorder` does not support `http.Flusher`, so SSE tests require `httptest.NewServer`
- Each LLM call takes 5-30 seconds; a 4-stage pipeline test could take 1-2 minutes
- The `//go:build integration` tag keeps these out of normal `go test` runs

## Key Files

| File | Role |
|------|------|
| `backend/handlers.go` | Route handlers with validation |
| `backend/sse.go` | Generic SSE streaming + error helper |
| `backend/middleware.go` | CORS middleware |
| `backend/main.go` | Server setup and routing |
| `backend/handlers_test.go` | Unit tests (validation, CORS) |
| `backend/integration_test.go` | Per-endpoint integration tests |
| `backend/baml_src/types.baml` | All structured types |
| `backend/baml_client/functions_stream.go` | Generated streaming functions |
