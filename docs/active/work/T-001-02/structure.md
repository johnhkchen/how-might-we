# Structure: T-001-02 SSE Handler Pattern + Persona Endpoint

## Files Modified

### backend/handlers.go (MODIFY)

Replace the stub `handlePersona` with a full implementation. Keep the other three stubs unchanged (they'll be implemented in later tickets using the same pattern).

**Add:**
- `personaRequest` struct — `{ RawInput string "json:\"rawInput\"" }`
- `handlePersona` function — full implementation: decode JSON, validate, call BAML stream, delegate to `streamSSE`

**Remove:**
- The stub `handlePersona` body (`http.Error(w, "not implemented", ...)`)

**New imports needed:** `encoding/json`, `log`, BAML client packages

### backend/sse.go (CREATE)

New file containing the generic SSE streaming helper and error response utility.

**Contains:**
- `streamSSE[TStream, TFinal any](w, r, ch)` — generic SSE write loop
- `writeJSONError(w, message, statusCode)` — helper to write JSON error responses

This file has zero business logic — purely SSE protocol mechanics. Separating it from `handlers.go` keeps handler files focused on endpoint logic while the SSE machinery lives in one place.

### backend/handlers_test.go (CREATE)

Unit tests for handler input validation and SSE output format.

**Contains:**
- `TestHandlePersona_ValidInput` — verifies SSE headers and DONE sentinel using a mock approach
- `TestHandlePersona_EmptyBody` — verifies 400 on empty/missing body
- `TestHandlePersona_MissingRawInput` — verifies 400 on empty `rawInput`
- `TestHandlePersona_InvalidJSON` — verifies 400 on malformed JSON

Note: Full integration tests (hitting BAML) require Doppler secrets and are run separately via `doppler run -- go test ./...`. The unit tests here validate input parsing and error responses without needing BAML.

## Files NOT Modified

- `backend/main.go` — routes already registered, no changes needed
- `backend/middleware.go` — CORS already configured, passes through writer correctly
- `backend/baml_client/**` — generated code, never hand-edited
- `backend/baml_src/**` — BAML definitions unchanged
- `frontend/**` — separate track, not touched by this ticket

## Module Boundaries

```
handlers.go          → imports sse.go (streamSSE, writeJSONError)
                     → imports baml_client (Stream.RefinePersona, types)
sse.go              → imports baml_client (StreamValue generic type)
                     → imports encoding/json, net/http, log
handlers_test.go    → imports handlers.go (handlePersona)
                     → imports net/http/httptest
```

## Public Interface

The SSE helper is package-internal (unexported `streamSSE`). It's not exported because it's only used within the `main` package. If the backend ever splits into packages, it could be promoted.

`handlePersona` remains an unexported handler function, passed to `mux.HandleFunc` in `main.go`.

## Change Ordering

1. Create `backend/sse.go` with `streamSSE` and `writeJSONError` — compiles independently
2. Modify `backend/handlers.go` to implement `handlePersona` using the helpers
3. Create `backend/handlers_test.go` with unit tests
4. Verify `go build ./...` passes
5. Run unit tests
