# Research: T-006-02 — Bundle BAML Native Library

## Problem

Every Lambda cold start downloads `libbaml_cffi-aarch64-unknown-linux-gnu.so` (54 MB) from
GitHub releases. This adds ~1-2 seconds to init. The file is cached in `/tmp/.cache/baml/libs/`
but Lambda `/tmp` is ephemeral — cleared between cold starts.

Prior review (T-004-01) measured cold start at ~972ms, dominated by this download.

## BAML Native Library Loading — How It Works

The BAML Go SDK uses a native shared library loaded via `dlopen` at init time. The loading
logic lives in the vendored SDK:

**File:** `engine/language_client_go/baml_go/lib_common.go`

### Search Order (`findOrDownloadLibrary`, line 248)

1. **`SetSharedLibraryPath()` (programmatic)** — checks `bamlSharedLibraryPath` global var
2. **`BAML_LIBRARY_PATH` env var** — if set and file exists, uses it directly (line 259-268)
3. **Cache directory** — `$HOME/.cache/baml/libs/{VERSION}/{filename}` (line 282-289)
4. **Download from GitHub** — `https://github.com/boundaryml/baml/releases/download/{VERSION}/{filename}`
5. **System paths** — `/usr/local/lib/libbaml-{VERSION}.so` or `/usr/local/lib/libbaml.so`

### Key Constants (line 34-39)

```go
const (
    VERSION            = "0.218.0"
    githubRepo         = "boundaryml/baml"
    bamlCacheDirEnvVar = "BAML_CACHE_DIR"
    bamlLibraryPathEnv = "BAML_LIBRARY_PATH"      // <-- This is our lever
    bamlDisableDlEnv   = "BAML_LIBRARY_DISABLE_DOWNLOAD"
)
```

### Target Filename (line 413-463)

For `linux/arm64` (non-musl): `libbaml_cffi-aarch64-unknown-linux-gnu.so`

Download URL: `https://github.com/boundaryml/baml/releases/download/0.218.0/libbaml_cffi-aarch64-unknown-linux-gnu.so`

### Version Check (line 170-178)

After loading, BAML verifies the library version matches `VERSION` (0.218.0). A mismatch
panics. The bundled library must match the Go SDK version exactly.

## Current Build Pipeline

### `backend/build.sh`

Cross-compiles Go binary for `linux/arm64` using zig as CGo cross-compiler:

```bash
CGO_ENABLED=1 GOOS=linux GOARCH=arm64 \
  CC="zig cc -target aarch64-linux-gnu" \
  CXX="zig c++ -target aarch64-linux-gnu" \
  go build -tags lambda.norpc -o bootstrap .
```

Produces `backend/bootstrap` (~20 MB). No native library bundling.

### `scripts/deploy.sh`

1. Runs `backend/build.sh`
2. Deploys via `npx sst deploy`
3. Sets worker secrets, deploys worker, builds and deploys frontend

### `sst.config.ts`

```typescript
const api = new sst.aws.Function("HmwApi", {
  bundle: "backend",        // Zips entire backend/ directory
  handler: "bootstrap",
  runtime: "provided.al2023",
  architecture: "arm64",
  environment: {
    HOME: "/tmp",           // BAML cache resolves to /tmp/.cache/baml/libs/
    ANTHROPIC_API_KEY: ...,
  },
});
```

`bundle: "backend"` tells SST to zip the contents of `backend/`. The zip includes `bootstrap`,
`baml_src/`, generated Go files, Go source files, `go.mod`, `go.sum`, etc. Only `bootstrap`
and `baml_src/` are needed at runtime.

## Lambda Runtime Environment

- Runtime: `provided.al2023` (Amazon Linux 2023)
- Architecture: `arm64` (Graviton)
- Working directory: `/var/task/` (contents of the zip)
- Writable: `/tmp` only (ephemeral, up to 512 MB default)
- HOME: set to `/tmp` (so BAML cache goes to `/tmp/.cache/baml/libs/0.218.0/`)

## What Gets Bundled Today

SST zips everything in `backend/`. At runtime, `/var/task/` contains:

```
/var/task/
├── bootstrap              # Go binary (20 MB)
├── build.sh               # Not needed at runtime
├── Dockerfile             # Not needed at runtime
├── go.mod, go.sum         # Not needed at runtime
├── *.go                   # Not needed at runtime
├── baml_src/              # Needed — read by BAML at init
├── baml_client/           # Not needed — compiled into bootstrap
└── resource.enc           # Encrypted resource file
```

## Constraints and Risks

1. **Version coupling**: The `.so` must match BAML SDK version (0.218.0) exactly.
   If someone bumps `go.mod`, the build must also update the downloaded `.so`.
2. **Bundle size**: Lambda deployment package limit is 50 MB (zip) or 250 MB (unzipped).
   Adding 54 MB `.so` to the 20 MB binary = ~74 MB unzipped. Compressed, the `.so` should
   be ~15-20 MB, keeping total zip under 50 MB.
3. **SST bundle behavior**: `bundle: "backend"` includes everything in the directory.
   The `.so` just needs to be placed in `backend/` before `sst deploy`.
4. **`BAML_LIBRARY_PATH`**: Must point to the exact file path (not directory). In Lambda,
   this would be `/var/task/libbaml_cffi-aarch64-unknown-linux-gnu.so`.
5. **Local dev unaffected**: `BAML_LIBRARY_PATH` would only be set in the Lambda environment
   config in `sst.config.ts`. Local dev uses BAML's normal cache mechanism.
6. **Checksum verification**: BAML downloads a `.sha256` alongside the library. Build script
   should verify checksum too.

## Existing Patterns

- `backend/build.sh` already handles cross-compilation complexity (zig, CGo).
  Adding a download step to this script is the natural extension.
- `scripts/deploy.sh` calls `build.sh` then deploys. No changes needed there if
  `build.sh` handles everything.
- `.gitignore` needs to exclude the downloaded `.so` file (large binary).
