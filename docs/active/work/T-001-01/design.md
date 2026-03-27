# Design: T-001-01 init-go-baml-client

## Problem

Generate the BAML Go client and resolve all Go module dependencies so the backend compiles. The BAML source files are complete; the generated client directory does not exist.

---

## Approach Options

### Option A: Run baml-cli generate with post-gen hooks

Run `baml-cli generate` from `backend/`, let the post-gen hooks in generators.baml handle `gofmt`, `goimports`, and `go mod tidy` automatically.

**Pros:**
- Single command does everything
- Hooks are already configured in generators.baml
- Matches the documented workflow in CLAUDE.md

**Cons:**
- Requires `goimports` to be installed (post-gen hook dependency)
- If any hook fails, the entire generate step may report failure even though code was generated
- Opaque — hard to diagnose which step failed

### Option B: Run baml-cli generate, then manually run go mod tidy

Run `baml-cli generate` first. If post-gen hooks fail (e.g., missing goimports), manually run the formatting and dependency steps.

**Pros:**
- More control over each step
- Can diagnose and fix issues at each stage
- Does not depend on goimports being pre-installed

**Cons:**
- More manual steps
- Slightly diverges from the "single command" workflow

### Option C: Manually create baml_client stubs

Write Go files that match the expected BAML client interface by hand.

**Pros:**
- No dependency on baml-cli toolchain
- Full control over generated code

**Cons:**
- Defeats the purpose of BAML
- Generated code will diverge from BAML definitions on any schema change
- Enormous maintenance burden
- Violates project convention: "All LLM calls go through BAML"

---

## Decision: Option B

**Rationale:** Option B is the pragmatic choice. We run `baml-cli generate` and handle any post-gen hook failures manually. This gives us visibility into each step and lets us recover from missing tools (like goimports) without blocking the entire process.

Option A would work in a fully-configured dev environment, but we cannot assume `goimports` is installed. Option C is antithetical to the project's architecture.

**Rejected:**
- Option A: Too fragile if goimports is missing. We can always fall back to it once the environment is confirmed.
- Option C: Violates project conventions and creates unmaintainable code.

---

## Key Design Decisions

### 1. Generated code WILL be committed

The `baml_client/` directory should be committed to the repository. Reasons:
- Other tickets (handler implementation) depend on importing `baml_client` — they should not need to run `baml-cli generate` first
- CI builds should work without installing baml-cli
- The generated code is deterministic given the same BAML source and version

### 2. goimports is a nice-to-have, not a blocker

If goimports is not installed, we install it. If that fails, we skip it — `gofmt` alone produces valid Go code. The BAML generator produces valid Go regardless of the formatting hooks.

### 3. Verification strategy

After generation, verify all acceptance criteria:
1. `baml_client/` directory exists with Go files
2. `go mod tidy` succeeds (produces go.sum)
3. `go build ./...` compiles without errors
4. Generated client exposes the four typed functions
5. Generated client exposes streaming variants

### 4. No handler changes in this ticket

The handlers remain stubs. This ticket only ensures the generated client exists and the module compiles. Wiring handlers to the BAML client is a separate ticket.

---

## Expected Generated Output

Based on BAML Go codegen conventions, `baml-cli generate` will create:

```
backend/baml_client/
├── client.go           # BamlClient struct with typed methods
├── types.go            # Go structs matching BAML types
├── stream.go           # Streaming variants of each function
└── ...                 # Internal helpers, inlined runtime
```

The generated package will expose:
- `baml_client.NewBamlClient()` or similar constructor
- Methods: `RefinePersona()`, `AnalyzeHMW()`, `ExpandHMW()`, `RefineHMW()`
- Streaming wrappers for each method
- Go struct types for Persona, ProblemContext, HMWAnalysis, HMWExpansion, HMWSession, HMWRefinement, etc.

---

## Risk Mitigation

| Risk | Mitigation |
|---|---|
| baml-cli not installed | Check first, provide install instructions if missing |
| Version mismatch between CLI and go.mod | Verify baml-cli version matches v0.216.0 |
| goimports not available | Install it, or skip — not a blocker |
| Network issues during go mod tidy | Retry; dependencies are from well-known Go module proxies |
| Generated code doesn't compile | Investigate BAML source errors; the types.baml and function definitions are already complete |
