# Design — T-002-03: refine-hmw-endpoint

## Decision: Follow the Established Handler Pattern

### Approach
Implement `handleRefine` identically to the three existing handlers: request struct → decode → validate → stream. No architectural changes.

### Alternatives Considered

**Option A: Exact mirror of existing pattern (chosen)**
- Request struct: `refineRequest{ Session types.HMWSession }`
- Validate: `context.domain`, `context.persona.label`, `len(candidates) > 0`
- Call: `baml_client.Stream.RefineHMW(ctx, req.Session)`
- Stream: `streamSSE(w, r, ch)`

Pros: Consistent, minimal code, proven pattern.
Cons: None meaningful.

**Option B: Deep validation of candidates**
- Validate each candidate has non-empty `id`, valid `status` enum, non-empty `variant.statement`.

Rejected: Over-validation at the handler layer. BAML and the LLM handle malformed candidates gracefully (the prompt filters by status). The frontend constructs these objects — this is an internal boundary, not a user-facing API. The existing handlers don't deep-validate arrays either (e.g., `handleExpand` doesn't validate `analysis.embeddedAssumptions` entries).

**Option C: Extract session from larger payload**
- Accept `{ "session": {...}, "preferences": {...} }` to allow future extensibility.

Rejected: YAGNI. The BAML function takes `HMWSession` only. If preferences are needed later, the request struct can be extended then.

### Validation Strategy

Validate the minimum fields that the BAML prompt actually references:
1. `session.context.domain` — non-empty (used in prompt)
2. `session.context.persona.label` — non-empty (used in prompt)
3. `len(session.candidates) > 0` — refining with zero candidates is a client bug

These match what the prompt template uses (`session.context.persona.label`, `session.context.domain`, candidate iteration). The `iterationCount` field defaults to 0 (Go zero value for int64), which is valid for a first refinement pass.

### Test Strategy

**Unit tests** (handlers_test.go):
- Empty body → 400
- Invalid JSON → 400
- Missing/empty domain → 400
- Missing/empty persona label → 400
- Empty candidates array → 400

**Integration test** (integration_test.go):
- POST with full session containing SELECTED and SKIPPED candidates
- Verify SSE stream, content-type, CORS headers
- Verify final HMWRefinement: newVariants non-empty, tensions present, suggestedNextMove present
- Verify partial events are valid JSON

### Error Messages
Follow the existing convention: lowercase, field-path style:
- `"session.context.domain is required"`
- `"session.context.persona.label is required"`
- `"session.candidates must not be empty"`
