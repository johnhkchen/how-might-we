# Research — T-002-01: analyze-hmw-endpoint

## Scope

Implement `handleAnalyze` in `backend/handlers.go` to parse `{ "statement": string, "context": ProblemContext }`, call BAML `Stream.AnalyzeHMW()`, and stream partial `HMWAnalysis` objects as SSE events.

## Existing Handler Pattern (handlePersona — T-001-02)

`backend/handlers.go:18-38` — The established pattern:

1. Define a request struct with JSON tags matching the expected payload.
2. Decode request body with `json.NewDecoder(r.Body).Decode(&req)`.
3. Validate required fields (empty/whitespace check via `strings.TrimSpace`).
4. Call `baml_client.Stream.<FunctionName>(r.Context(), ...args)` to get a `<-chan StreamValue`.
5. Pass the channel to `streamSSE(w, r, ch)` which handles SSE headers, JSON marshaling, flush, and `[DONE]` sentinel.

The `streamSSE` function in `backend/sse.go` is fully generic — it accepts `<-chan baml_client.StreamValue[TStream, TFinal]` and works for any BAML streaming function. No changes needed there.

## BAML Function Signature

From `backend/baml_client/functions_stream.go:46`:

```go
func (*stream) AnalyzeHMW(
    ctx context.Context,
    statement string,
    context types.ProblemContext,
    opts ...CallOptionFunc,
) (<-chan StreamValue[stream_types.HMWAnalysis, types.HMWAnalysis], error)
```

Two arguments: `statement` (string) and `context` (types.ProblemContext).

## Input Types (from baml_client/types/classes.go)

**ProblemContext** (line 515-520):
- `Domain string` (`json:"domain"`)
- `Persona Persona` (`json:"persona"`)
- `Constraints []Constraint` (`json:"constraints"`)
- `PriorContext *string` (`json:"priorContext"`)

**Persona** (line 443-450):
- `Label`, `Role`, `Context` — strings
- `Goals`, `Frustrations`, `Influencers` — `[]string`

**Constraint** (line 23-27):
- `Statement string`
- `Type Union3KassumptionOrKhardOrKsoft` (union type for "assumption"|"hard"|"soft")
- `ChallengeRationale *string`

## Output Type (HMWAnalysis)

From `types/classes.go:77-85`:
- `OriginalStatement string`
- `ImplicitUser string`
- `EmbeddedAssumptions []string`
- `ScopeLevel Union3Ktoo_broadOrKtoo_narrowOrKwell_scoped`
- `SolutionBias *string` (nullable)
- `UnderlyingTension string`
- `InitialReframing string`

Stream type version (stream_types/classes.go:79-87) has all fields as pointers — `streamSSE` handles this transparently.

## JSON Deserialization Concern

The `ProblemContext` uses BAML-generated Go types with union types (e.g., `Union3KassumptionOrKhardOrKsoft` for Constraint.Type). Standard `json.NewDecoder` will attempt to deserialize the incoming JSON directly into these types. The BAML types have `json` struct tags, so this should work for string-based union values — they're represented as plain strings in JSON.

Need to verify: does `json.Unmarshal` correctly handle the union types from BAML? Looking at the types, they use `json:"type"` etc. The union types are type aliases for string values, so standard JSON decoding should map `"hard"` → the corresponding union value.

## Existing Test Pattern (handlers_test.go)

Tests use `httptest.NewRequest` + `httptest.NewRecorder`, call the handler directly, and check status codes. The existing tests cover:
- Empty body → 400
- Invalid JSON → 400
- Missing required field → 400
- Empty/whitespace required field → 400

These are unit tests that don't need BAML/LLM. Integration tests (with `//go:build integration` tag) test the full SSE flow with a real BAML call.

## Request Validation Requirements

From the acceptance criteria, the request has two fields:
1. `statement` (string) — required, non-empty
2. `context` (ProblemContext) — required, must contain at minimum a `domain` and `persona` with a `label` and `role`

The persona handler only validates one field. For analyze, we need to validate two: the statement string and the nested context object. Minimal validation: ensure `statement` is non-empty. The context validation can be lighter since BAML will fail meaningfully if the context is malformed.

## Files Touched

Only `backend/handlers.go` needs code changes. Tests go in `backend/handlers_test.go` and `backend/integration_test.go`.

## Constraints & Boundaries

- This is a backend-only ticket — no frontend changes.
- BAML files and generated client are already correct; no `.baml` edits needed.
- The route is already registered in `main.go:12` as `POST /api/analyze`.
- Must not modify `sse.go`, `middleware.go`, or BAML-generated files.
