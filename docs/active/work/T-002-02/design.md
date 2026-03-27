# Design — T-002-02: expand-hmw-endpoint

## Decision: Follow Established Handler Pattern

The expand endpoint is structurally identical to the analyze endpoint. The design decision is straightforward: replicate the same pattern with the appropriate types and validation.

### Approach: Direct Pattern Replication

**What**: Implement `handleExpand` with the same parse → validate → stream pattern as `handleAnalyze`.

**Why this is the only viable approach**: The SSE infrastructure (`streamSSE`), BAML streaming client, request/response patterns, and test patterns are all established and working. Deviating would create inconsistency for no benefit.

## Request Shape

```go
type expandRequest struct {
    Analysis baml_types.HMWAnalysis      `json:"analysis"`
    Context  baml_types.ProblemContext    `json:"context"`
}
```

This matches the acceptance criteria: `{ "analysis": HMWAnalysis, "context": ProblemContext }`.

## Validation Design

### Which fields to validate

The BAML prompt (`expand.baml`) references these fields from the input:
- `context.persona.label` — used in prompt template
- `context.persona.context` — used in prompt template
- `context.persona.frustrations` — iterated in prompt template
- `analysis.originalStatement` — used in prompt template
- `analysis.underlyingTension` — used in prompt template
- `analysis.solutionBias` — conditionally used (nullable, so no validation needed)

**Validation rules** (required non-empty strings):
1. `analysis.originalStatement` — core input to the BAML function
2. `analysis.underlyingTension` — core input to the BAML function
3. `context.domain` — consistent with analyzeRequest validation
4. `context.persona.label` — used directly in the prompt

**Not validated** (acceptable to be empty/nil):
- `analysis.solutionBias` — optional field (`*string` in Go)
- `context.persona.context` — while used in the prompt, it's a description field that could legitimately be empty
- `context.persona.frustrations` — could be empty array
- `context.priorContext` — optional field

This strikes a balance: validate fields that would cause the BAML prompt to produce garbage output, but don't over-validate optional/descriptive fields.

### Error responses

Use `writeJSONError(w, message, 400)` consistent with existing handlers. Messages follow the pattern `"fieldPath is required"`.

## Streaming

Call `baml_client.Stream.ExpandHMW(r.Context(), req.Analysis, req.Context)` and pipe through `streamSSE`. The generic `streamSSE` handles:
- SSE headers (Content-Type, Cache-Control, Connection)
- Partial events as `data: {json}\n\n`
- Final event
- `data: [DONE]\n\n` sentinel
- Context cancellation

No modifications to `streamSSE` needed.

## Test Design

### Unit tests (handlers_test.go)

Follow the exact pattern from analyze tests:
1. `TestHandleExpand_EmptyBody` — nil body → 400
2. `TestHandleExpand_InvalidJSON` — malformed JSON → 400
3. `TestHandleExpand_MissingOriginalStatement` — empty analysis.originalStatement → 400
4. `TestHandleExpand_MissingUnderlyingTension` — empty analysis.underlyingTension → 400
5. `TestHandleExpand_MissingDomain` — empty context.domain → 400
6. `TestHandleExpand_MissingPersonaLabel` — empty context.persona.label → 400

### Integration test (integration_test.go)

`TestExpandEndpoint_Integration`:
- Skip if no API key
- POST a complete expand request with realistic HMWAnalysis + ProblemContext
- Verify SSE stream structure (Content-Type, CORS, [DONE] sentinel)
- Parse final event as HMWExpansion
- Assert variants array is non-empty
- Assert each variant has statement, moveType, rationale
- Assert emergentTheme is present in final event

## Rejected Alternatives

1. **Batch response (non-streaming)**: Rejected because the acceptance criteria explicitly require streaming ("Variants stream in one by one"). The BAML streaming client and SSE infrastructure already support this.

2. **Additional validation (persona.frustrations non-empty, etc.)**: Rejected because the BAML prompt handles empty arrays gracefully (the Jinja template just produces no list items), and over-validation would reject legitimate requests.

3. **Custom streaming logic for variant-by-variant delivery**: Rejected because BAML's structured streaming already builds up the variants array incrementally. The `streamSSE` generic function sends each partial, which naturally includes the growing variants array. No custom logic needed.
