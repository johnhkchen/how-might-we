# Design — T-002-01: analyze-hmw-endpoint

## Decision: Follow the handlePersona pattern exactly

The handler will mirror `handlePersona` line-for-line, differing only in:
- Request struct fields (`statement` + `context` instead of `rawInput`)
- Validation logic (two fields instead of one)
- BAML function called (`Stream.AnalyzeHMW` instead of `Stream.RefinePersona`)

### Rationale

The existing pattern is clean, tested, and works. The `streamSSE` generic function handles all SSE plumbing. There is no architectural decision to make — this is a direct application of the established template.

## Approach: Direct JSON decoding into BAML types

**Option A (chosen): Decode directly into BAML-generated types**

Define the request struct as:
```go
type analyzeRequest struct {
    Statement string                         `json:"statement"`
    Context   baml_client_types.ProblemContext `json:"context"`
}
```

The BAML-generated `ProblemContext` has JSON struct tags. Go's `encoding/json` will decode the incoming JSON directly into the nested struct. This avoids an intermediate type and manual mapping.

**Option B (rejected): Define separate request types, map manually**

Define plain Go structs for the request, then convert to BAML types before calling. This adds unnecessary code duplication and a manual mapping step. The only benefit would be decoupling the API contract from BAML's generated types — but since the API contract *is* the BAML types (per the specification), this decoupling adds complexity for no gain.

## Validation Strategy

**Minimal validation at the handler level:**
1. `statement` — must be non-empty after trimming whitespace
2. `context` — check that `context.Domain` is non-empty and `context.Persona.Label` is non-empty

Deeper validation (e.g., constraint type values, array lengths) is handled by BAML at the LLM layer. If the context is malformed in ways that matter, BAML will produce a stream error that `streamSSE` already handles.

**Why not validate every nested field?** The context object comes from Stage 1's persona refinement output. The frontend constructs it from BAML-produced data that the user edited. Validating every field at the handler level duplicates the frontend's job and BAML's type system. We validate enough to catch obvious mistakes (empty body, missing statement) and let BAML handle the rest.

## Import Strategy

The handler needs `baml_client/types` for `ProblemContext`. The existing import alias is `baml_client` for the top-level package. We need to add an import for the types subpackage. Following Go conventions, import as `baml_types` or use the full path.

## Test Strategy

**Unit tests (handlers_test.go):**
- Empty body → 400
- Invalid JSON → 400
- Missing statement → 400
- Empty statement → 400
- Missing context → 400 (zero-value ProblemContext has empty domain)
- Valid request body → handler reaches BAML call (will fail without API key, but validates parsing succeeded)

**Integration test (integration_test.go):**
- POST valid request with full ProblemContext
- Verify SSE content type
- Verify partial events stream in as JSON
- Verify final event has all required HMWAnalysis fields
- Verify [DONE] sentinel

## Rejected Alternatives

1. **Separate validation middleware** — Overkill for four handlers with different request shapes. Inline validation is clearer.

2. **Custom JSON unmarshaler for union types** — Not needed. BAML's generated union types serialize as plain strings in JSON, which Go's standard library handles.

3. **Request body size limit** — The context object is bounded by what Stage 1 produces (one persona, a few constraints). No need for explicit size limits at the handler level; the HTTP server's default limits suffice.
