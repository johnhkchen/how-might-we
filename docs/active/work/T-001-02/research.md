# Research: T-001-02 SSE Handler Pattern + Persona Endpoint

## Scope

Implement the SSE streaming handler pattern in `handlers.go` and wire up `/api/persona` as the first real endpoint, establishing the pattern all other endpoints will follow.

## Current State

### backend/handlers.go

Four stub handlers exist, each returning `501 Not Implemented`:
- `handlePersona` — POST /api/persona `{ "rawInput": string }`
- `handleAnalyze` — POST /api/analyze `{ "statement": string, "context": ProblemContext }`
- `handleExpand` — POST /api/expand `{ "analysis": HMWAnalysis, "context": ProblemContext }`
- `handleRefine` — POST /api/refine `{ "session": HMWSession }`

All four follow the same lifecycle: parse JSON input, call BAML streaming function, send SSE partials, send `[DONE]`.

### BAML Streaming API (Generated Client)

The generated client in `backend/baml_client/functions_stream.go` exposes:

```go
baml_client.Stream.RefinePersona(ctx, rawInput) -> (<-chan StreamValue[stream_types.Persona, types.Persona], error)
```

`StreamValue[TStream, TFinal]` has:
- `IsError bool` + `Error error` — stream-level error
- `IsFinal bool` — true when the final parsed result is available
- `Stream() *TStream` — partial (pointer fields, all nullable)
- `Final() *TFinal` — final complete result (non-pointer fields)

Both `stream_types.Persona` and `types.Persona` carry `json` tags and serialize cleanly via `encoding/json`.

Key observations:
- The channel is closed by the goroutine inside the BAML client after either an error or all data is sent.
- Partial values (`stream_types.Persona`) have all pointer fields (`*string`, `[]string`) — fields arrive as they're parsed.
- Final values (`types.Persona`) have concrete fields (`string`, `[]string`).
- Errors come as `StreamValue` items with `IsError: true`, then the channel closes.

### SSE Protocol (Frontend Consumer)

`frontend/src/lib/api/stream.ts` (`streamFromAPI<T>`) expects:
- Response content type: `text/event-stream`
- Each chunk: `data: {json}\n\n`
- Terminator: `data: [DONE]\n\n`
- Partials are parsed as `Partial<T>` (all fields optional) and passed to `onPartial` callback.
- Non-200 responses throw based on `response.status`.

The frontend splits on `\n\n`, strips `data: ` prefix, and JSON-parses each non-`[DONE]` line. No `event:` or `id:` fields are used — bare SSE data lines only.

### Go HTTP Streaming Requirements

- `http.ResponseWriter` must implement `http.Flusher` to push data before response completes.
- SSE headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`.
- After writing each `data: ...\n\n` chunk, call `flusher.Flush()`.
- Use `r.Context()` to detect client disconnects (context cancellation).

### CORS Middleware

`middleware.go` already sets `Access-Control-Allow-Origin: *` and handles OPTIONS preflight. No changes needed for SSE.

### main.go Routing

Routes are registered with Go 1.22+ method-pattern routing: `mux.HandleFunc("POST /api/persona", handlePersona)`. No changes needed.

### Dependencies

- `backend/go.mod`: already has `github.com/boundaryml/baml v0.218.0`
- `encoding/json` from stdlib — needed for marshal/unmarshal
- No additional dependencies needed

## Constraints

1. **Backend is stateless.** No session storage; just parse, call BAML, stream, done.
2. **Two concurrent agents.** This ticket touches only `backend/` — no frontend files.
3. **Pattern must be reusable.** The SSE streaming loop for persona will be nearly identical for analyze, expand, refine. The handler pattern should be extractable.
4. **No direct LLM calls.** All LLM interaction goes through the BAML generated client.
5. **Error handling.** 400 for bad input (invalid JSON, missing fields), 500 for BAML/stream errors. Once SSE headers are sent, errors must go through the SSE stream (can't change status code).

## Key Observations

1. All four endpoints share the same structure: decode input -> call `Stream.X()` -> loop channel -> write SSE -> `[DONE]`. The variation is only in the input type and the BAML function called.
2. The stream types use pointer fields for partials and concrete fields for finals — both serialize correctly with `encoding/json` (pointer nil -> omitted or null depending on `omitempty`).
3. The frontend only cares about the JSON shape, not whether it's a partial or final. Partials have nullable fields; final has all fields populated.
4. `http.Flusher` assertion is needed — standard `http.ResponseWriter` from `net/http` supports it, but wrapping middleware could break it. The CORS middleware passes through `ServeHTTP` without wrapping the writer, so flushing works.
5. Context cancellation from `r.Context()` is the correct way to detect client disconnects during streaming.
6. Once SSE headers are written (200 status), we can't change the status code. BAML errors after stream start should be logged but not surfaced as HTTP errors.
