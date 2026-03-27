#!/usr/bin/env bash
# Full-stack deploy: backend (Lambda) + worker (CF Worker) + frontend (CF Pages).
# Usage: bash scripts/deploy.sh [--stage STAGE]
#
# Prerequisites:
#   - AWS credentials configured (profile "sst" or AWS_PROFILE set)
#   - Cloudflare credentials (wrangler login or CLOUDFLARE_API_TOKEN)
#   - zig installed (brew install zig) for backend cross-compilation
#   - Doppler not needed (secrets injected via SST Secrets + Wrangler Secrets)
set -euo pipefail

STAGE="production"
TURNSTILE_SITE_KEY="${TURNSTILE_SITE_KEY:-}"  # Turnstile site key for bot protection (optional)
FRONTEND_URL="${FRONTEND_URL:-}"              # CF Pages URL for CORS lockdown (e.g., https://hmw-workshop.pages.dev)
while [[ $# -gt 0 ]]; do
  case "$1" in
    --stage) STAGE="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
echo "=== Deploying hmw-workshop (stage: $STAGE) ==="

if [[ -n "$FRONTEND_URL" ]]; then
  echo "  CORS locked to: $FRONTEND_URL"
else
  echo "  ⚠ FRONTEND_URL not set — CORS will allow all origins"
fi

# ──────────────────────────────────────────────
# Step 1: Build backend binary
# ──────────────────────────────────────────────
echo ""
echo "▸ Step 1/6: Building backend binary..."
cd "$ROOT/backend"
bash build.sh
echo "  ✓ Backend binary built"

# ──────────────────────────────────────────────
# Step 2: Deploy Lambda via SST
# ──────────────────────────────────────────────
echo ""
echo "▸ Step 2/6: Deploying Lambda via SST..."
cd "$ROOT"
SST_OUTPUT=$(FRONTEND_URL="$FRONTEND_URL" npx sst deploy --stage "$STAGE" 2>&1) || {
  echo "  ✗ SST deploy failed:"
  echo "$SST_OUTPUT"
  exit 1
}
echo "$SST_OUTPUT"

# Extract apiUrl from SST output (format: "apiUrl: https://...")
API_URL=$(echo "$SST_OUTPUT" | grep -oP 'apiUrl:\s*\K\S+' || true)
if [[ -z "$API_URL" ]]; then
  echo "  ✗ Could not extract apiUrl from SST output."
  echo "  Paste the Lambda Function URL manually:"
  read -r API_URL
fi
echo "  ✓ Lambda deployed: $API_URL"

# ──────────────────────────────────────────────
# Step 3: Set LAMBDA_URL secret on Worker
# ──────────────────────────────────────────────
echo ""
echo "▸ Step 3/6: Setting LAMBDA_URL on Worker..."
cd "$ROOT/worker"
echo "$API_URL" | npx wrangler secret put LAMBDA_URL
echo "  ✓ LAMBDA_URL secret set"

# ──────────────────────────────────────────────
# Step 3b: Set ALLOWED_ORIGIN on Worker (CORS lockdown)
# ──────────────────────────────────────────────
if [[ -n "$FRONTEND_URL" ]]; then
  echo ""
  echo "▸ Step 3b/6: Setting ALLOWED_ORIGIN on Worker..."
  echo "$FRONTEND_URL" | npx wrangler secret put ALLOWED_ORIGIN
  echo "  ✓ ALLOWED_ORIGIN secret set to $FRONTEND_URL"
fi

# ──────────────────────────────────────────────
# Step 4: Deploy Worker
# ──────────────────────────────────────────────
echo ""
echo "▸ Step 4/6: Deploying Worker..."
cd "$ROOT/worker"
WORKER_OUTPUT=$(npx wrangler deploy 2>&1) || {
  echo "  ✗ Worker deploy failed:"
  echo "$WORKER_OUTPUT"
  exit 1
}
echo "$WORKER_OUTPUT"

# Extract Worker URL from output
WORKER_URL=$(echo "$WORKER_OUTPUT" | grep -oP 'https://[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev' | head -1 || true)
if [[ -z "$WORKER_URL" ]]; then
  echo "  Could not extract Worker URL from output."
  echo "  Paste the Worker URL manually:"
  read -r WORKER_URL
fi
echo "  ✓ Worker deployed: $WORKER_URL"

# ──────────────────────────────────────────────
# Step 5: Build frontend
# ──────────────────────────────────────────────
echo ""
echo "▸ Step 5/6: Building frontend with PUBLIC_API_URL=$WORKER_URL..."
cd "$ROOT/frontend"
PUBLIC_API_URL="$WORKER_URL" PUBLIC_TURNSTILE_SITE_KEY="$TURNSTILE_SITE_KEY" npm run build
echo "  ✓ Frontend built"

# ──────────────────────────────────────────────
# Step 6: Deploy frontend to CF Pages
# ──────────────────────────────────────────────
echo ""
echo "▸ Step 6/6: Deploying frontend to Cloudflare Pages..."
cd "$ROOT/frontend"
PAGES_OUTPUT=$(npx wrangler pages deploy .svelte-kit/cloudflare --project-name hmw-workshop 2>&1) || {
  echo "  ✗ Pages deploy failed:"
  echo "$PAGES_OUTPUT"
  exit 1
}
echo "$PAGES_OUTPUT"

# Extract Pages URL
PAGES_URL=$(echo "$PAGES_OUTPUT" | grep -oP 'https://[^\s]+\.pages\.dev' | head -1 || true)
if [[ -z "$PAGES_URL" ]]; then
  PAGES_URL="(check CF dashboard)"
fi
echo "  ✓ Frontend deployed: $PAGES_URL"

# ──────────────────────────────────────────────
# Summary
# ──────────────────────────────────────────────
echo ""
echo "=== Deploy Complete ==="
echo "  Lambda:   $API_URL"
echo "  Worker:   $WORKER_URL"
echo "  Frontend: $PAGES_URL"
echo "  CORS:     ${FRONTEND_URL:-"* (all origins)"}"
echo ""
if [[ -n "$FRONTEND_URL" ]]; then
  echo "Next: bash scripts/verify-deploy.sh $WORKER_URL $FRONTEND_URL"
else
  echo "Next: bash scripts/verify-deploy.sh $WORKER_URL"
fi
