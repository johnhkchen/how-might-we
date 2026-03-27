# Design: T-004-01 sst-lambda-streaming-config

## Problem

The Go backend runs as a plain HTTP server (`http.ListenAndServe`). For Lambda deployment, it must:
1. Implement the Lambda Runtime API protocol
2. Support response streaming over Function URLs
3. Bridge SST secret names to BAML-expected env var names
4. Work identically in local dev mode

## Options Evaluated

### Option A: `aws-lambda-go-api-proxy/httpadapter`

Use `awslabs/aws-lambda-go-api-proxy` which translates Lambda events to `net/http` requests.

**Pros**: Drop-in wrapper around existing `http.ServeMux`. Battle-tested.
**Cons**: The standard adapter buffers the full response before returning — no streaming. The library has no `StreamingHandler` support as of v0.16. Would completely break SSE.

**Verdict**: Rejected. SSE streaming is a core requirement.

### Option B: Custom `lambda.StartWithOptions` + `StreamingHandler`

Write a custom Lambda handler that:
1. Receives `events.LambdaFunctionURLStreamingRequest`
2. Constructs an `http.Request` from the event
3. Creates a streaming `http.ResponseWriter` that writes directly to the Lambda response stream
4. Passes both to the existing `http.ServeMux`

**Pros**: Full control over streaming. Uses official `aws-lambda-go` SDK's `WithStreamingHandler()`. The `http.Flusher` interface can be implemented on the streaming writer so `sse.go` works unchanged.
**Cons**: ~80 lines of adapter code to write. Must handle headers, status code, and streaming protocol correctly.

**Verdict**: **Selected.** This is the only approach that preserves real-time SSE streaming through Lambda Function URLs.

### Option C: Container Lambda with built-in HTTP server

Run the existing HTTP server as-is inside a container Lambda. Lambda invokes the container, which starts the HTTP server, and Lambda's Runtime Interface Emulator forwards requests.

**Pros**: Zero code changes to backend.
**Cons**: Cold starts 2-5s (container pull + HTTP server startup). Breaks the `url.streaming: true` SST config — container Lambda with RIE doesn't support Function URL streaming natively. Adds ECR dependency. Overkill for a simple Go binary.

**Verdict**: Rejected. Cold start penalty and no streaming support.

### Option D: Web Adapter (Lambda Web Adapter)

Use AWS's `lambda-web-adapter` extension layer that wraps any HTTP server for Lambda.

**Pros**: No code changes. Just add the layer ARN.
**Cons**: The web adapter buffers responses by default. It has experimental streaming support via `AWS_LWA_INVOKE_MODE=RESPONSE_STREAM`, but it's not well-documented for SSE. Adds a layer dependency. Hard to debug.

**Verdict**: Rejected. Experimental streaming, opaque failure modes.

## Selected Approach: Option B

### Lambda Adapter Design

Create `backend/lambda.go` — a streaming Lambda handler that wraps the `http.ServeMux`:

1. **Environment detection** in `main.go`: Check `AWS_LAMBDA_RUNTIME_API` env var.
   - Set → call `startLambda(mux)` which uses `lambda.StartWithOptions`
   - Unset → call `http.ListenAndServe` (local dev)

2. **Streaming handler**: Implement `lambda.Handler` interface that:
   - Parses `LambdaFunctionURLStreamingRequest` from the event JSON
   - Builds `http.Request` (method, path, headers, body)
   - Creates a custom `ResponseWriter` that:
     - Implements `http.Flusher` (required by `sse.go`)
     - Writes HTTP headers as Lambda metadata (prelude)
     - Pipes response body bytes directly to Lambda's streaming writer
   - Calls `mux.ServeHTTP(writer, request)`

3. **SSE compatibility**: The custom `ResponseWriter.Flush()` flushes the underlying Lambda stream writer, ensuring each SSE event is sent immediately.

### Secret Bridging

In `main.go` init or startup, before BAML runtime initializes:
```go
if v := os.Getenv("SST_SECRET_ANTHROPICAPIKEY"); v != "" && os.Getenv("ANTHROPIC_API_KEY") == "" {
    os.Setenv("ANTHROPIC_API_KEY", v)
}
```

This runs in `init()` before BAML's `init()` in `runtime.go`. However, Go's `init()` ordering across packages is by import order, not guaranteed. Safer approach: use `main()` with a deferred BAML initialization, or set the env var in the SST config's `environment` block directly.

**Decision**: Set `ANTHROPIC_API_KEY` explicitly in SST's `environment` using `anthropicKey.value`:
```ts
environment: {
  HOME: "/tmp",
  ANTHROPIC_API_KEY: anthropicKey.value,
}
```
This is cleaner — no Go code changes needed for secret bridging.

### Static Linking

Change `build.sh` to produce a statically linked binary:
```bash
CGO_ENABLED=1 GOOS=linux GOARCH=arm64 \
  CC="zig cc -target aarch64-linux-gnu" \
  CXX="zig c++ -target aarch64-linux-gnu" \
  go build -ldflags '-extldflags "-static"' -o bootstrap .
```

This eliminates glibc version mismatch risk on `provided.al2023`. Zig's bundled libc supports static linking.

### Build Integration

SST with `bundle: "backend"` zips the directory as-is. The `bootstrap` binary must be pre-built. Two approaches:
- **Manual**: Run `cd backend && bash build.sh` before `npx sst deploy`
- **SST hook**: Not natively supported for `provided.al2023` with `bundle`

Decision: Keep manual pre-build step. Document in CLAUDE.md deploy command as:
```bash
cd backend && bash build.sh && cd .. && npx sst deploy
```

### CORS for Function URL

Lambda Function URLs handle CORS at the infrastructure level, but our middleware handles it at the application level (which is fine and more flexible). No change needed.

## Risks

1. **Streaming writer compatibility**: The `lambda.StreamingHandler` protocol requires writing a metadata prelude followed by streamed body. If the prelude format is wrong, Lambda returns 502.
2. **BAML CGo + static linking**: Static linking with CGo and BAML's native code may fail if BAML depends on dynamically-loaded shared libraries. If static linking fails, fall back to dynamic and accept the glibc dependency (al2023 has glibc 2.34, zig targets glibc 2.17+ by default — should be compatible).
3. **Cold start**: ARM64 + 20MB binary + BAML runtime init. Target <500ms per acceptance criteria.
