# Structure: T-001-03 verify-persona-endpoint

## File Changes

### New Files

#### `backend/sse_test.go`
SSE unit test that validates `streamSSE` serialization without external dependencies.

- `TestStreamSSE_Format` — Creates a channel, pushes synthetic partial + final `StreamValue` items, verifies:
  - Each line starts with `data: `
  - Partial events contain valid JSON
  - Final event contains valid JSON with expected fields
  - Last event is `data: [DONE]`
  - Correct number of events emitted

Uses `httptest.NewServer` with a handler that calls `streamSSE`, then reads the response body line by line.

#### `backend/integration_test.go`
Build-tagged integration test for the full persona endpoint.

- Build tag: `//go:build integration`
- `TestPersonaEndpoint_Integration` — Starts the real HTTP server, POSTs to `/api/persona`, reads SSE stream:
  - Asserts `Content-Type: text/event-stream`
  - Asserts CORS headers present (`Access-Control-Allow-Origin`)
  - Parses each `data:` line as JSON
  - Validates final Persona has all required fields (label, role, goals, frustrations, context, influencers)
  - Validates stream ends with `[DONE]`
  - Has reasonable timeout (30s) to prevent hanging on API issues

### Modified Files

#### `backend/handlers_test.go`
Add a CORS test to verify that the middleware adds expected headers on regular POST responses.

- `TestCORS_HeadersPresent` — Sends a POST to the server through `corsMiddleware`, asserts all three CORS headers are present.
- `TestCORS_Preflight` — Sends OPTIONS, asserts 204 and headers.

### No Other File Changes

- `handlers.go` — No changes. Already complete.
- `sse.go` — No changes. Already complete.
- `middleware.go` — No changes. Already complete.
- `main.go` — No changes.
- `baml_src/**` — No changes.
- `frontend/**` — Out of scope (backend track).

## Module Boundaries

```
backend/
├── sse_test.go              # NEW — SSE serialization unit test
├── integration_test.go      # NEW — Full-stack integration test (build-tagged)
├── handlers_test.go         # MODIFIED — Add CORS middleware tests
├── handlers.go              # unchanged
├── sse.go                   # unchanged
├── middleware.go             # unchanged
└── main.go                  # unchanged
```

## Interface Notes

- `streamSSE` is already generic over `[TStream, TFinal any]`. The unit test can use simple structs (e.g., `struct{ Name *string }` for stream, `struct{ Name string }` for final) rather than importing BAML types.
- Actually, looking more closely: `streamSSE` requires `<-chan baml_client.StreamValue[TStream, TFinal]`. Since `StreamValue` has `IsError`, `IsFinal`, `Final()`, `Stream()` — we must use the actual BAML type. We can construct `StreamValue` instances manually by writing values to the channel.
- The integration test uses `net/http` client with `resp.Body` as an `io.Reader`, reading lines with `bufio.Scanner`.

## Test Execution

```bash
# Unit tests (no secrets needed)
cd backend && go test ./...

# Integration tests (requires Doppler secrets)
cd backend && doppler run -- go test -tags integration -timeout 60s ./...
```
