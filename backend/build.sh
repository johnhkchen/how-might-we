#!/usr/bin/env bash
# Build the Go backend for Lambda (linux/arm64).
# Uses zig as a cross-compiler for CGo (BAML requires CGo).
# Install: brew install zig
set -euo pipefail

cd "$(dirname "$0")"

CGO_ENABLED=1 GOOS=linux GOARCH=arm64 \
  CC="zig cc -target aarch64-linux-gnu" \
  CXX="zig c++ -target aarch64-linux-gnu" \
  go build -tags lambda.norpc -o bootstrap .

echo "Built: backend/bootstrap ($(du -h bootstrap | cut -f1))"
