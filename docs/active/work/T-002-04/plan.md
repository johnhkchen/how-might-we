# Plan — T-002-04: backend-e2e-flow-test

## Step 1: Add SSE helper functions

Add three helper functions to `integration_test.go`:

- `readSSEDataLines(body io.Reader) ([]string, error)` — Scanner-based SSE data extraction
- `extractFinalJSON(t *testing.T, dataLines []string) string` — Asserts [DONE] sentinel, returns final JSON line
- `postSSE(t *testing.T, serverURL, path, bodyJSON string) []string` — POST + status/header checks + SSE reading

**Verify:** `go build -tags=integration ./...` compiles cleanly.

## Step 2: Refactor existing integration tests

Replace the duplicated scanner + header-checking code in all four existing tests with calls to `postSSE` and `extractFinalJSON`. Each test retains its own JSON unmarshalling and field assertions.

**Verify:** `doppler run -- go test -tags=integration -v -run 'TestPersonaEndpoint|TestAnalyzeEndpoint|TestExpandEndpoint|TestRefineEndpoint' ./...` — all four pass with same behavior.

## Step 3: Add TestFullPipeline_Integration

Implement the four-stage chained test:
1. persona → extract Persona
2. Build ProblemContext, analyze → extract HMWAnalysis
3. expand → extract HMWExpansion
4. Build HMWSession with candidate statuses, refine → extract HMWRefinement

Each stage validates its output before feeding it to the next. Uses `t.Fatalf` for chain-breaking failures.

**Verify:** `doppler run -- go test -tags=integration -v -run TestFullPipeline ./...` passes.

## Step 4: Add TestErrorHandling_Integration

Add server-level error tests using `t.Run()` subtests:
- Invalid JSON to each endpoint (4 subtests)
- Missing required fields for each endpoint (4+ subtests)
- OPTIONS preflight returns 204 with CORS headers (1 subtest)

These test the full middleware stack (`corsMiddleware` + handler), unlike the unit tests in `handlers_test.go` which test handlers directly.

**Verify:** `doppler run -- go test -tags=integration -v -run TestErrorHandling ./...` passes.

## Step 5: Full verification

Run the complete test suite:
- `go test -v ./...` — unit tests pass (no build tag needed)
- `doppler run -- go test -tags=integration -v ./...` — all integration tests pass
- `go build ./...` — backend compiles cleanly

## Testing Strategy

| Test type | What it covers | Run condition |
|-----------|---------------|---------------|
| Unit (handlers_test.go) | Input validation, CORS | Always (`go test`) |
| Integration per-endpoint | Each endpoint independently | `ANTHROPIC_API_KEY` set + `-tags=integration` |
| Integration pipeline | Full 4-stage chaining | Same |
| Integration errors | Error handling through full stack | Same |

Pipeline test is the most valuable — it's the only test that verifies outputs from one stage are accepted as valid inputs by the next.
