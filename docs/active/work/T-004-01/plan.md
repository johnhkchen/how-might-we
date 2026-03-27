# Plan: T-004-01 sst-lambda-streaming-config

## Step 1: Add Lambda Go SDK dependency

- Run `cd backend && go get github.com/aws/aws-lambda-go@latest`
- Verify `go.mod` and `go.sum` updated correctly
- Run `go build ./...` to confirm no import conflicts

**Verify**: `go.mod` shows `aws-lambda-go` in requires.

## Step 2: Create `backend/lambda.go` — streaming Lambda adapter

Write the adapter with these components:

a) `startLambda(handler http.Handler)` function:
   - Calls `lambda.StartWithOptions()` with streaming handler support
   - Passes adapter that wraps the `http.Handler`

b) Streaming handler function:
   - Receives `context.Context` and `events.LambdaFunctionURLRequest`
   - Returns streaming response via `events.LambdaFunctionURLStreamingResponse`
   - Constructs `http.Request` from the Lambda event (method, path, headers, body, query string)
   - Creates `lambdaResponseWriter` wrapping a pipe writer
   - Calls `handler.ServeHTTP(writer, request)` in a goroutine
   - Returns the streaming response with metadata and body reader from the pipe

c) `lambdaResponseWriter` struct:
   - Fields: `http.Header`, `statusCode int`, `headersSent bool`, `pipeWriter *io.PipeWriter`
   - `Header()` → returns headers map
   - `WriteHeader(code)` → stores status code
   - `Write(b)` → writes bytes to pipe writer
   - `Flush()` → no-op (pipe writes are immediately available to reader)
   - Implements `http.Flusher` so `sse.go` type assertion succeeds

**Verify**: `go build ./...` compiles without errors.

## Step 3: Modify `backend/main.go` — Lambda detection

- Add `import` for the lambda.go functions (same package, no import needed)
- After building mux and wrapping with CORS, add:
  ```go
  handler := corsMiddleware(mux)
  if os.Getenv("AWS_LAMBDA_RUNTIME_API") != "" {
      log.Println("Lambda runtime detected, starting streaming handler")
      startLambda(handler)
      return
  }
  ```
- Keep existing `http.ListenAndServe` as the else branch

**Verify**: `go build ./...` succeeds. Local `go run .` still starts HTTP server on :8080.

## Step 4: Update `sst.config.ts` — secret environment bridging

- Add `ANTHROPIC_API_KEY: anthropicKey.value` to the `environment` block
- Keep `link: [anthropicKey]` for SST resource tracking

**Verify**: Read the file and confirm the environment block has both `HOME` and `ANTHROPIC_API_KEY`.

## Step 5: Update `backend/build.sh` — build tags and static linking

- Add `-tags lambda.norpc` to the go build command (removes unused RPC handler code)
- Attempt static linking with `-ldflags '-extldflags "-static"'`
- If static linking fails (BAML CGo compatibility), remove the flag
- Run `bash build.sh` and verify the binary is produced

**Verify**: `file backend/bootstrap` shows ARM64 ELF binary. `ls -la backend/bootstrap` shows reasonable size.

## Step 6: Test local development path

- Run `cd backend && go run .` (no `AWS_LAMBDA_RUNTIME_API` set)
- Confirm it starts on port 8080
- Confirm it does NOT try to start Lambda handler
- Ctrl+C to stop

**Verify**: Log output shows "Starting HMW Workshop API on :8080".

## Step 7: Build and deploy

- Run `cd backend && bash build.sh` to cross-compile
- Run `npx sst deploy` from repo root
- Capture the output `apiUrl` from SST

**Verify**: SST deploy completes without errors. Function URL is printed.

## Step 8: Smoke test deployed function

- `curl -X POST <function-url>/api/persona -H 'Content-Type: application/json' -d '{"rawInput":"test"}'`
- Verify SSE streaming response with `data:` events
- If no API key cost desired, test with a malformed request to verify 400 response

**Verify**: Response includes `text/event-stream` content type or proper JSON error.

## Testing Strategy

- **Unit test**: None specifically for `lambda.go` — the adapter is a thin translation layer that's best tested via integration
- **Build verification**: `go build ./...` must pass with the Lambda SDK dependency
- **Local regression**: `go run .` must still work as plain HTTP server
- **Integration test**: Existing `integration_test.go` tests continue to pass (they test via HTTP, not Lambda)
- **Deploy smoke test**: POST to deployed Function URL and verify SSE response
- **E2E**: Frontend Playwright tests are not in scope (frontend track)

## Rollback

If deployment fails:
- The Lambda function doesn't exist yet, so there's nothing to roll back
- `npx sst remove` cleans up all resources
- Code changes are backward-compatible (local dev path unchanged)
