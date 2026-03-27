# Structure: T-004-01 sst-lambda-streaming-config

## Files Modified

### `backend/main.go`
- Add import for `os` (already present), add Lambda startup path
- In `main()`, after building `mux`, check `AWS_LAMBDA_RUNTIME_API` env var
- If set: call `startLambda(corsMiddleware(mux))` (defined in `lambda.go`)
- If unset: existing `http.ListenAndServe` path (local dev)
- No other changes — the mux setup and route registration stay identical

### `backend/lambda.go` (new file)
- Build tag: none needed (Lambda SDK is lightweight, doesn't hurt local builds)
- `startLambda(handler http.Handler)` — entry point called from main
  - Calls `lambda.StartWithOptions(newStreamingAdapter(handler), lambda.WithStreamingHandler())`
- `streamingAdapter` struct holding the `http.Handler`
  - Implements `lambda.Handler` interface: `Invoke(ctx, payload) ([]byte, error)` — NOT used for streaming
  - Actually, for streaming: implements the streaming handler interface
- `lambdaResponseWriter` struct:
  - Wraps Lambda's streaming response writer (`io.Writer`)
  - Tracks headers (`http.Header`) and status code
  - Implements `http.ResponseWriter` interface (Header, Write, WriteHeader)
  - Implements `http.Flusher` interface (Flush)
  - On first `Write()` or `Flush()`: writes HTTP metadata prelude to Lambda stream
  - Subsequent writes go directly to the stream writer

### `backend/go.mod`
- Add `require github.com/aws/aws-lambda-go v1.47.0` (or latest stable)

### `sst.config.ts`
- Change `link: [anthropicKey]` → keep it (needed for SST resource tracking)
- Add `ANTHROPIC_API_KEY: anthropicKey.value` to `environment` block
- This ensures BAML's `env.ANTHROPIC_API_KEY` resolves correctly on Lambda

### `backend/build.sh`
- Add `-ldflags '-extldflags "-static"'` to go build command for static linking
- Add `-tags lambda.norpc` build tag (optimizes Lambda SDK, removes RPC handler)
- If static linking fails with BAML CGo, remove the flag and keep dynamic linking

## Files NOT Modified

- `backend/handlers.go` — no changes, handlers use the same `http.ResponseWriter` interface
- `backend/sse.go` — no changes, `streamSSE` uses `http.Flusher` which our adapter implements
- `backend/middleware.go` — no changes, CORS middleware wraps normally
- `backend/baml_src/*` — no changes to BAML definitions
- `backend/baml_client/*` — generated code, not modified
- `frontend/*` — frontend track, not our scope

## Module Boundaries

```
main.go
  ├── builds http.ServeMux with routes (unchanged)
  ├── wraps with corsMiddleware (unchanged)
  └── if Lambda:  startLambda(handler)     ← NEW branch
      else:       http.ListenAndServe(...)  ← existing

lambda.go (new)
  ├── startLambda(handler) → lambda.StartWithOptions(...)
  ├── streamingAdapter     → parses Function URL event, calls handler.ServeHTTP
  └── lambdaResponseWriter → implements http.ResponseWriter + http.Flusher
                              writes metadata prelude, streams body to Lambda
```

## Deployment Artifact Layout (in Lambda /var/task/)

```
/var/task/
  ├── bootstrap          ← compiled Go binary (entry point)
  ├── baml_src/          ← BAML source files (read by runtime.go at init)
  │   ├── clients.baml
  │   ├── types.baml
  │   ├── persona.baml
  │   ├── analyze.baml
  │   ├── expand.baml
  │   ├── refine.baml
  │   └── generators.baml
  ├── baml_client/       ← generated Go code (compiled into binary, but dir present)
  └── ...                ← other Go source files (not needed at runtime, but included in bundle)
```

Note: SST's `bundle: "backend"` includes everything in `backend/`. The Go source files are inert at runtime. Only `bootstrap` and `baml_src/` matter. We could add a `.sstignore` to exclude source files, but the size savings are minimal (<100KB) compared to the 20MB binary.

## Interface Contract: Lambda Streaming Handler

The Lambda Function URL streaming protocol:
1. Handler receives raw JSON event bytes
2. Handler writes a metadata prelude (JSON with statusCode + headers) to the stream
3. Handler writes body bytes to the stream (each flush = a chunk sent to client)
4. Handler closes the stream (returns from function)

Our adapter translates this to standard `net/http`:
- Event JSON → `http.Request`
- Metadata prelude → `WriteHeader()` captures status + headers, writes prelude on first body write
- Body streaming → `Write()` and `Flush()` write to Lambda stream
- Stream close → `ServeHTTP` returns, adapter returns nil error

## Ordering

1. Add `aws-lambda-go` dependency to `go.mod`
2. Create `lambda.go` with streaming adapter
3. Modify `main.go` to branch on Lambda detection
4. Update `sst.config.ts` for secret bridging
5. Update `build.sh` for static linking + lambda build tag
6. Build and test locally (Lambda detection off → should work as before)
7. Build for Lambda and deploy with `sst deploy`
