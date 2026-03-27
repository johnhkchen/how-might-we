# Review: T-001-02 SSE Handler Pattern + Persona Endpoint

## Summary of Changes

### Files Created
- **backend/sse.go** — Generic SSE streaming helper (`streamSSE`) and JSON error utility (`writeJSONError`). 66 lines.
- **backend/handlers_test.go** — Unit tests for `handlePersona` input validation. 5 test cases.

### Files Modified
- **backend/handlers.go** — Replaced `handlePersona` stub with full implementation. Added `personaRequest` struct, JSON decoding, input validation, BAML streaming call, and SSE delegation. Other three handler stubs unchanged.

### Files Not Modified
- `main.go` — routes already registered
- `middleware.go` — CORS already correct
- `baml_client/**` — generated, never hand-edited
- `frontend/**` — separate track

## Acceptance Criteria Verification

| Criterion | Status | Evidence |
|-----------|--------|----------|
| `handlePersona` parses `{ "rawInput": string }` | Done | `personaRequest` struct with JSON decode, handlers.go:19 |
| Sets correct SSE headers | Done | `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive` in sse.go:29-31 |
| Calls BAML `Stream.RefinePersona()` with request context | Done | `baml_client.Stream.RefinePersona(r.Context(), req.RawInput)` in handlers.go:29 |
| Streams each partial as `data: {json}\n\n` and flushes | Done | `streamSSE` loop marshals and flushes each value, sse.go:35-61 |
| Sends `data: [DONE]\n\n` when stream completes | Done | sse.go:64 |
| Returns 400 on invalid input, 500 on BAML errors | Done | 400 for bad JSON/missing input (handlers.go:20,25), 500 for BAML start error (handlers.go:31) |
| Handler pattern is extractable for reuse | Done | `streamSSE` is a generic function — other handlers call it identically |

## Test Coverage

### Unit Tests (5/5 passing)
- `TestHandlePersona_EmptyBody` — nil body → 400
- `TestHandlePersona_InvalidJSON` — malformed JSON → 400
- `TestHandlePersona_MissingRawInput` — empty object → 400
- `TestHandlePersona_EmptyRawInput` — empty string → 400
- `TestHandlePersona_WhitespaceRawInput` — whitespace-only → 400

### Build Verification
- `go build ./...` — clean
- `go vet ./...` — clean

### Coverage Gaps
- **No SSE output format test.** The `streamSSE` function is not tested in isolation because creating a fake BAML `StreamValue` channel requires importing the BAML client generics. This could be added with a test helper that feeds synthetic values into a channel. Low risk since the SSE format is trivial (`fmt.Fprintf`).
- **No integration test.** Full end-to-end streaming requires BAML runtime + Anthropic API key (via Doppler). This is by design — unit tests validate the handler logic; integration tests run separately with `doppler run -- go test ./...`.

## Architecture Notes

- `streamSSE` is generic over `[TStream, TFinal any]`. The other three handlers (analyze, expand, refine) will call it identically once implemented.
- Error handling has two zones: pre-SSE (HTTP status codes) and post-SSE (log + abort stream). This is the correct pattern for SSE — once headers are sent, you can't change the status code.
- Client disconnect detection uses `r.Context().Done()` checked at the top of each iteration.

## Open Concerns

1. **Channel draining on early return.** When the client disconnects or a BAML error occurs, `streamSSE` returns without draining the remaining channel. The BAML client's internal goroutine will close the channel when it finishes, and the garbage collector will clean up. This is safe because the channel is not shared.

2. **No `event:` field in SSE.** The frontend parser only uses `data:` lines. If we later need to distinguish event types (partial vs. final vs. error), we'd add `event:` prefixes. Not needed now.

3. **Error message exposure.** BAML stream errors are logged server-side but not forwarded to the client. The client sees a truncated stream. This is intentional — internal errors shouldn't leak to users. A future ticket could add a structured error event if needed.

4. **Other three handlers remain stubs.** This ticket only implements `handlePersona`. The other endpoints (analyze, expand, refine) will follow the same pattern in subsequent tickets.
