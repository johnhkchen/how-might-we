# Plan: T-001-03 verify-persona-endpoint

## Step 1: Add CORS Middleware Tests

**File:** `backend/handlers_test.go`
**What:** Add `TestCORS_HeadersPresent` and `TestCORS_Preflight` tests.
**Verify:** `go test ./...` passes with 7 tests total (5 existing + 2 new).

## Step 2: Add SSE Unit Test

**File:** `backend/sse_test.go` (new)
**What:** `TestStreamSSE_Format` — create a `httptest.NewServer` with a handler that:
1. Creates a `chan baml_client.StreamValue[testStream, testFinal]` (using simple local types)
2. Pushes 2 partial values and 1 final value, then closes the channel
3. Calls `streamSSE(w, r, ch)`

Actually — `streamSSE` is generic but requires `baml_client.StreamValue`. We need to check if we can instantiate `StreamValue` with arbitrary types. Looking at the struct definition in `functions_stream.go`:

```go
type StreamValue[TStream any, TFinal any] struct {
    IsError   bool
    Error     error
    IsFinal   bool
    as_final  *TFinal    // unexported
    as_stream *TStream   // unexported
}
```

The `as_final` and `as_stream` fields are **unexported**. We cannot construct a `StreamValue` with populated stream/final values from outside the `baml_client` package. The `Final()` and `Stream()` methods return these unexported fields.

**Revised approach:** Instead of testing `streamSSE` directly, write an HTTP-level test that creates an `httptest.NewServer` wrapping the full `corsMiddleware(mux)` handler. For the SSE format test, we'll use the integration test only. For a unit-level test, we can test a simpler version: test that the server correctly rejects bad input and returns proper content type by testing against the actual handler. The SSE format verification will be part of the integration test.

**Revised Step 2:** Write a helper test that verifies the SSE behavior using the real server but with known input. Since `streamSSE`'s internals aren't testable without BAML (unexported fields), we'll fold the SSE verification into the integration test.

## Step 2 (Revised): Add Integration Test

**File:** `backend/integration_test.go` (new)
**What:** Build-tagged test `TestPersonaEndpoint_Integration`:
1. Start `httptest.NewServer` with `corsMiddleware(mux)` where mux has the persona route
2. POST `{"rawInput": "junior designer at a SaaS company"}`
3. Read response line by line with `bufio.Scanner`
4. Assert:
   - `Content-Type` header starts with `text/event-stream`
   - `Access-Control-Allow-Origin: *` header present
   - Each non-empty line starts with `data: `
   - At least 2 data lines (at least one partial + `[DONE]`)
   - The last data line before `[DONE]` parses as JSON with all Persona fields
   - Stream ends with `data: [DONE]`
5. Timeout: 60s test timeout

**Verify:** `doppler run -- go test -tags integration -timeout 60s -v ./...`

## Step 3: Run Manual curl Verification

**What:** Start server with `doppler run -- go run main.go`, curl the endpoint, capture output.
**Verify:** Visually inspect streaming SSE output. Record in progress.md.

## Step 4: Verify All Tests Pass

**What:** Run the full test suite.
- `go test ./...` (unit tests — must pass without secrets)
- `doppler run -- go test -tags integration -timeout 60s -v ./...` (integration — requires Doppler)
- `go build ./...` (clean build)
- `go vet ./...` (static analysis)

## Testing Strategy

| Test | Type | Secrets? | What it covers |
|------|------|----------|----------------|
| `TestHandlePersona_*` (5) | Unit | No | Input validation |
| `TestCORS_*` (2) | Unit | No | CORS middleware headers |
| `TestPersonaEndpoint_Integration` | Integration | Yes | Full SSE streaming, CORS, Persona JSON shape |
| Manual curl | Manual | Yes | Visual confirmation of streaming behavior |

## Commit Plan

1. **Commit 1:** Add CORS tests to `handlers_test.go`
2. **Commit 2:** Add `integration_test.go` with build tag
3. **Commit 3:** Record verification results in progress.md
