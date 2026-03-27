# Research — T-002-02: expand-hmw-endpoint

## Ticket Summary

Implement `/api/expand` endpoint: accepts `{ "analysis": HMWAnalysis, "context": ProblemContext }`, calls BAML `ExpandHMW`, streams back an `HMWExpansion` with 6–8 diverse variant reframings via SSE.

## Existing Codebase State

### Handler Stub (backend/handlers.go:82–85)

```go
func handleExpand(w http.ResponseWriter, r *http.Request) {
    // TODO: parse input, call BAML ExpandHMW, stream SSE response
    http.Error(w, "not implemented", http.StatusNotImplemented)
}
```

The route is already registered in `main.go:13` as `POST /api/expand`.

### BAML Function (backend/baml_src/expand.baml)

```
function ExpandHMW(analysis: HMWAnalysis, context: ProblemContext) -> HMWExpansion
```

Takes an analysis and context, generates 6–8 `HMWVariant` objects with diverse `moveType` values, plus an `emergentTheme`.

### Generated Go Client (backend/baml_client/functions_stream.go:120)

```go
func (*stream) ExpandHMW(ctx context.Context, analysis types.HMWAnalysis, context types.ProblemContext, opts ...CallOptionFunc) (<-chan StreamValue[stream_types.HMWExpansion, types.HMWExpansion], error)
```

Returns a channel of `StreamValue` — same generic pattern used by `RefinePersona` and `AnalyzeHMW`.

### Types (backend/baml_client/types/classes.go)

- `HMWAnalysis`: OriginalStatement, ImplicitUser, EmbeddedAssumptions, ScopeLevel, SolutionBias (*string), UnderlyingTension, InitialReframing
- `HMWExpansion`: Variants ([]HMWVariant), EmergentTheme (*string)
- `HMWVariant`: Statement, MoveType (enum: narrowed|broadened|shifted_user|reframed_constraint|elevated_abstraction|inverted|combined|decomposed), Rationale
- `ProblemContext`: Domain, Persona, Constraints, PriorContext (*string)

### SSE Infrastructure (backend/sse.go)

`streamSSE[TStream, TFinal any]` is a generic function that consumes a BAML streaming channel and writes SSE events. Already used by `handlePersona` and `handleAnalyze`. No changes needed — `handleExpand` just calls it.

### Established Patterns

**Request validation pattern** (from handleAnalyze):
1. Decode JSON body into typed request struct
2. Validate required string fields with `strings.TrimSpace(x) == ""`
3. Validate nested required fields (e.g. context.domain, context.persona.label)
4. Return 400 with `writeJSONError` for any validation failure

**Streaming pattern**:
1. Call `baml_client.Stream.FunctionName(r.Context(), ...args)`
2. Handle stream-start error → 500
3. Pass channel to `streamSSE(w, r, ch)`

**Unit test pattern** (backend/handlers_test.go):
- Test empty body, invalid JSON, missing/empty/whitespace for each required field
- Use `httptest.NewRequest` + `httptest.NewRecorder`
- Assert status code

**Integration test pattern** (backend/integration_test.go):
- Build tag `//go:build integration`
- Skip if `ANTHROPIC_API_KEY` not set
- Full httptest server with CORS middleware
- POST real payload, verify SSE stream structure
- Parse final event JSON, assert all required fields non-empty
- Verify at least one partial is valid JSON

### Frontend Mock Fixtures (frontend/tests/fixtures/expansion.ts)

Already provides `mockExpansionPartials`, `mockExpansionFinal`, and `expansionSSEStream()`. Uses field name `move` (not `moveType`) — this is the frontend's TypeScript naming; the Go/BAML types use `moveType`. Frontend fixture uses `HMWVariant.move` while BAML types define `HMWVariant.moveType`. This is a naming mismatch worth noting but is a frontend concern, not a backend one.

### Dependency: T-002-01 (analyze endpoint)

Completed. Established all the patterns above. The expand endpoint is structurally identical — only the request shape, validation rules, and BAML function differ.

## Validation Requirements for expandRequest

The expand request has two top-level fields:
- `analysis` (HMWAnalysis) — must have `originalStatement` and `underlyingTension` non-empty (these are the two fields the BAML prompt uses from the analysis)
- `context` (ProblemContext) — must have `domain` and `persona.label` non-empty (same validation as analyzeRequest)

## Constraints & Assumptions

1. The backend is stateless — no session tracking needed
2. SSE infrastructure is complete and generic — no modifications required
3. BAML client is already generated and includes `Stream.ExpandHMW`
4. The route is already registered — only the handler body needs implementing
5. Unit tests cannot test streaming (would need a mock BAML client) — they test input validation only
6. Integration tests require `ANTHROPIC_API_KEY` via Doppler

## Files to Modify

- `backend/handlers.go` — implement `handleExpand` body
- `backend/handlers_test.go` — add expand validation tests
- `backend/integration_test.go` — add expand integration test

No new files needed. No BAML changes. No frontend changes.
