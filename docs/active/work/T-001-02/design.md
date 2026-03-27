# Design: T-001-02 SSE Handler Pattern + Persona Endpoint

## Problem

Implement `handlePersona` as a working SSE streaming endpoint and establish a reusable pattern for the other three handlers. The core loop (parse JSON -> call BAML stream -> write SSE events -> send DONE) is identical across all endpoints; only the input type and BAML function vary.

## Options Considered

### Option A: Inline Implementation Per Handler

Each handler contains the full SSE logic: decode input, set headers, assert flusher, range over channel, marshal, write, flush.

**Pros:** Simple, no abstractions, easy to read each handler in isolation.
**Cons:** ~40 lines of identical boilerplate per handler (SSE headers, flusher assertion, channel loop, error formatting, DONE sentinel). Four handlers = significant duplication that invites inconsistency.

### Option B: Generic SSE Helper Function

Extract a generic helper: `streamSSE[TStream, TFinal any](w, r, channel)` that handles the SSE write loop. Each handler parses its own input, calls the BAML stream function, then delegates to `streamSSE`.

**Pros:** Eliminates duplication of the SSE loop. Each handler stays focused on its input parsing and BAML call. Type-safe via generics. Easy to test the SSE mechanism independently.
**Cons:** Go generics require the stream/final types to be serializable, but they already have `json` tags so this works. Slightly more indirection.

### Option C: Table-Driven Handler Factory

Define a config struct per endpoint (path, input type, BAML call) and generate handlers from a registry. A single factory function produces all four handlers.

**Pros:** Maximum DRY. Adding a new endpoint is just a config entry.
**Cons:** Over-abstracted for four endpoints. The input types and BAML signatures differ enough that the factory would need complex generics or `any` casting. Harder to read and debug. Premature abstraction.

## Decision: Option B — Generic SSE Helper

Option B hits the right balance. The SSE write loop is genuinely identical across all four endpoints (same headers, same flush pattern, same DONE sentinel, same error handling). Extracting it into a typed helper eliminates the duplication without hiding the handler-specific logic.

Each handler remains a short, readable function: parse input, call BAML, pass channel to `streamSSE`. The helper is a pure mechanical function with no business logic.

Option A was rejected because four copies of the SSE loop is a real maintenance risk — a protocol change (e.g., adding `event:` types) would require updating all four. Option C was rejected because the input parsing varies enough that a factory adds complexity without meaningful benefit.

## SSE Helper Design

```go
func streamSSE[TStream, TFinal any](
    w http.ResponseWriter,
    r *http.Request,
    ch <-chan baml_client.StreamValue[TStream, TFinal],
)
```

Responsibilities:
1. Set SSE headers (`Content-Type`, `Cache-Control`, `Connection`)
2. Assert `http.Flusher`
3. Range over channel:
   - `IsError` → log error, break (can't send HTTP error after headers)
   - `IsFinal` → marshal `Final()`, write `data: {json}\n\n`, flush
   - else → marshal `Stream()`, write `data: {json}\n\n`, flush
4. Send `data: [DONE]\n\n`, flush
5. Respect `r.Context().Done()` for client disconnects

## Error Handling Strategy

Two error zones:

**Before SSE headers are sent** (input parsing, BAML channel creation):
- Invalid JSON / missing fields → 400 with JSON error body
- BAML `Stream.RefinePersona()` returns error → 500 with JSON error body

**After SSE headers are sent** (during stream):
- `StreamValue.IsError` → log server-side, stop streaming (client sees incomplete stream)
- Client disconnect → context cancelled, stop reading channel
- Marshal failure → log server-side, skip event (shouldn't happen with generated types)

## Input Validation

For `/api/persona`, the input is `{ "rawInput": string }`. Validation:
- Body must be valid JSON → 400
- `rawInput` must be present and non-empty → 400
- No max length check needed (BAML/LLM will handle appropriately)

## Handler Structure (handlePersona)

```
1. Decode JSON body into personaRequest struct
2. Validate rawInput is non-empty
3. Call baml_client.Stream.RefinePersona(r.Context(), req.RawInput)
4. If error → 500
5. Call streamSSE(w, r, channel)
```

## Testing Strategy

- Unit test for `streamSSE` using a fake channel and `httptest.ResponseRecorder`
- Unit test for `handlePersona` input validation (400 cases)
- Integration test for full handler (requires BAML runtime — will need `doppler run`)
- Build verification: `go build ./...` must pass
