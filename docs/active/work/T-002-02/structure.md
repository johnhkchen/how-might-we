# Structure — T-002-02: expand-hmw-endpoint

## Files Modified

### 1. backend/handlers.go

**Change**: Replace `handleExpand` stub with full implementation.

**Additions**:
- `expandRequest` struct (2 fields: Analysis, Context) — placed after `analyzeRequest` struct
- `handleExpand` function body — replaces the TODO stub

**No new imports needed** — `encoding/json`, `log`, `net/http`, `strings`, `baml_client`, `baml_types` are all already imported.

**Structure of handleExpand**:
```
func handleExpand(w, r):
    1. json.Decode → expandRequest
    2. validate analysis.originalStatement non-empty
    3. validate analysis.underlyingTension non-empty
    4. validate context.domain non-empty
    5. validate context.persona.label non-empty
    6. baml_client.Stream.ExpandHMW(ctx, req.Analysis, req.Context)
    7. streamSSE(w, r, ch)
```

### 2. backend/handlers_test.go

**Change**: Add unit tests for handleExpand input validation.

**Additions** (appended after existing analyze tests, before CORS tests):
- `validAnalysis` const — minimal valid HMWAnalysis JSON for reuse across expand tests
- `TestHandleExpand_EmptyBody`
- `TestHandleExpand_InvalidJSON`
- `TestHandleExpand_MissingOriginalStatement`
- `TestHandleExpand_MissingUnderlyingTension`
- `TestHandleExpand_MissingDomain`
- `TestHandleExpand_MissingPersonaLabel`

Each test follows the same pattern: build request → call handleExpand → assert 400.

### 3. backend/integration_test.go

**Change**: Add integration test for the expand endpoint.

**Addition**:
- `TestExpandEndpoint_Integration` — appended after `TestAnalyzeEndpoint_Integration`

**Test structure**:
```
func TestExpandEndpoint_Integration(t):
    1. Skip if no ANTHROPIC_API_KEY
    2. Create httptest server with POST /api/expand route
    3. POST realistic { analysis, context } payload
    4. Assert 200, Content-Type text/event-stream, CORS headers
    5. Scan SSE data lines
    6. Assert ≥2 data lines, last is [DONE]
    7. Unmarshal final line as HMWExpansion
    8. Assert variants non-empty, each has statement + moveType + rationale
    9. Assert emergentTheme non-empty (present in final)
    10. Log stats
```

## Files NOT Modified

- `backend/main.go` — route already registered
- `backend/sse.go` — generic streaming already works
- `backend/middleware.go` — CORS already configured
- `backend/baml_src/*` — no BAML changes needed
- `frontend/*` — not in scope (backend track)

## Module Boundaries

No new modules or packages. All code stays in `package main` of the backend.

## Interface Contracts

**HTTP API contract** (consumed by frontend):
```
POST /api/expand
Content-Type: application/json

Request:  { "analysis": HMWAnalysis, "context": ProblemContext }
Response: text/event-stream
  data: {"variants":[...]}\n\n          (partial, growing array)
  data: {"variants":[...],"emergentTheme":"..."}\n\n  (final)
  data: [DONE]\n\n
```

**Error responses**:
```
400: { "error": "description" }  — validation failures
500: { "error": "description" }  — BAML stream start failure
```

## Ordering

Changes can be made in any order — the handler, tests, and integration test are independent. However, implementing the handler first allows running tests against it immediately.
