# Review: T-001-03 verify-persona-endpoint

## Summary of Changes

### Files Created
- **backend/integration_test.go** — Build-tagged (`//go:build integration`) end-to-end test for the persona endpoint. Starts an httptest.Server, POSTs persona input, reads SSE stream, validates: Content-Type, CORS headers, JSON structure of partials, final Persona completeness, and [DONE] sentinel. Skips when `ANTHROPIC_API_KEY` is not set. ~60 lines.

### Files Modified
- **backend/handlers_test.go** — Added 2 CORS middleware tests:
  - `TestCORS_HeadersPresent` — POST through corsMiddleware, asserts all 3 CORS headers
  - `TestCORS_Preflight` — OPTIONS request, asserts 204 + CORS headers
- **backend/handlers.go** — Added `log.Printf` for BAML stream errors in `handlePersona` (was silently swallowed). Added `log` import.

### Files Not Modified
- `main.go` — No changes needed
- `sse.go` — No changes needed
- `middleware.go` — No changes needed
- `baml_client/**` — Generated, never hand-edited
- `frontend/**` — Separate track

## Acceptance Criteria Verification

| Criterion | Status | Evidence |
|-----------|--------|----------|
| `go run .` starts server on `:8080` without errors | ✅ Pass | Manual verification: server starts, logs "Starting HMW Workshop API on :8080" |
| curl returns streaming SSE events | ⚠️ Blocked | ANTHROPIC_API_KEY not configured in Doppler. Integration test written and ready. |
| Each SSE event contains progressively more complete Persona JSON | ⚠️ Blocked | Same — integration test validates this when key is available |
| Final event before [DONE] contains complete Persona with all required fields | ⚠️ Blocked | Integration test checks all 6 fields: label, role, goals, frustrations, context, influencers |
| CORS headers are present in response | ✅ Pass | Verified via curl and 2 new unit tests |

## Test Coverage

### Unit Tests (7/7 passing)
- `TestHandlePersona_EmptyBody` — nil body → 400
- `TestHandlePersona_InvalidJSON` — malformed JSON → 400
- `TestHandlePersona_MissingRawInput` — empty object → 400
- `TestHandlePersona_EmptyRawInput` — empty string → 400
- `TestHandlePersona_WhitespaceRawInput` — whitespace-only → 400
- `TestCORS_HeadersPresent` — POST response has all 3 CORS headers (**new**)
- `TestCORS_Preflight` — OPTIONS returns 204 with CORS headers (**new**)

### Integration Tests (1 — skips without API key)
- `TestPersonaEndpoint_Integration` — Full SSE streaming validation (**new**, requires `ANTHROPIC_API_KEY`)

### Build Verification
- `go build ./...` — clean
- `go vet ./...` — clean
- `go test ./...` — 7/7 pass
- `go test -tags integration ./...` — skips gracefully

## Code Quality Improvements
- **Error logging:** `handlePersona` now logs the actual BAML error before returning 500. Previously, the error was swallowed and the only output was the generic "failed to start persona stream" message. This makes debugging significantly easier.

## Open Concerns

### 1. ANTHROPIC_API_KEY Not Configured (Critical)
The Doppler `dev` config has no `ANTHROPIC_API_KEY`. This blocks:
- The integration test
- Any manual curl verification of streaming
- All four BAML-powered endpoints

**Action required:** Run `doppler secrets set ANTHROPIC_API_KEY` and provide the key interactively. Then re-run: `doppler run -- go test -tags integration -timeout 60s -v ./...`

### 2. StreamValue Unexported Fields
`baml_client.StreamValue` has unexported fields (`as_final`, `as_stream`), making it impossible to construct test values outside the `baml_client` package. This means `streamSSE` cannot be unit-tested in isolation — only integration-tested. This is acceptable given the function is simple (just `json.Marshal` + `fmt.Fprintf`), but it's a design limitation of the BAML generated client.

### 3. No Error Event in SSE
When BAML encounters an error mid-stream, the server logs it and aborts. The client sees a truncated stream with no error event. This is noted in T-001-02's review as well. A future enhancement could add `event: error` SSE events.

### 4. Other Three Handlers Still Stubs
`handleAnalyze`, `handleExpand`, and `handleRefine` return 501. These will be implemented in subsequent tickets.

## What a Human Reviewer Should Check

1. **Set the API key** and run `doppler run -- go test -tags integration -timeout 60s -v ./...` to confirm the full E2E works.
2. The log.Printf addition to handlers.go is a minor improvement — verify it doesn't expose sensitive information (it doesn't — it only logs the BAML error message, not the API key).
3. The integration test assertions are structural (field existence + non-empty) rather than content-based, which is correct for non-deterministic LLM output.
