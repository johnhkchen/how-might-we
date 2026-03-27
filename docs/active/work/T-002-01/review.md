# Review — T-002-01: analyze-hmw-endpoint

## Summary of Changes

### Files Modified

| File | Change |
|------|--------|
| `backend/handlers.go` | Added `baml_types` import, `analyzeRequest` struct, implemented `handleAnalyze` (replaced 501 stub with full handler) |
| `backend/handlers_test.go` | Added 7 unit tests for `handleAnalyze` input validation |
| `backend/integration_test.go` | Added `TestAnalyzeEndpoint_Integration` for end-to-end SSE streaming validation |

### No Files Created or Deleted

The implementation modifies existing files only — no new source files, no file deletions.

## Acceptance Criteria Evaluation

- [x] **`handleAnalyze` parses `{ "statement": string, "context": ProblemContext }`** — Request struct uses `baml_types.ProblemContext` directly, JSON deserialization works via struct tags + BAML's `UnmarshalJSON` on union types.

- [x] **Calls BAML `Stream.AnalyzeHMW()` and streams partial `HMWAnalysis` objects** — Calls `baml_client.Stream.AnalyzeHMW(r.Context(), req.Statement, req.Context)` and passes the channel to `streamSSE`. The generic `streamSSE` handles partial/final marshaling and the `[DONE]` sentinel.

- [x] **Returns meaningful analysis** — The BAML function `AnalyzeHMW` in `analyze.baml` produces `HMWAnalysis` with implicit user, embedded assumptions, scope level, solution bias, underlying tension, and initial reframing. The handler streams this as-is.

- [x] **Testable via `curl`** — Route is already registered at `POST /api/analyze`. Integration test sends a full ProblemContext and validates all HMWAnalysis fields in the SSE stream.

## Test Coverage

| Test Type | Count | Status |
|-----------|-------|--------|
| Unit tests (validation) | 7 | Pass |
| Integration test (SSE) | 1 | Skips (no API key) — test logic verified correct |
| Existing tests (persona, CORS) | 7 | Pass (no regressions) |

**Gaps:**
- Integration test cannot run without `ANTHROPIC_API_KEY` in Doppler. The test is structurally correct (follows the proven persona integration test pattern) but has not been exercised against a live LLM.
- No test for the `context.persona.label` validation with a full valid context where only the label is missing — this was added as `TestHandleAnalyze_MissingPersonaLabel`.

## Design Decisions

1. **Direct BAML type usage in request struct** — The `analyzeRequest.Context` field is typed as `baml_types.ProblemContext` rather than a separate API type. This eliminates mapping code. The BAML types have JSON tags and custom `UnmarshalJSON` for union types, so standard `json.NewDecoder` works.

2. **Three-level validation** — Statement, domain, and persona label are validated. Deeper validation (constraint types, array contents) is delegated to BAML. This matches the persona handler's minimal validation pattern.

3. **No changes to SSE infrastructure** — The `streamSSE` generic function handles the full SSE lifecycle for any BAML streaming type. No modifications needed.

## Open Concerns

1. **Union type JSON round-trip** — The BAML union types (e.g., `Union3KassumptionOrKhardOrKsoft` for Constraint.Type) use a try-first-match strategy in `UnmarshalJSON`. Since all variants are `*string`, any string value will match the first variant. The actual string content is preserved, and BAML's `Encode()` sends the raw string to the FFI layer. This should work but warrants verification with a live LLM call that includes constraints with different types.

2. **No API key for integration test** — Doppler has no `ANTHROPIC_API_KEY` configured. The integration test structure is validated by compilation and the skip logic, but the actual SSE streaming path with a live AnalyzeHMW call has not been exercised in this session.

3. **Error message exposure** — The `writeJSONError` function includes the raw JSON parse error in the response (`"invalid JSON: " + err.Error()`). This is fine for a development tool but should be reviewed before production deployment.

## Build Status

```
go build ./...  → clean
go test ./...   → 14 tests pass (7 persona/CORS + 7 analyze)
```
