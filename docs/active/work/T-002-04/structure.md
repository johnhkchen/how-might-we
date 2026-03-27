# Structure — T-002-04: backend-e2e-flow-test

## Files Modified

### `backend/integration_test.go`

This is the only file that changes. All work happens here.

**New helper function:**

```
func readSSEDataLines(body io.Reader) ([]string, error)
```
- Reads response body line-by-line with `bufio.Scanner`
- Extracts lines prefixed with `data: `, strips the prefix
- Returns slice of data payloads and any scanner error
- Placed at top of file, before individual test functions

**New helper function:**

```
func extractFinalJSON(t *testing.T, dataLines []string) string
```
- Asserts at least 2 data lines (partial + [DONE])
- Asserts last line is `[DONE]`
- Returns the second-to-last line (the final JSON event)
- Calls `t.Helper()` for clean error reporting

**New helper function:**

```
func postSSE(t *testing.T, serverURL string, path string, bodyJSON string) []string
```
- Posts JSON to the given path, asserts 200 status
- Checks `Content-Type: text/event-stream` and CORS headers
- Calls `readSSEDataLines` and returns the data lines
- Consolidates the repeated POST + header-check + read pattern

**Refactor existing tests:**

The four existing integration tests (`TestPersonaEndpoint_Integration`, `TestAnalyzeEndpoint_Integration`, `TestExpandEndpoint_Integration`, `TestRefineEndpoint_Integration`) are refactored to use `postSSE` and `extractFinalJSON`, reducing each from ~50 lines of boilerplate to ~20 lines of assertion logic.

**New test function:**

```
func TestFullPipeline_Integration(t *testing.T)
```
- Skips if `ANTHROPIC_API_KEY` not set
- Creates one `httptest.NewServer` with all four routes + CORS middleware
- Executes the four-stage pipeline sequentially:
  1. POST `/api/persona` → unmarshal final Persona → validate fields
  2. Build ProblemContext from Persona, POST `/api/analyze` → unmarshal final HMWAnalysis → validate fields
  3. POST `/api/expand` with analysis + context → unmarshal final HMWExpansion → validate variants
  4. Build HMWSession from all prior outputs, POST `/api/refine` → unmarshal final HMWRefinement → validate fields
- Uses `t.Fatalf` for stage failures (since later stages depend on earlier outputs)
- Logs summary at end

**New test function:**

```
func TestErrorHandling_Integration(t *testing.T)
```
- Skips if `ANTHROPIC_API_KEY` not set (needs BAML runtime initialized)
- Creates `httptest.NewServer` with all routes + CORS middleware
- Sub-tests for each endpoint:
  - Invalid JSON → 400 + JSON error body
  - Missing required fields → 400 + specific error message
- Sub-test for OPTIONS preflight → 204 + CORS headers
- Uses `t.Run()` for clean subtesting

## Files NOT Modified

- `handlers.go` — No changes to handler logic
- `sse.go` — No changes to streaming logic
- `middleware.go` — No changes to CORS
- `main.go` — No changes to routing
- `handlers_test.go` — Unit tests remain unchanged (they test validation without server)
- Any frontend files
- Any BAML files

## Module Boundaries

All new code is in the `main` package test file with the `integration` build tag. No new packages, no new dependencies.

## Ordering

1. Add helper functions (`readSSEDataLines`, `extractFinalJSON`, `postSSE`)
2. Refactor existing four integration tests to use helpers
3. Verify existing tests still pass
4. Add `TestFullPipeline_Integration`
5. Add `TestErrorHandling_Integration`
6. Run full suite to confirm
