#!/usr/bin/env bash
# Build the Go backend for Lambda (linux/arm64).
# Downloads the BAML native library and cross-compiles using zig.
# Install: brew install zig
set -euo pipefail

cd "$(dirname "$0")"

# ── Download BAML native library ──────────────────────────────────────────────
# Extract BAML version from go.mod (single source of truth)
BAML_VERSION=$(grep 'boundaryml/baml' go.mod | awk '{print $2}' | sed 's/^v//')
LIB_FILENAME="libbaml_cffi-aarch64-unknown-linux-gnu.so"
DOWNLOAD_URL="https://github.com/boundaryml/baml/releases/download/${BAML_VERSION}/${LIB_FILENAME}"
CHECKSUM_URL="${DOWNLOAD_URL}.sha256"

download_lib() {
  echo "Downloading BAML native library (v${BAML_VERSION})..."

  # Download checksum file
  local checksum_file
  checksum_file=$(mktemp)
  trap "rm -f '$checksum_file'" RETURN
  if ! curl -fSL --retry 2 -o "$checksum_file" "$CHECKSUM_URL" 2>/dev/null; then
    echo "  Warning: checksum file not available, proceeding without verification"
    checksum_file=""
  fi

  # Download library
  curl -fSL --retry 2 -o "$LIB_FILENAME" "$DOWNLOAD_URL"

  # Verify checksum
  if [[ -n "$checksum_file" ]]; then
    local expected actual
    expected=$(awk -v f="$LIB_FILENAME" '$2 == f || $2 == ("*" f) {print $1}' "$checksum_file")
    if [[ -z "$expected" ]]; then
      # Some checksum files have just the hash on one line
      expected=$(head -1 "$checksum_file" | awk '{print $1}')
    fi
    actual=$(shasum -a 256 "$LIB_FILENAME" | awk '{print $1}')
    if [[ "$expected" != "$actual" ]]; then
      echo "  ERROR: Checksum mismatch!"
      echo "    Expected: $expected"
      echo "    Actual:   $actual"
      rm -f "$LIB_FILENAME"
      exit 1
    fi
    echo "  Checksum verified."
  fi

  echo "  Downloaded: $LIB_FILENAME ($(du -h "$LIB_FILENAME" | cut -f1))"
}

if [[ -f "$LIB_FILENAME" ]]; then
  echo "BAML native library already present, skipping download."
else
  download_lib
fi

# ── Build Go binary ──────────────────────────────────────────────────────────
CGO_ENABLED=1 GOOS=linux GOARCH=arm64 \
  CC="zig cc -target aarch64-linux-gnu" \
  CXX="zig c++ -target aarch64-linux-gnu" \
  go build -tags lambda.norpc -o bootstrap .

echo "Built: backend/bootstrap ($(du -h bootstrap | cut -f1))"
