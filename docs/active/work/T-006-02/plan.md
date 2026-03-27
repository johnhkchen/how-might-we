# Plan: T-006-02 — Bundle BAML Native Library

## Step 1: Add `.gitignore` entry

**File:** `backend/.gitignore`

Add `*.so` to prevent the native library from being committed.

**Verify:** `git check-ignore backend/libbaml_cffi-aarch64-unknown-linux-gnu.so` returns
the file path (confirming it would be ignored).

## Step 2: Update `build.sh` to download the BAML native library

**File:** `backend/build.sh`

Add a download section before the existing `go build` command:

1. Extract BAML version from `go.mod`:
   ```bash
   BAML_VERSION=$(grep 'boundaryml/baml' go.mod | awk '{print $2}' | sed 's/^v//')
   ```

2. Set filename and URL:
   ```bash
   LIB_FILENAME="libbaml_cffi-aarch64-unknown-linux-gnu.so"
   DOWNLOAD_URL="https://github.com/boundaryml/baml/releases/download/${BAML_VERSION}/${LIB_FILENAME}"
   CHECKSUM_URL="${DOWNLOAD_URL}.sha256"
   ```

3. Skip if already present with correct checksum:
   - If `.so` exists, download `.sha256`, compare with `sha256sum` of local file
   - If match, skip download

4. Download `.so` and `.sha256` files:
   - Use `curl -fSL` for fail-fast behavior
   - Download to a temp file first, verify checksum, then move into place

5. Verify checksum:
   - Parse the `.sha256` file for the expected hash
   - Compare with `sha256sum` or `shasum -a 256` of the downloaded file
   - Fail the build if mismatch

**Verify:** Run `bash backend/build.sh` locally. Confirm it downloads the `.so` file
and produces `bootstrap`. Run again to confirm idempotent skip.

## Step 3: Update SST config with `BAML_LIBRARY_PATH`

**File:** `sst.config.ts`

Add `BAML_LIBRARY_PATH` to the Lambda environment:

```typescript
environment: {
  HOME: "/tmp",
  ANTHROPIC_API_KEY: anthropicKey.value,
  BAML_LIBRARY_PATH: "/var/task/libbaml_cffi-aarch64-unknown-linux-gnu.so",
},
```

**Verify:** Read the file and confirm the env var is correctly placed.

## Step 4: Test build locally

Run the full build to verify everything works:

```bash
cd backend && bash build.sh
```

Expected output:
- Downloads `.so` file (~54 MB) on first run
- Verifies checksum
- Builds `bootstrap` binary
- Second run skips download (idempotent)

Verify artifacts:
```bash
ls -lh backend/bootstrap backend/libbaml_cffi-aarch64-unknown-linux-gnu.so
```

## Step 5: Verify `.gitignore` works

```bash
git status  # .so file should not appear as untracked
```

## Testing Strategy

### Build-time tests (local)

1. **Fresh build**: Delete `.so`, run `build.sh` — should download and verify checksum
2. **Idempotent build**: Run `build.sh` again — should skip download
3. **Corrupt file**: Truncate `.so`, run `build.sh` — should re-download
4. **Git ignore**: Verify `.so` not tracked by git

### Deploy-time tests (after deploy — not in this ticket's scope)

The existing `scripts/verify-deploy.sh` tests TTFB timing. After deploying with
this change, cold start should drop from ~972ms to under 200ms. This can be verified
by invoking the Lambda after a fresh deploy.

### What does NOT need testing

- BAML's `BAML_LIBRARY_PATH` handling — this is BAML SDK code, tested by BoundaryML
- Lambda runtime file layout — SST's `bundle` option is well-established
- Go binary functionality — no application code changes
