# Research: T-001-01 init-go-baml-client

## Summary

This ticket initializes the BAML Go client for the hmw-workshop backend. The BAML source files are fully authored but `baml-cli generate` has never been run, so the `backend/baml_client/` directory does not exist. The Go module declares a dependency on `github.com/boundaryml/baml v0.216.0` but `go mod tidy` has not been run either, so the dependency is unresolved.

---

## Current State of backend/

### Files present

```
backend/
├── go.mod                  # Module: github.com/hmw-workshop/backend, Go 1.23, requires baml v0.216.0
├── main.go                 # HTTP server entry (4 POST routes, CORS middleware, port 8080)
├── handlers.go             # Stub handlers — all return 501 Not Implemented
├── middleware.go            # CORS middleware (Allow-Origin *, POST+OPTIONS)
└── baml_src/
    ├── generators.baml     # Go codegen config, output_dir "../", post-gen hooks
    ├── clients.baml        # Claude Sonnet 4.6 client, retry policy
    ├── types.baml          # All structured types (Persona, HMWAnalysis, HMWExpansion, etc.)
    ├── persona.baml        # RefinePersona function + test
    ├── analyze.baml        # AnalyzeHMW function
    ├── expand.baml         # ExpandHMW function
    └── refine.baml         # RefineHMW function
```

### Files absent

- `backend/baml_client/` — the generated Go client directory (created by `baml-cli generate`)
- `go.sum` — no dependency resolution has occurred

### go.mod details

```go
module github.com/hmw-workshop/backend
go 1.23
require github.com/boundaryml/baml v0.216.0
```

Single dependency declared. No `go.sum` yet. The BAML Go SDK will bring transitive dependencies that `go mod tidy` will resolve.

---

## BAML Configuration

### Generator (generators.baml)

- `output_type`: go
- `output_dir`: `../` — generates into `backend/` root, creating `baml_client/` there
- `version`: 0.216.0
- `client_go_package`: `github.com/hmw-workshop/backend`
- Post-generation hooks: `gofmt -w .`, `goimports -w .`, `go mod tidy`

The post-gen hooks mean `baml-cli generate` will automatically run `go mod tidy` after generating code, which should resolve all Go dependencies in one step.

### Client (clients.baml)

- Provider: anthropic
- Model: claude-sonnet-4-6
- API key from `env.ANTHROPIC_API_KEY`
- Max tokens: 4096
- Retry: exponential backoff, 2 retries, 500ms initial, 2x multiplier, 10s max

### Functions defined

| Function | Input | Output |
|---|---|---|
| RefinePersona | rawInput: string | Persona |
| AnalyzeHMW | statement: string, context: ProblemContext | HMWAnalysis |
| ExpandHMW | analysis: HMWAnalysis, context: ProblemContext | HMWExpansion |
| RefineHMW | session: HMWSession | HMWRefinement |

Each function has a corresponding streaming variant that BAML generates automatically.

### Types defined (types.baml)

Core types: Persona, Constraint, ProblemContext, HMWAnalysis, HMWVariant, HMWExpansion, CandidateStatus (enum), HMWCandidate, HMWSession, HMWRefinement.

---

## Handler Stubs (handlers.go)

All four handlers follow the same pattern:
1. Stub that returns `http.StatusNotImplemented`
2. TODO comment describing the expected flow: parse JSON body, call BAML function (streaming), write SSE events

The handlers reference types and functions that will exist in `baml_client/` once generated. They do NOT currently import `baml_client` — they are pure stubs.

---

## Toolchain Requirements

- **baml-cli**: Must be installed and available on PATH. The `generate` command reads `.baml` files from `baml_src/` and writes Go code to `baml_client/`.
- **goimports**: Required by the post-generation hook in generators.baml. Must be installed (`go install golang.org/x/tools/cmd/goimports@latest`).
- **Go 1.23+**: Module requires Go 1.23.

---

## Constraints & Risks

1. **BAML CLI version alignment**: The generators.baml specifies `version "0.216.0"` and go.mod requires `v0.216.0`. These must match the installed `baml-cli` version or generation may fail with version mismatch errors.
2. **goimports availability**: If `goimports` is not installed, the post-gen hook will fail. This is a soft dependency — generation itself succeeds, only the formatting hook fails.
3. **Network access**: `go mod tidy` needs network access to fetch the BAML Go SDK and its transitive dependencies.
4. **Generated code is not committed**: The `baml_client/` directory is generated output. Convention varies — some projects gitignore it, some commit it. The project has no `.gitignore` entry for it yet.
5. **Post-gen hook working directory**: The hooks run from the generator's output directory context. Since `output_dir` is `../` (backend root), hooks execute there.

---

## What This Ticket Does NOT Cover

- Implementing the actual handler logic (wiring BAML calls to HTTP)
- Frontend integration
- Deployment configuration
- BAML prompt testing against live LLMs
