# Research — T-002-03: refine-hmw-endpoint

## What Exists

### Endpoint Stub
`backend/handlers.go:126-129` — `handleRefine` is registered at `POST /api/refine` in `main.go:14` but returns 501 Not Implemented. The route and CORS middleware are already wired.

### BAML Function
`backend/baml_src/refine.baml` — `RefineHMW(session: HMWSession) -> HMWRefinement` is fully defined. The prompt template references:
- `session.context.persona.label` and `session.context.domain`
- Candidates filtered by status (SELECTED, EDITED, SKIPPED, CLIPPED)
- `session.iterationCount`

### Generated Go Client
`backend/baml_client/functions_stream.go:194`:
```go
func (*stream) RefineHMW(ctx context.Context, session types.HMWSession, opts ...CallOptionFunc) (<-chan StreamValue[stream_types.HMWRefinement, types.HMWRefinement], error)
```
Takes a single `types.HMWSession` argument. Returns a channel of `StreamValue` partials → final.

### Input Type: `types.HMWSession`
```go
type HMWSession struct {
    Context        ProblemContext  `json:"context"`
    Analysis       *HMWAnalysis   `json:"analysis"`
    Candidates     []HMWCandidate `json:"candidates"`
    ClippedIds     []string       `json:"clippedIds"`
    IterationCount int64          `json:"iterationCount"`
}
```
- `Analysis` is optional (pointer) — but by the time refine is called, it should exist
- `Candidates` is the core input — filtered by status in the BAML prompt
- `ClippedIds` tracks keeper list

### Output Type: `types.HMWRefinement`
```go
type HMWRefinement struct {
    NewVariants       []HMWVariant `json:"newVariants"`
    Tensions          []string     `json:"tensions"`
    Recommendation    *string      `json:"recommendation"`
    SuggestedNextMove *string      `json:"suggestedNextMove"`
}
```
- `NewVariants` streams in progressively (array builds up)
- `Tensions` appears in later partials
- `Recommendation` and `SuggestedNextMove` are optional, appear in final partials

### Existing Patterns
All three existing handlers follow the same structure:
1. Define a request struct wrapping the BAML inputs
2. Decode JSON body
3. Validate required fields (TrimSpace checks)
4. Call `baml_client.Stream.<Function>(r.Context(), ...args)`
5. Pass channel to `streamSSE(w, r, ch)`

### SSE Infrastructure
`backend/sse.go` — Generic `streamSSE[TStream, TFinal]` handles all streaming. Sets SSE headers, iterates channel, marshals JSON, sends `data: [DONE]\n\n` sentinel. No changes needed.

### Test Patterns
- `handlers_test.go` — Unit tests cover input validation: empty body, invalid JSON, missing required fields. All use `httptest.NewRequest` + `httptest.NewRecorder`.
- `integration_test.go` — Integration tests (build tag `integration`) spin up `httptest.NewServer`, POST real data, verify SSE stream structure and final JSON shape. Require `ANTHROPIC_API_KEY`.

### Dependencies
- T-002-02 (expand-hmw-endpoint) is `phase: done` — no blockers
- The BAML function `RefineHMW` is already defined and code-generated
- No frontend changes needed for this backend ticket

## Key Observations

1. **Single argument**: Unlike analyze (2 args) and expand (2 args), RefineHMW takes a single `HMWSession`. The request struct wraps it as `{"session": HMWSession}`.

2. **Validation scope**: The session object is complex (nested context, optional analysis, array of candidates). The existing pattern validates top-level required string fields. For the session, minimum viable validation is: `context.domain` non-empty, `context.persona.label` non-empty, and `candidates` non-empty (refining with no candidates is nonsensical).

3. **No new files needed**: The handler goes in `handlers.go`, tests in `handlers_test.go` and `integration_test.go`. `sse.go` is unchanged.

4. **JSON field naming**: BAML generates `json:"iterationCount"` (camelCase) which matches the frontend's expected format.
