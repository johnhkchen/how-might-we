# Research: T-004-01 sst-lambda-streaming-config

## Current State

### SST Configuration (`sst.config.ts`)
- SST v4.5.12 with `sst.aws.Function` resource named `HmwApi`
- `runtime: "provided.al2023"` — custom runtime, binary must implement Lambda Runtime API
- `bundle: "backend"` — SST zips the entire `backend/` directory as the deployment artifact
- `handler: "bootstrap"` — Lambda looks for `bootstrap` executable in the zip root
- `architecture: "arm64"` — targets Graviton2/3 processors
- `url.streaming: true` — enables Lambda Function URL with response streaming
- `environment.HOME: "/tmp"` — needed by BAML runtime for temp file operations
- `link: [anthropicKey]` — SST Secret `AnthropicApiKey` injected as env var
- `timeout: "5 minutes"`, `memory: "512 MB"`

### Go Backend (`backend/main.go`)
- Plain `net/http` server with `http.ListenAndServe(":"+port, corsMiddleware(mux))`
- Four POST routes: `/api/persona`, `/api/analyze`, `/api/expand`, `/api/refine`
- **No Lambda adapter.** This will NOT work on Lambda — Lambda does not run a long-lived HTTP server. The binary must implement the Lambda Runtime API protocol.

### SSE Streaming (`backend/sse.go`)
- Generic `streamSSE[TStream, TFinal]` function consuming BAML streaming channels
- Asserts `http.Flusher` interface on `ResponseWriter`
- Writes `data: {json}\n\n` SSE events, terminates with `data: [DONE]\n\n`
- On Lambda Function URLs with streaming, the `ResponseWriter` supports `http.Flusher` only if the correct adapter is used

### BAML Runtime Path (`backend/baml_client/runtime.go:59`)
```go
runtime, err := baml.CreateRuntime("./baml_src", getBamlFiles(), getEnvVars(nil))
```
- Reads `./baml_src` **relative to working directory**
- On Lambda with `provided.al2023`, the working directory is `/var/task/`
- SST's `bundle: "backend"` zips the `backend/` directory, so the extracted layout is:
  `/var/task/bootstrap`, `/var/task/baml_src/`, `/var/task/baml_client/`, etc.
- The `./baml_src` path should resolve correctly since Lambda's CWD is `/var/task/`

### Build Pipeline (`backend/build.sh`)
- Cross-compiles from macOS to `linux/arm64` using zig as C/C++ cross-compiler
- Produces `backend/bootstrap` — 20MB ELF ARM64 binary
- **Dynamically linked** (`interpreter /lib/ld-linux-aarch64.so.1`)
- `provided.al2023` base image has glibc 2.34+ which should be compatible
- Requires `zig` installed locally (`brew install zig`)

### Dockerfile (`backend/Dockerfile`)
- Two-stage build: `golang:1.24-bookworm` builder → `public.ecr.aws/lambda/provided:al2023` runtime
- Compiles natively on Linux (no zig needed) with `CGO_ENABLED=1`
- Alternative to `build.sh` for CI/CD environments

### Secret Injection
- SST `link: [anthropicKey]` injects the secret as `SST_SECRET_ANTHROPICAPIKEY` env var
- BAML expects `ANTHROPIC_API_KEY` from `env.ANTHROPIC_API_KEY` in `clients.baml`
- **Mismatch**: SST's linked secret name does not match BAML's expected env var name
- Need to either: (a) add `ANTHROPIC_API_KEY` to `environment` mapping from SST secret, or (b) bridge the env var name in Go code at startup

### Lambda Streaming Architecture
- Lambda Function URLs with streaming use `InvokeWithResponseStream`
- The binary must call `lambda.Start()` or `lambda.StartWithOptions()` with the AWS Lambda Go SDK
- For streaming, the handler receives `events.LambdaFunctionURLRequest` and returns via a `lambda.StreamingHandler` or adapter
- The `aws-lambda-go-api-proxy` library provides `httpadapter` that translates Lambda events to `net/http` — but its streaming support is limited
- For true SSE streaming, we need `lambda.StartWithOptions(handler, lambda.WithStreamingHandler())`

### Key Dependencies to Add
- `github.com/aws/aws-lambda-go` — Lambda Runtime API SDK
- Possibly `github.com/awslabs/aws-lambda-go-api-proxy` — HTTP adapter (if it supports streaming)

## Critical Gaps

1. **No Lambda handler**: `main.go` only runs `http.ListenAndServe`. Must add Lambda Runtime API integration with environment detection (`AWS_LAMBDA_RUNTIME_API` env var).

2. **SSE over Lambda Function URL streaming**: Standard Lambda responses are buffered. Function URL streaming requires the binary to use `lambda.StartWithOptions` with `WithStreamingHandler()` and write to a `*os.Pipe` or streaming writer. Need to verify the `http.Flusher` path works through whichever adapter we choose.

3. **Secret name mismatch**: SST injects `SST_SECRET_ANTHROPICAPIKEY`; BAML reads `ANTHROPIC_API_KEY`. Must bridge this.

4. **Dynamic linking risk**: The zig-compiled binary is dynamically linked. If the glibc version on `provided.al2023` doesn't match, it will fail at runtime with missing symbols. May need to add `-static` flag or verify compatibility.

5. **Build integration with SST**: SST needs to know to run `build.sh` before bundling. With `bundle: "backend"`, SST just zips the directory. The `bootstrap` binary must be pre-built before `npx sst deploy`.

## Constraints

- BAML v0.218.0 requires CGo — cannot use `CGO_ENABLED=0` for a static pure-Go build
- `baml_src/` directory must be present alongside the binary at runtime
- The same `http.ServeMux` must work for both local dev and Lambda (per spec)
- Two concurrent agents work on this repo; this ticket modifies backend files only
