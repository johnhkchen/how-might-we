# Review: T-004-01 sst-lambda-streaming-config

## Summary

The Go backend now deploys as a Lambda function with streaming Function URL support. The same `http.ServeMux` runs locally (plain HTTP server) or on Lambda (streaming adapter), detected at startup via `AWS_LAMBDA_RUNTIME_API` env var. SSE responses stream incrementally through Lambda Function URLs.

## Files Changed

### Created
- **`backend/lambda.go`** (~130 lines) — Lambda streaming adapter
  - `startLambda(handler)` — entry point, wraps handler with `lambda.Start()`
  - `lambdaEventToHTTPRequest()` — converts `LambdaFunctionURLRequest` to `http.Request`
  - `lambdaResponseWriter` — implements `http.ResponseWriter` + `http.Flusher`, backed by `io.Pipe`
  - `flattenHeaders()` — converts multi-value headers to single-value for Lambda
  - Uses `sync.Once` for thread-safe header signaling
  - `Flush()` signals header readiness (critical for SSE: `sse.go` flushes headers before writing body)

### Modified
- **`backend/main.go`** — Simplified to routing logic only
  - Added `AWS_LAMBDA_RUNTIME_API` detection branching to `startLambda(handler)`
  - Removed prior inline adapter code (had nil channel deadlock bug)
  - ~30 lines, clean separation of concerns

- **`backend/build.sh`** — Added `-tags lambda.norpc` to go build command
  - Excludes unused RPC handler code from Lambda binary
  - Binary size unchanged (~20MB)

- **`backend/go.mod`** / **`backend/go.sum`** — Added `github.com/aws/aws-lambda-go v1.54.0`

- **`sst.config.ts`** — Fixed streaming configuration
  - Moved `streaming: true` from `url: { streaming: true }` to top-level property
  - Changed `url: { streaming: true }` to `url: true`
  - Added `ANTHROPIC_API_KEY: anthropicKey.value` to environment (bridges SST secret name to BAML expectation)
  - Removed unused `transform.url` block

### Not Modified
- `backend/handlers.go` — No changes needed, handlers use standard `http.ResponseWriter`
- `backend/sse.go` — No changes needed, `http.Flusher` assertion works with `lambdaResponseWriter`
- `backend/middleware.go` — CORS middleware works unchanged
- `backend/baml_src/*` — No BAML changes
- `frontend/*` — Out of scope (frontend track)

## Acceptance Criteria Evaluation

| Criteria | Status | Notes |
|----------|--------|-------|
| Go backend includes Lambda streaming adapter | **Pass** | `lambda.go` wraps `http.ServeMux` for Lambda |
| CGo cross-compilation solved | **Pass** | `build.sh` uses zig cc; Dockerfile available for CI |
| `npx sst deploy` creates Lambda with streaming | **Pass** | Deployed, Function URL created with `RESPONSE_STREAM` |
| Function URL accessible and returns SSE | **Pass** | Verified with curl — streaming `data:` events delivered |
| Lambda reads API key from SST secret | **Pass** | `ANTHROPIC_API_KEY` env var set from `anthropicKey.value` |
| Cold start under 500ms | **Fail** | ~972ms — BAML downloads 54MB native lib on cold start |

## Test Coverage

- **Build verification**: `go build ./...` and `go vet ./...` pass
- **Local regression**: `go run .` starts HTTP server on :8080 (Lambda path not triggered)
- **Deployment**: `npx sst deploy` completes, creates Lambda + Function URL
- **SSE streaming**: Verified with curl — `/api/persona` streams partial JSON objects incrementally
- **Error responses**: Verified 400 response with JSON error body for invalid input
- **CORS preflight**: OPTIONS returns 204 with correct CORS headers
- **No unit tests added**: The adapter is a thin translation layer best tested via integration. Existing `integration_test.go` covers HTTP-level behavior.

## Open Concerns

### 1. Cold Start (~972ms) — BAML Native Library Download
BAML downloads `libbaml_cffi-aarch64-unknown-linux-gnu.so` (54MB) from GitHub on every cold start. This is the dominant cost in the ~972ms init time.

**Mitigation options (future ticket)**:
- Include the pre-built `.so` in the deployment zip and set `BAML_LIBRARY_PATH` env var
- Use a Lambda layer with the BAML native library pre-cached
- Use provisioned concurrency to avoid cold starts entirely

### 2. Dynamic Linking
The bootstrap binary is dynamically linked against glibc. Works on `provided.al2023` (glibc 2.34), but would break if the runtime image changes. Static linking was not attempted due to BAML CGo's potential `dlopen` usage.

### 3. `baml_src/` in Deployment Bundle
SST's `bundle: "backend"` includes the entire `backend/` directory (Go source, generated client, BAML sources). Only `bootstrap` and `baml_src/` are needed at runtime. A `.sstignore` or custom bundling could reduce the ~25MB zip to ~20MB, but the savings are marginal.

### 4. Secret Management
The `ANTHROPIC_API_KEY` is set via SST environment variable (from the linked secret). This means the key appears in the Lambda's environment configuration (visible in AWS Console). A more secure approach would use the SST `link` mechanism to read from SSM at runtime, but this requires Go-side SST SDK integration that doesn't exist.

### 5. CORS Wildcard Origin
The CORS middleware allows `Access-Control-Allow-Origin: *`. This is fine for development but should be restricted to the Cloudflare Pages domain in production.
