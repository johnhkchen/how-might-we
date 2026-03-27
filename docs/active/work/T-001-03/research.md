# Research: T-001-03 verify-persona-endpoint

## Ticket Summary

Verify the persona endpoint works end-to-end: start the Go server locally with `doppler run`, hit it with `curl --no-buffer`, and confirm that BAML streaming flows through the Go HTTP handler to the client as SSE events containing progressively more complete Persona JSON. Also verify CORS headers.

## Relevant Files

### Backend Entry Point
- **backend/main.go** — Registers `POST /api/persona` → `handlePersona`, wraps all routes in `corsMiddleware`, listens on `:8080` (or `$PORT`). No Lambda adapter present yet — pure `http.ListenAndServe`.

### Handler Implementation
- **backend/handlers.go** — `handlePersona` decodes `{"rawInput": string}`, validates non-empty, calls `baml_client.Stream.RefinePersona(r.Context(), req.RawInput)`, then delegates to `streamSSE(w, r, ch)`. Three other handlers (analyze, expand, refine) are stubs returning 501.

### SSE Streaming
- **backend/sse.go** — Generic `streamSSE[TStream, TFinal any]` that:
  1. Asserts `http.Flusher` support
  2. Sets headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`
  3. Iterates channel: marshals each partial/final as `data: {json}\n\n`, flushes
  4. Sends `data: [DONE]\n\n` sentinel on completion
  5. Handles errors by logging and aborting (no error events sent to client)
- Also contains `writeJSONError` for pre-stream HTTP error responses.

### CORS Middleware
- **backend/middleware.go** — Sets `Access-Control-Allow-Origin: *`, `Allow-Methods: POST, OPTIONS`, `Allow-Headers: Content-Type`. Handles OPTIONS preflight with 204.

### BAML Configuration
- **backend/baml_src/persona.baml** — `RefinePersona(rawInput: string) -> Persona` using `Claude` client. Prompt: turn rough persona text into structured Persona.
- **backend/baml_src/clients.baml** — `Claude` client: `anthropic` provider, `claude-sonnet-4-6` model, `env.ANTHROPIC_API_KEY`, max 4096 tokens. Retry: 2 retries, exponential backoff 500ms.
- **backend/baml_src/types.baml** — `Persona` class: `label`, `role`, `goals[]`, `frustrations[]`, `context`, `influencers[]`.

### Generated BAML Client
- **backend/baml_client/functions_stream.go** — `Stream.RefinePersona` returns `<-chan StreamValue[stream_types.Persona, types.Persona]`. Channel emits partial values (`IsFinal=false`, `as_stream`) followed by a final value (`IsFinal=true`, `as_final`), then closes.
- **backend/baml_client/types/classes.go** — `types.Persona`: all fields are non-optional (`string`, `[]string`).
- **backend/baml_client/stream_types/classes.go** — `stream_types.Persona`: all scalar fields are `*string`, slices are `[]string` (nullable during streaming since fields arrive incrementally).

### Existing Tests
- **backend/handlers_test.go** — 5 unit tests for input validation (empty body, bad JSON, missing/empty/whitespace rawInput). All return 400. No streaming output tests.

### Secrets Management
- Doppler injects `ANTHROPIC_API_KEY` at runtime via `doppler run --`.
- BAML reads `env.ANTHROPIC_API_KEY` from the process environment.

## Data Flow (End-to-End)

```
curl POST /api/persona {"rawInput":"..."}
  → corsMiddleware (adds CORS headers)
  → handlePersona (decode + validate)
  → baml_client.Stream.RefinePersona(ctx, rawInput)
  → BAML runtime → Anthropic API (streaming)
  → channel of StreamValue[stream_types.Persona, types.Persona]
  → streamSSE: for each value → json.Marshal → "data: {json}\n\n" + Flush
  → "data: [DONE]\n\n" on channel close
  → curl receives SSE stream
```

## SSE Event Format (Expected)

Partial events (stream_types.Persona — nullable fields):
```
data: {"label":"Junior Des","role":null,"goals":null,"frustrations":null,"context":null,"influencers":null}
```

Final event (types.Persona — all fields populated):
```
data: {"label":"Junior Designer","role":"Product Designer","goals":["Run effective workshops"],"frustrations":["Lack of experience"],"context":"Mid-size SaaS company","influencers":["Design lead","Product manager"]}
```

Sentinel:
```
data: [DONE]
```

## CORS Headers (Expected)

All responses (including SSE streams) pass through `corsMiddleware`, so every response includes:
- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: POST, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type`

## Constraints & Assumptions

1. **Requires Doppler secrets.** `ANTHROPIC_API_KEY` must be available. Running without Doppler will cause BAML to fail at stream start time.
2. **Requires network access.** BAML calls the Anthropic API over HTTPS. No mock/stub path exists for the backend.
3. **Port 8080 must be free.** Server binds to `:8080` by default.
4. **httptest.ResponseRecorder doesn't support Flusher.** This is why existing tests only cover input validation. Testing the SSE path requires either a real HTTP server or a custom ResponseWriter that implements `http.Flusher`.
5. **Streaming is non-deterministic.** The number of partial events and their content varies per LLM call. Verification must check structure, not exact content.

## What This Ticket Does NOT Do

- Does not write new code (no handler changes, no new tests).
- Does not test the other three endpoints.
- Is a verification/smoke-test task: start server, curl, confirm output shape.
- The ticket is "done" when we can demonstrate the full flow works.

## Key Risk

The only real risk is if the BAML Go client or the Anthropic API integration has a runtime issue that wasn't caught by `go build` (e.g., missing CGO dependency, version mismatch, serialization bug). The code compiles and unit tests pass, but no integration test has run yet.
