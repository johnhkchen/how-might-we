# Structure: T-001-01 init-go-baml-client

## Overview

This ticket produces no hand-written code. All changes come from running `baml-cli generate` and `go mod tidy`. The structure below documents what gets created and modified.

---

## Files Created (by baml-cli generate)

### backend/baml_client/

The entire `baml_client/` directory is generated output. The exact file list depends on the BAML Go codegen version, but will include:

```
backend/baml_client/
├── *.go                # Generated Go source files
```

The generated package provides:
- **Type definitions**: Go structs for all BAML types (Persona, Constraint, ProblemContext, HMWAnalysis, HMWVariant, HMWExpansion, CandidateStatus, HMWCandidate, HMWSession, HMWRefinement)
- **Function wrappers**: Typed Go functions for RefinePersona, AnalyzeHMW, ExpandHMW, RefineHMW
- **Streaming variants**: Stream-based wrappers for each function
- **Client initialization**: Constructor/initialization code for the BAML runtime

Package path: `github.com/hmw-workshop/backend/baml_client` (as configured in generators.baml `client_go_package`)

### backend/go.sum

Created by `go mod tidy`. Contains cryptographic hashes of all direct and transitive dependencies.

---

## Files Modified

### backend/go.mod

Modified by `go mod tidy` to:
- Add any transitive dependencies required by the BAML Go SDK
- Add `require` blocks for indirect dependencies
- Potentially adjust the `go` directive if needed

---

## Files NOT Modified

| File | Why unchanged |
|---|---|
| backend/main.go | No changes — server setup is complete |
| backend/handlers.go | Remains as stubs — handler wiring is a separate ticket |
| backend/middleware.go | No changes needed |
| backend/baml_src/*.baml | Source files are already complete and correct |

---

## Module Boundaries

```
backend/
├── main.go, handlers.go, middleware.go    # package main — HTTP layer
├── baml_client/                           # package baml_client — generated BAML client
│   └── (generated files)                  #   imported by handlers in future tickets
└── baml_src/                              # BAML source (not Go code)
```

The `baml_client` package is a dependency of `package main` but is NOT imported yet (handlers are stubs). The generated package must compile standalone.

---

## Ordering of Changes

1. **Ensure tooling is available**: baml-cli, goimports (optional)
2. **Run `baml-cli generate`** from backend/ — creates baml_client/ and runs post-gen hooks
3. **Run `go mod tidy`** if not handled by post-gen hooks — resolves dependencies
4. **Run `go build ./...`** — verifies everything compiles
5. **Inspect generated client** — verify function signatures and streaming variants exist

Steps 2-3 may collapse into a single step if post-gen hooks succeed. Step 4 is pure verification.

---

## Interface Contract

The generated `baml_client` package must expose (verified by `go build` + grep):

```go
// Typed function calls
func RefinePersona(ctx context.Context, rawInput string) (Persona, error)
func AnalyzeHMW(ctx context.Context, statement string, context ProblemContext) (HMWAnalysis, error)
func ExpandHMW(ctx context.Context, analysis HMWAnalysis, context ProblemContext) (HMWExpansion, error)
func RefineHMW(ctx context.Context, session HMWSession) (HMWRefinement, error)

// Streaming variants (exact API shape depends on BAML version)
// Typically: Stream prefix or method returning a channel/iterator

// Types
type Persona struct { ... }
type ProblemContext struct { ... }
type HMWAnalysis struct { ... }
type HMWExpansion struct { ... }
type HMWSession struct { ... }
type HMWRefinement struct { ... }
// etc.
```

The exact signatures may differ (e.g., methods on a client struct vs package-level functions), but the type names and function names must match the BAML definitions.

---

## No .gitignore Changes

The generated `baml_client/` will be committed (per design decision). No gitignore updates needed for this directory.
