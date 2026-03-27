# Plan: T-001-02 SSE Handler Pattern + Persona Endpoint

## Step 1: Create backend/sse.go

Create the SSE helper file with two functions:

**`writeJSONError(w http.ResponseWriter, message string, code int)`**
- Set `Content-Type: application/json`
- Write status code
- Encode `{"error": message}` as JSON

**`streamSSE[TStream, TFinal any](w http.ResponseWriter, r *http.Request, ch <-chan baml_client.StreamValue[TStream, TFinal])`**
- Set SSE headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`
- Assert `w.(http.Flusher)` — if fails, fall back to 500 error
- Flush headers immediately
- Range over channel with select on `r.Context().Done()`:
  - `IsError` → log error, return
  - `IsFinal` → marshal `Final()`, write `data: {json}\n\n`, flush
  - else (partial) → marshal `Stream()`, write `data: {json}\n\n`, flush
- After loop: write `data: [DONE]\n\n`, flush

**Verification:** `go build ./...` compiles

## Step 2: Implement handlePersona in backend/handlers.go

Define `personaRequest` struct with `RawInput string` json-tagged.

Replace stub `handlePersona`:
1. `json.NewDecoder(r.Body).Decode(&req)` — 400 on error
2. Validate `req.RawInput != ""` — 400 on empty
3. `baml_client.Stream.RefinePersona(r.Context(), req.RawInput)` — 500 on error
4. `streamSSE(w, r, ch)`

Update imports to include `encoding/json`, `log`, and BAML client packages.

**Verification:** `go build ./...` compiles

## Step 3: Create backend/handlers_test.go

Unit tests for input validation (these don't need BAML/Doppler):

- `TestHandlePersona_EmptyBody` — POST with empty body → 400
- `TestHandlePersona_InvalidJSON` — POST with `{bad` → 400
- `TestHandlePersona_MissingRawInput` — POST with `{}` → 400
- `TestHandlePersona_EmptyRawInput` — POST with `{"rawInput":""}` → 400

These use `httptest.NewRecorder()` and `http.NewRequest`.

Note: The handler will return 500 when it tries to call BAML without a runtime, but the validation tests short-circuit before reaching BAML. Tests that exercise the full BAML stream require Doppler secrets and are integration tests.

**Verification:** `go test ./...` (unit tests pass, integration skipped without Doppler)

## Step 4: Build and Test

- Run `go build ./...` — must compile clean
- Run `go test -run TestHandlePersona ./...` — validation tests must pass
- Run `go vet ./...` — no issues

## Step 5: Verify SSE Output Format

Manual check: review that `streamSSE` produces the exact format the frontend expects:
- `data: {"label":"...","role":"...",...}\n\n` for each partial/final
- `data: [DONE]\n\n` at the end
- Correct headers set

## Testing Strategy

| Test | Type | Needs Doppler | Automated |
|------|------|--------------|-----------|
| Empty body → 400 | Unit | No | Yes |
| Invalid JSON → 400 | Unit | No | Yes |
| Missing rawInput → 400 | Unit | No | Yes |
| Empty rawInput → 400 | Unit | No | Yes |
| Full stream e2e | Integration | Yes | `doppler run -- go test` |
| Build compiles | Build | No | `go build ./...` |
