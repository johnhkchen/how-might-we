# Plan — T-002-01: analyze-hmw-endpoint

## Step 1: Implement handleAnalyze

**File:** `backend/handlers.go`

1. Add import for `baml_types "github.com/hmw-workshop/backend/baml_client/types"`
2. Add `analyzeRequest` struct above `handleAnalyze`:
   ```go
   type analyzeRequest struct {
       Statement string                    `json:"statement"`
       Context   baml_types.ProblemContext  `json:"context"`
   }
   ```
3. Replace the `handleAnalyze` body with:
   - Decode JSON body into `analyzeRequest`
   - Validate `req.Statement` is non-empty (trimmed)
   - Validate `req.Context.Domain` is non-empty (trimmed)
   - Validate `req.Context.Persona.Label` is non-empty (trimmed)
   - Call `baml_client.Stream.AnalyzeHMW(r.Context(), req.Statement, req.Context)`
   - On error, log and return 500
   - Call `streamSSE(w, r, ch)`

**Verify:** `cd backend && go build ./...`

## Step 2: Add unit tests for handleAnalyze

**File:** `backend/handlers_test.go`

Add test functions following the existing `TestHandlePersona_*` pattern:

- `TestHandleAnalyze_EmptyBody` — `nil` body → 400
- `TestHandleAnalyze_InvalidJSON` — `{bad` → 400
- `TestHandleAnalyze_MissingStatement` — `{"context":{...}}` → 400
- `TestHandleAnalyze_EmptyStatement` — `{"statement":"","context":{...}}` → 400
- `TestHandleAnalyze_WhitespaceStatement` — `{"statement":"  ","context":{...}}` → 400
- `TestHandleAnalyze_MissingContext` — `{"statement":"test"}` → 400 (empty domain)

For tests that need a valid context, use a minimal JSON object:
```json
{"domain":"design","persona":{"label":"Designer","role":"UX Designer","goals":[],"frustrations":[],"context":"","influencers":[]},"constraints":[]}
```

**Verify:** `cd backend && go test -run TestHandleAnalyze ./...`

## Step 3: Add integration test for analyze endpoint

**File:** `backend/integration_test.go`

Add `TestAnalyzeEndpoint_Integration` with `//go:build integration` tag:

1. Skip if `ANTHROPIC_API_KEY` not set
2. Create test server with mux + CORS middleware
3. POST full request: statement + ProblemContext (using persona output format from Stage 1)
4. Assert 200 status code
5. Assert SSE content type
6. Assert CORS headers
7. Read SSE events via scanner
8. Assert at least 2 data lines (partial + [DONE])
9. Assert last line is `[DONE]`
10. Parse final event into HMWAnalysis struct, verify all required fields non-empty
11. Parse first partial event, verify it's valid JSON

**Verify:** `cd backend && doppler run -- go test -tags=integration -run TestAnalyze ./...`

## Step 4: Final verification

1. `cd backend && go build ./...` — clean build
2. `cd backend && go test ./...` — unit tests pass
3. `cd backend && doppler run -- go test -tags=integration -run TestAnalyze ./...` — integration test passes
4. Manual curl test:
   ```bash
   curl -N -X POST http://localhost:8080/api/analyze \
     -H 'Content-Type: application/json' \
     -d '{"statement":"How might we make workshops more productive?","context":{"domain":"design","persona":{"label":"Junior Designer","role":"UX Designer","goals":["improve skills"],"frustrations":["boring workshops"],"context":"works at SaaS company","influencers":["senior designers"]},"constraints":[]}}'
   ```

## Testing Strategy Summary

| Layer | What | How | When |
|-------|------|-----|------|
| Unit | Input validation (6 cases) | `go test` | Every change |
| Integration | Full SSE stream with LLM | `go test -tags=integration` | With API key |
| Manual | curl end-to-end | Visual inspection | Final verification |
