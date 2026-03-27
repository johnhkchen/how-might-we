# Structure — T-002-03: refine-hmw-endpoint

## Files Modified

### `backend/handlers.go`
- Add `refineRequest` struct (line ~80, after `expandRequest`)
- Replace `handleRefine` stub (lines 126-129) with full implementation

```
type refineRequest struct {
    Session baml_types.HMWSession `json:"session"`
}
```

Handler flow:
1. `json.NewDecoder(r.Body).Decode(&req)` → 400 on error
2. Validate `req.Session.Context.Domain` → 400 if empty
3. Validate `req.Session.Context.Persona.Label` → 400 if empty
4. Validate `len(req.Session.Candidates) > 0` → 400 if empty
5. `baml_client.Stream.RefineHMW(r.Context(), req.Session)` → 500 on error
6. `streamSSE(w, r, ch)`

No new imports — `baml_types` and `baml_client` already imported.

### `backend/handlers_test.go`
Add test functions after the expand tests (~line 232):

- `TestHandleRefine_EmptyBody`
- `TestHandleRefine_InvalidJSON`
- `TestHandleRefine_MissingDomain`
- `TestHandleRefine_MissingPersonaLabel`
- `TestHandleRefine_EmptyCandidates`

Each test: construct request → call `handleRefine` → assert 400.

Add a `validSession` const with minimal valid JSON for reuse in tests.

### `backend/integration_test.go`
Add `TestRefineEndpoint_Integration` after the expand integration test (~line 365):

- Build a realistic `HMWSession` JSON with:
  - Full `ProblemContext` (domain, persona, constraints)
  - `analysis` with all fields
  - 3+ candidates: one SELECTED, one SKIPPED, one EDITED (with userEdits)
  - `iterationCount: 1`
- POST to test server
- Verify: 200, SSE content-type, CORS headers
- Parse SSE events, verify [DONE] sentinel
- Unmarshal final event as HMWRefinement
- Assert: `newVariants` non-empty, each variant has statement/moveType/rationale
- Assert: `tensions` non-empty
- Assert: `suggestedNextMove` non-nil and non-empty

## Files NOT Modified

- `backend/main.go` — route already registered
- `backend/sse.go` — generic, no changes needed
- `backend/middleware.go` — unchanged
- `backend/baml_src/*` — BAML function already defined
- `frontend/*` — out of scope (backend track)

## Module Boundaries

The handler is a thin adapter: JSON-in → BAML-call → SSE-out. No business logic in the handler. The BAML prompt handles all candidate filtering and response generation.
