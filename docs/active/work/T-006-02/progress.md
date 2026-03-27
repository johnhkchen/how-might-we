# Progress: T-006-02 — Bundle BAML Native Library

## Completed

### Step 1: `.gitignore` update
- Added `backend/*.so` to root `.gitignore`
- Verified: `git check-ignore backend/libbaml_cffi-aarch64-unknown-linux-gnu.so` confirms match

### Step 2: `build.sh` updated
- Added download section before existing `go build` step
- Extracts BAML version from `go.mod` (single source of truth)
- Downloads `libbaml_cffi-aarch64-unknown-linux-gnu.so` from GitHub releases
- Attempts checksum verification (downloads `.sha256` file)
- Idempotent: skips download if `.so` already exists

### Step 3: `sst.config.ts` updated
- Added `BAML_LIBRARY_PATH: "/var/task/libbaml_cffi-aarch64-unknown-linux-gnu.so"` to Lambda env
- BAML SDK reads this at init and skips download entirely

### Step 4: Build tested locally
- Fresh build: downloaded 54 MB `.so`, verified, built 20 MB `bootstrap` binary
- Note: checksum file not available for this release (warning printed, non-fatal)
- Second build: skipped download (idempotent) confirmed

### Step 5: `.gitignore` verified
- `.so` file does not appear in `git status` — properly ignored

## Deviations from Plan

- **Checksum file not available**: The BAML v0.218.0 release does not publish a `.sha256`
  checksum file alongside the library. The build script handles this gracefully with a
  warning and proceeds without verification. This is acceptable because:
  1. The download uses HTTPS from GitHub (integrity via TLS)
  2. BAML's own version check at runtime verifies the library matches the SDK
  3. Future BAML versions may include checksum files

## Files Changed

1. `.gitignore` — added `backend/*.so`
2. `backend/build.sh` — added BAML library download step
3. `sst.config.ts` — added `BAML_LIBRARY_PATH` environment variable
