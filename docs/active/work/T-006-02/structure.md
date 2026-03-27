# Structure: T-006-02 — Bundle BAML Native Library

## Files Modified

### 1. `backend/build.sh`

Add a download step before the existing `go build` command. The script becomes:

```
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

# --- NEW: Download BAML native library ---
# Extract BAML version from go.mod
# Construct filename and URL
# Check if already downloaded (skip if exists with correct checksum)
# Download .so and .sha256 checksum
# Verify checksum
# --- END NEW ---

# --- EXISTING: Cross-compile Go binary ---
CGO_ENABLED=1 GOOS=linux GOARCH=arm64 ...
echo "Built: backend/bootstrap ..."
```

**Interface:** No change. Script still produces the build artifacts in `backend/`.
The `.so` file is placed in `backend/` alongside `bootstrap`.

**Key behaviors:**
- Idempotent: skips download if `.so` already exists with correct checksum
- Fails fast on network error or checksum mismatch
- Extracts version from `go.mod` (single source of truth)

### 2. `sst.config.ts`

Add `BAML_LIBRARY_PATH` to the Lambda environment variables.

```typescript
environment: {
  HOME: "/tmp",
  ANTHROPIC_API_KEY: anthropicKey.value,
  BAML_LIBRARY_PATH: "/var/task/libbaml_cffi-aarch64-unknown-linux-gnu.so",  // NEW
},
```

**Impact:** BAML's `findOrDownloadLibrary()` checks this env var at step 2 of its
search order, finds the file, and skips all download logic.

### 3. `backend/.gitignore`

Add entry to exclude the native library from version control:

```
*.so
```

This prevents the 54 MB binary from being committed. The file is downloaded at
build time — it's a build artifact, not source.

## Files NOT Modified

- **`backend/baml_client/runtime.go`** — Generated code. No changes needed. The env var
  is read by the BAML SDK's `lib_common.go`, not by generated code.
- **`backend/main.go`** — No changes. Library loading happens in BAML's `init()`.
- **`scripts/deploy.sh`** — No changes. Already calls `backend/build.sh` which will now
  handle the download. The rest of the pipeline is unchanged.
- **`scripts/verify-deploy.sh`** — No changes needed. Existing TTFB timing tests will
  validate the improvement.
- **Go source files** — No Go code changes. This is purely a build/config change.

## Runtime Layout (Lambda)

After deployment, `/var/task/` will contain:

```
/var/task/
├── bootstrap                                          # Go binary (20 MB)
├── libbaml_cffi-aarch64-unknown-linux-gnu.so          # BAML native lib (54 MB) — NEW
├── baml_src/                                          # BAML definitions
│   ├── clients.baml
│   ├── types.baml
│   ├── persona.baml
│   ├── analyze.baml
│   ├── expand.baml
│   ├── refine.baml
│   └── generators.baml
└── [other files from backend/ — unused at runtime]
```

## Init Flow (After Change)

```
Lambda cold start
  → Go binary starts
  → BAML init() runs
  → findOrDownloadLibrary()
    → Step 1: SetSharedLibraryPath not called → skip
    → Step 2: BAML_LIBRARY_PATH="/var/task/libbaml_cffi-..."
      → os.Stat() → file exists → use it  ← RETURNS HERE
    → (steps 3-5 never reached)
  → dlopen() loads library from /var/task/
  → BAML runtime ready (~ms instead of ~1-2s)
```

## Ordering

Changes are independent — `build.sh` and `sst.config.ts` can be modified in either order.
Both must be in place before deploy for the optimization to take effect.

## Boundary

This ticket touches only the build pipeline and infra config. No application code changes.
The `.so` file is an opaque binary artifact — we download it, place it, and tell BAML
where it is.
