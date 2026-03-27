# Progress: T-001-03 verify-persona-endpoint

## Completed

### Step 1: CORS Middleware Tests
- Added `TestCORS_HeadersPresent` and `TestCORS_Preflight` to `handlers_test.go`
- Both pass. Total: 7 unit tests passing.

### Step 2: Integration Test
- Created `backend/integration_test.go` with `//go:build integration` tag
- `TestPersonaEndpoint_Integration`:
  - Skips gracefully when `ANTHROPIC_API_KEY` not set
  - When key is available: starts httptest.Server, POSTs to persona endpoint, reads SSE stream, validates Content-Type, CORS headers, JSON structure of partial/final events, [DONE] sentinel
- Added `os.Getenv("ANTHROPIC_API_KEY")` guard for skip behavior

### Step 3: Error Logging Improvement
- Added `log.Printf` in `handlePersona` before the 500 response so BAML errors are visible in server logs (was previously swallowed)
- Added `log` import to `handlers.go`

### Step 4: Manual Verification

**Server startup:** Confirmed `go run .` starts on `:8080` without errors.

**CORS verification (curl):**
```
HTTP/1.1 204 No Content
Access-Control-Allow-Headers: Content-Type
Access-Control-Allow-Methods: POST, OPTIONS
Access-Control-Allow-Origin: *
```
All three CORS headers present on preflight (OPTIONS) and regular responses. ✅

**Input validation (curl):**
```
POST /api/persona (empty body) → 400 {"error":"invalid JSON: EOF"}
```
Correct error response with CORS headers. ✅

**Streaming endpoint (curl):**
```
POST /api/persona {"rawInput":"junior designer"} → 500 {"error":"failed to start persona stream"}
Server log: RefinePersona stream error: LLM client 'Claude' requires environment variable 'ANTHROPIC_API_KEY' to be set
```
Error is expected — `ANTHROPIC_API_KEY` is not configured in Doppler. ⚠️

### Blocking Issue: ANTHROPIC_API_KEY Not in Doppler

The `doppler secrets` listing shows only Doppler metadata (DOPPLER_CONFIG, DOPPLER_ENVIRONMENT, DOPPLER_PROJECT). No `ANTHROPIC_API_KEY` is configured. Both `dev` and `dev_personal` configs are empty.

The key must be set via: `doppler secrets set ANTHROPIC_API_KEY`

This is a prerequisite noted in the ticket ("Requires a valid ANTHROPIC_API_KEY environment variable") but it was not set up by the project setup ticket.

## Deviations from Plan

1. **Added error logging to `handlers.go`:** Not in original plan. The error was being swallowed silently, making debugging impossible. Added `log.Printf` before the 500 response.

2. **Skipped SSE unit test:** `streamSSE` uses `baml_client.StreamValue` which has unexported fields (`as_final`, `as_stream`). Cannot construct test values outside the `baml_client` package. The integration test covers this path instead.

3. **Integration test skips without API key:** Added `t.Skip()` guard since the key isn't available. The test infrastructure is ready and will pass once the key is configured.

## Verification Summary

| Acceptance Criterion | Status | Notes |
|---|---|---|
| Server starts on :8080 | ✅ Verified | `go run .` works |
| SSE streaming events | ⚠️ Blocked | Needs ANTHROPIC_API_KEY |
| Progressive Persona JSON | ⚠️ Blocked | Needs ANTHROPIC_API_KEY |
| Final event has all fields | ⚠️ Blocked | Needs ANTHROPIC_API_KEY |
| CORS headers present | ✅ Verified | All 3 headers on all responses |
