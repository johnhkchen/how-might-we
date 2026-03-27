# Review — T-002-03: refine-hmw-endpoint

## Summary of Changes

### Files Modified

| File | Change |
|------|--------|
| `backend/handlers.go` | Replaced `handleRefine` stub with full implementation: `refineRequest` struct, JSON decode, validation (domain, persona.label, candidates), BAML streaming call |
| `backend/handlers_test.go` | Added 5 unit tests for input validation: empty body, invalid JSON, missing domain, missing persona label, empty candidates |
| `backend/integration_test.go` | Added `TestRefineEndpoint_Integration` with realistic session payload, SSE stream verification, final HMWRefinement shape validation |

### Files NOT Modified
- `main.go` — route was already registered
- `sse.go` — generic streaming helper, unchanged
- `middleware.go` — CORS middleware, unchanged
- `baml_src/*` — BAML function already defined and generated

## Acceptance Criteria Verification

- [x] `handleRefine` parses `{ "session": HMWSession }` from request body — via `refineRequest` struct with `json:"session"` tag
- [x] Calls BAML `Stream.RefineHMW()` and streams partial `HMWRefinement` objects — `baml_client.Stream.RefineHMW(r.Context(), req.Session)` → `streamSSE(w, r, ch)`
- [x] New variants reflect the direction of selected/edited candidates — handled by BAML prompt template (filters candidates by status)
- [x] Tensions and recommendations appear in later partials — `HMWRefinement` struct has `Tensions []string`, `Recommendation *string`, `SuggestedNextMove *string`; these populate progressively in the stream
- [x] `suggestedNextMove` provides actionable guidance — validated in integration test (non-nil, non-empty)

## Test Coverage

**Unit tests (5 new, 25 total):**
- All input validation paths covered (empty body, malformed JSON, missing required fields, empty candidates)
- Tests follow the exact pattern of existing persona/analyze/expand tests

**Integration test (1 new, 4 total):**
- Exercises the full handler → BAML → LLM → SSE path
- Validates SSE protocol (content-type, events, [DONE] sentinel)
- Validates final response shape (newVariants, tensions, suggestedNextMove)
- Validates partial events are valid JSON
- Requires `ANTHROPIC_API_KEY` environment variable (auto-skips without it)

**Coverage gaps:**
- No unit test for the BAML stream error path (would require mocking `baml_client.Stream`, which the existing codebase doesn't do for any endpoint)
- Integration test is not run in standard CI (requires API key + `integration` build tag)

## Implementation Notes

- The handler is ~35 lines — identical pattern to the three existing handlers
- Validation covers only fields the BAML prompt actually references: `session.context.domain`, `session.context.persona.label`, and `session.candidates` length
- `iterationCount` defaults to 0 via Go zero-value, which is valid for first-pass refinement
- `session.analysis` is optional (pointer) per the BAML type definition — the prompt doesn't reference it directly

## Open Concerns

- **None blocking.** This is a straightforward endpoint following established patterns.
- The integration test depends on LLM output quality (assertions like "tensions is non-empty" could theoretically fail if the LLM produces an empty tensions array). This is the same risk as the existing expand integration test.
