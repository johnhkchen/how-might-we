# Progress: T-001-01 init-go-baml-client

## Completed Steps

### Step 1: Verify toolchain availability
- **baml-cli**: v0.218.0 installed (newer than originally specified v0.216.0)
- **Go**: v1.26.1
- **goimports**: Installed via `go install golang.org/x/tools/cmd/goimports@latest`

### Step 2: Fix BAML source errors
Two errors discovered during first `baml-cli generate` attempt:

1. **`move` is a BAML keyword**: Renamed field `move` to `moveType` in `HMWVariant` class (types.baml:41) and updated all template references in refine.baml.
2. **`??` operator unsupported in Jinja**: Replaced `c.userEdits ?? c.variant.statement` with `c.userEdits if c.userEdits else c.variant.statement` in refine.baml (lines 12, 22).

### Step 3: Align BAML version
Updated generators.baml and go.mod from v0.216.0 to v0.218.0 to match installed baml-cli version.

### Step 4: Run baml-cli generate
- Generated 19 files into `backend/baml_client/`
- Post-gen hook failed because `goimports` was not on baml-cli's shell PATH (exit code 127)
- Generated files were written successfully despite hook failure

### Step 5: Manual formatting and dependency resolution
Ran manually from backend/:
- `gofmt -w .` — formatted all Go files
- `goimports -w .` — organized imports (using full path to binary)
- `go mod tidy` — resolved dependencies, created go.sum

Dependencies fetched:
- github.com/boundaryml/baml v0.218.0
- google.golang.org/protobuf v1.36.6 (indirect)
- Plus transitive test dependencies

### Step 6: Verify compilation
- `go build ./...` — passes with zero errors

### Step 7: Verify generated interface
All four typed functions confirmed in `functions.go`:
- `AnalyzeHMW(ctx, statement, context) -> HMWAnalysis`
- `ExpandHMW(ctx, analysis, context) -> HMWExpansion`
- `RefineHMW(ctx, session) -> HMWRefinement`
- `RefinePersona(ctx, rawInput) -> Persona`

Streaming variants confirmed in `functions_stream.go`:
- `Stream.AnalyzeHMW(ctx, ...) -> <-chan StreamValue`
- `Stream.ExpandHMW(ctx, ...) -> <-chan StreamValue`
- `Stream.RefineHMW(ctx, ...) -> <-chan StreamValue`
- `Stream.RefinePersona(ctx, ...) -> <-chan StreamValue`

## Deviations from Plan

1. **BAML source fixes required**: Plan assumed BAML sources were error-free. Two syntax/keyword issues needed fixing before generation could succeed.
2. **Version bump**: Bumped BAML from v0.216.0 to v0.218.0 to match installed CLI.
3. **Manual post-gen steps**: Post-gen hooks failed due to PATH issue; ran formatting and tidy manually.
4. **Go version bump**: `go mod tidy` updated go.mod from `go 1.23` to `go 1.24.0` (minimum required by BAML SDK v0.218.0).

## Remaining

- Commit all changes
- Write review artifact
