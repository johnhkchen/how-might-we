# Design: T-006-02 — Bundle BAML Native Library

## Decision

**Download the `.so` in `build.sh`, place it alongside `bootstrap`, set `BAML_LIBRARY_PATH`
in SST config.** This is the simplest approach that uses BAML's built-in env var support.

## Options Evaluated

### Option A: Download in `build.sh`, set `BAML_LIBRARY_PATH` (Chosen)

Add a download step to `backend/build.sh` that fetches the correct `.so` from GitHub
releases and places it in `backend/`. SST's `bundle: "backend"` automatically includes it
in the Lambda zip. Set `BAML_LIBRARY_PATH` in `sst.config.ts` to the path in Lambda's
`/var/task/` directory.

**Pros:**
- Minimal changes (2 files: `build.sh`, `sst.config.ts`)
- Uses BAML's documented `BAML_LIBRARY_PATH` env var — first-class support
- Library downloaded once at build time, not on every cold start
- No changes to Go code
- Local dev completely unaffected (env var only set in Lambda)
- Checksum verification at build time catches corruption early

**Cons:**
- Build script needs network access (acceptable — it already needs Go modules)
- Must keep `.so` version in sync with `go.mod` BAML version

### Option B: Docker-based build that caches the library

Use the existing `Dockerfile` to build in a Linux container where BAML can download
the library natively during the build stage, then copy it out.

**Rejected:** Overcomplicates the build pipeline. Current flow uses `zig cc` for
cross-compilation without Docker. Requiring Docker for builds adds a dependency and
slows CI. The native library can be downloaded directly via HTTP — no Linux environment
needed.

### Option C: Lambda layer containing the BAML library

Create a Lambda layer with the `.so` file. Layers are extracted to `/opt/` at runtime.
Set `BAML_LIBRARY_PATH=/opt/libbaml_cffi-aarch64-unknown-linux-gnu.so`.

**Rejected:** Adds infrastructure complexity (separate layer resource in SST, versioning,
deployment coordination). Layers are useful for sharing across functions, but we have one
function. The simpler approach of including the file in the bundle achieves the same result.

### Option D: Use `BAML_CACHE_DIR` to point to a persistent location

Set `BAML_CACHE_DIR` to an EFS mount or S3-backed path.

**Rejected:** EFS adds latency and cost. S3 doesn't work as a filesystem path. This
doesn't eliminate the download — it just changes where the cache lives. The library would
still be downloaded on the first cold start after cache eviction.

### Option E: Embed the library in the Go binary

Use Go's `//go:embed` to include the `.so` as a byte slice, write it to `/tmp` at init,
and load it from there.

**Rejected:** Increases binary size by 54 MB (compressed). Writing to `/tmp` on every
cold start adds I/O latency. The library is already a file — embedding it just to extract
it is wasteful. Direct bundling is cleaner.

## Design Details

### Build-Time Download

The `build.sh` script will:

1. Determine the BAML version from `go.mod` (grep `boundaryml/baml`)
2. Construct the download URL and filename:
   - Filename: `libbaml_cffi-aarch64-unknown-linux-gnu.so`
   - URL: `https://github.com/boundaryml/baml/releases/download/{VERSION}/{FILENAME}`
3. Skip download if file already exists and checksum matches (idempotent builds)
4. Download the `.so` file
5. Download the `.sha256` checksum file and verify
6. Build the Go binary (existing step)

### Lambda Configuration

In `sst.config.ts`, add `BAML_LIBRARY_PATH` to the environment:

```typescript
environment: {
  HOME: "/tmp",
  ANTHROPIC_API_KEY: anthropicKey.value,
  BAML_LIBRARY_PATH: "/var/task/libbaml_cffi-aarch64-unknown-linux-gnu.so",
},
```

### Bundle Size

- Current zip: ~8 MB (20 MB bootstrap + source files, compressed)
- Added: ~54 MB `.so` file (compresses to ~15-18 MB)
- Expected zip: ~23-26 MB (well under 50 MB limit)
- Unzipped: ~74 MB (well under 250 MB limit)

### Version Synchronization

The build script extracts the BAML version from `go.mod` to ensure the downloaded
`.so` matches the SDK version. This is a single source of truth — updating `go.mod`
automatically changes the download URL.

### `.gitignore`

Add `*.so` to `backend/.gitignore` to prevent the 54 MB binary from being committed.

### Cold Start Impact

Current path: Lambda starts -> BAML init -> HTTP download 54 MB from GitHub (~1-2s)
New path: Lambda starts -> BAML init -> finds library at `BAML_LIBRARY_PATH` -> dlopen (~ms)

Expected init time reduction: ~1-2 seconds, bringing cold start well under 200ms
for the BAML library loading portion.

### Failure Modes

- **Network failure during build**: Build fails (intentional — we want to catch this early)
- **Checksum mismatch**: Build fails with clear error
- **Version mismatch**: BAML's own version check panics at runtime — but since we extract
  version from `go.mod`, this shouldn't happen unless GitHub releases are tampered with
- **Missing file in Lambda**: BAML prints clear error when `BAML_LIBRARY_PATH` file doesn't
  exist. This would indicate a bundling problem.
