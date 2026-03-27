# Plan: T-001-01 init-go-baml-client

## Prerequisites

Before starting, verify:
- `baml-cli` is installed and on PATH
- Go 1.23+ is installed
- Network access for `go mod tidy`

---

## Steps

### Step 1: Verify toolchain availability

- Run `baml-cli --version` — confirm installed and check version
- Run `go version` — confirm Go 1.23+
- Run `which goimports` — check if available; install if not (`go install golang.org/x/tools/cmd/goimports@latest`)

**Verification**: All three tools report versions without error.

### Step 2: Run baml-cli generate

- `cd backend && baml-cli generate`
- This reads `baml_src/*.baml`, generates Go code into `baml_client/`
- Post-gen hooks run: `gofmt -w .`, `goimports -w .`, `go mod tidy`

**Verification**:
- `backend/baml_client/` directory exists
- Contains `.go` files
- Exit code is 0

**Fallback**: If post-gen hooks fail (e.g., goimports not found), the generated code still exists. Proceed to Step 3 manually.

### Step 3: Resolve dependencies (if needed)

If `go mod tidy` was not run by the post-gen hook:
- `cd backend && go mod tidy`

**Verification**:
- `go.sum` exists
- `go.mod` has resolved indirect dependencies
- Exit code is 0

### Step 4: Verify compilation

- `cd backend && go build ./...`

**Verification**: Exit code is 0, no compilation errors.

### Step 5: Verify generated client interface

Inspect the generated `baml_client/` to confirm:
- [ ] Typed functions exist: RefinePersona, AnalyzeHMW, ExpandHMW, RefineHMW
- [ ] Streaming variants exist
- [ ] All BAML types are represented as Go structs

Method: grep for function/type names in generated files.

### Step 6: Commit

Commit all generated and modified files:
- `backend/baml_client/` (new directory)
- `backend/go.mod` (modified by go mod tidy)
- `backend/go.sum` (new file)

Commit message: `feat(backend): generate BAML Go client and resolve dependencies`

---

## Testing Strategy

This ticket has no hand-written code, so traditional unit tests don't apply. Verification is:

1. **Compilation test**: `go build ./...` passes — this is the primary gate
2. **Interface inspection**: Generated code contains expected function signatures and types
3. **No runtime tests**: The generated client calls an LLM; runtime testing requires API keys and is covered by `baml-cli test` (separate ticket)

---

## Rollback

If generation produces broken code:
1. Delete `backend/baml_client/` entirely
2. Revert `go.mod` changes
3. Delete `go.sum`
4. Investigate BAML source errors and retry

---

## Estimated File Count

- New files: ~5-20 (generated baml_client/*.go) + 1 (go.sum)
- Modified files: 1 (go.mod)
- Deleted files: 0
