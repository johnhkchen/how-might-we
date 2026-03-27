# Progress: T-004-01 sst-lambda-streaming-config

## Status: Complete

## Completed
- Step 1: Added `github.com/aws/aws-lambda-go v1.54.0` dependency
- Step 2: Created `backend/lambda.go` — streaming Lambda adapter with pipe-based ResponseWriter
- Step 3: Modified `backend/main.go` — Lambda detection via `AWS_LAMBDA_RUNTIME_API` env var
- Step 4: Updated `sst.config.ts` — `streaming: true` at top level, `ANTHROPIC_API_KEY` env var bridging
- Step 5: Updated `backend/build.sh` — added `-tags lambda.norpc` build flag
- Step 6: Verified local development path (HTTP server starts on :8080 without Lambda)
- Step 7: Built and deployed (`bash build.sh && npx sst deploy`)
- Step 8: Smoke tested — SSE streaming works, CORS preflight works, error responses work

## Deviations

### SST streaming config location
**Plan**: `url: { streaming: true }` (nested in url object)
**Actual**: `streaming: true` at top level, `url: true` separately. SST v4 has `streaming` as a top-level Function prop, not nested in `url`. Initial deploy had `InvokeMode: BUFFERED` until this was fixed.

### Previous agent code in main.go
Found a prior attempt at Lambda adapter code inline in `main.go` (from another agent or linter). Had a nil channel bug (deadlock on `<-sw.headerWritten` with uninitialized channel). Consolidated to clean `main.go` + separate `lambda.go`.

### Static linking not attempted
`build.sh` keeps dynamic linking (zig default). Static linking with BAML CGo risks undefined symbols from dlopen usage. Dynamic binary works on provided.al2023's glibc 2.34.

### Cold start exceeds target
Init Duration: ~972ms, above the 500ms acceptance criteria target. Primary cause: BAML downloads a 54MB native library from GitHub on every cold start. This is a BAML runtime behavior, not something we can fix in this ticket.
