#!/usr/bin/env bash
# Post-deploy verification for hmw-workshop.
# Runs automated checks against the deployed Worker URL.
# Usage: bash scripts/verify-deploy.sh <WORKER_URL>
#
# Example: bash scripts/verify-deploy.sh https://hmw-api-proxy.account.workers.dev
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <WORKER_URL> [FRONTEND_URL]"
  echo "Example: $0 https://hmw-api-proxy.account.workers.dev https://hmw-workshop.pages.dev"
  exit 1
fi

WORKER_URL="${1%/}"  # Remove trailing slash
FRONTEND_URL="${2:-}"  # Optional: allowed origin for CORS tests
PASS=0
FAIL=0
WARN=0

pass() { echo "  ✓ PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "  ✗ FAIL: $1"; FAIL=$((FAIL + 1)); }
warn() { echo "  ⚠ WARN: $1"; WARN=$((WARN + 1)); }

echo "=== Verifying deployment: $WORKER_URL ==="
echo ""

# ──────────────────────────────────────────────
# Test 1: CORS Preflight
# ──────────────────────────────────────────────
echo "▸ Test 1: CORS preflight"

if [[ -n "$FRONTEND_URL" ]]; then
  # Test 1a: Allowed origin should get CORS headers
  CORS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X OPTIONS \
    -H "Origin: $FRONTEND_URL" \
    -H "Access-Control-Request-Method: POST" \
    "$WORKER_URL/api/persona")

  if [[ "$CORS_STATUS" == "204" ]]; then
    pass "OPTIONS from allowed origin ($FRONTEND_URL) returns 204"
  else
    fail "OPTIONS from allowed origin returned $CORS_STATUS (expected 204)"
  fi

  CORS_RESPONSE=$(curl -s -D - -o /dev/null -X OPTIONS \
    -H "Origin: $FRONTEND_URL" \
    -H "Access-Control-Request-Method: POST" \
    "$WORKER_URL/api/persona")

  if echo "$CORS_RESPONSE" | grep -qi "access-control-allow-origin"; then
    pass "CORS Access-Control-Allow-Origin header present for allowed origin"
  else
    fail "CORS Access-Control-Allow-Origin header missing for allowed origin"
  fi

  if echo "$CORS_RESPONSE" | grep -qi "access-control-allow-methods"; then
    pass "CORS Access-Control-Allow-Methods header present for allowed origin"
  else
    fail "CORS Access-Control-Allow-Methods header missing for allowed origin"
  fi

  # Test 1b: Disallowed origin should be rejected
  BAD_CORS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X OPTIONS \
    -H "Origin: https://evil.example.com" \
    -H "Access-Control-Request-Method: POST" \
    "$WORKER_URL/api/persona")

  if [[ "$BAD_CORS_STATUS" == "403" ]]; then
    pass "OPTIONS from disallowed origin returns 403"
  else
    fail "OPTIONS from disallowed origin returned $BAD_CORS_STATUS (expected 403)"
  fi

  BAD_CORS_RESPONSE=$(curl -s -D - -o /dev/null -X OPTIONS \
    -H "Origin: https://evil.example.com" \
    -H "Access-Control-Request-Method: POST" \
    "$WORKER_URL/api/persona")

  if echo "$BAD_CORS_RESPONSE" | grep -qi "access-control-allow-origin"; then
    fail "CORS headers present for disallowed origin (should be absent)"
  else
    pass "CORS headers correctly absent for disallowed origin"
  fi
else
  # No FRONTEND_URL — basic CORS check (backwards-compatible)
  CORS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X OPTIONS \
    -H "Origin: https://example.com" \
    -H "Access-Control-Request-Method: POST" \
    "$WORKER_URL/api/persona")

  if [[ "$CORS_STATUS" == "204" ]]; then
    pass "OPTIONS /api/persona returns 204"
  else
    fail "OPTIONS /api/persona returned $CORS_STATUS (expected 204)"
  fi

  CORS_RESPONSE=$(curl -s -D - -o /dev/null -X OPTIONS \
    -H "Origin: https://example.com" \
    -H "Access-Control-Request-Method: POST" \
    "$WORKER_URL/api/persona")

  if echo "$CORS_RESPONSE" | grep -qi "access-control-allow-origin"; then
    pass "CORS Access-Control-Allow-Origin header present"
  else
    fail "CORS Access-Control-Allow-Origin header missing"
  fi

  if echo "$CORS_RESPONSE" | grep -qi "access-control-allow-methods"; then
    pass "CORS Access-Control-Allow-Methods header present"
  else
    fail "CORS Access-Control-Allow-Methods header missing"
  fi
fi

# ──────────────────────────────────────────────
# Test 2: Endpoint Reachability
# ──────────────────────────────────────────────
echo ""
echo "▸ Test 2: Endpoint reachability"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  -d '{"rawInput":"New user who just signed up for the product and is going through onboarding"}' \
  "$WORKER_URL/api/persona")

if [[ "$STATUS" == "200" ]]; then
  pass "POST /api/persona returns 200"
else
  fail "POST /api/persona returned $STATUS (expected 200)"
fi

# ──────────────────────────────────────────────
# Test 3: SSE Streaming
# ──────────────────────────────────────────────
echo ""
echo "▸ Test 3: SSE streaming"
SSE_BODY=$(curl -s -m 30 -X POST \
  -H "Content-Type: application/json" \
  -d '{"rawInput":"New user who just signed up for the product and is going through onboarding"}' \
  "$WORKER_URL/api/persona" 2>&1 || true)

if echo "$SSE_BODY" | grep -q "^data: "; then
  pass "SSE data lines present in response"
else
  fail "No SSE data lines found in response"
fi

if echo "$SSE_BODY" | grep -q "data: \[DONE\]"; then
  pass "SSE [DONE] sentinel received"
else
  fail "SSE [DONE] sentinel not received"
fi

# Count SSE events (excluding [DONE])
EVENT_COUNT=$(echo "$SSE_BODY" | grep -c "^data: " || true)
if [[ "$EVENT_COUNT" -gt 1 ]]; then
  pass "Multiple SSE events received ($EVENT_COUNT events)"
else
  warn "Only $EVENT_COUNT SSE event(s) received (expected multiple for streaming)"
fi

# ──────────────────────────────────────────────
# Test 4: Response Time
# ──────────────────────────────────────────────
echo ""
echo "▸ Test 4: Response time (time to first byte)"
TTFB=$(curl -s -o /dev/null -w "%{time_starttransfer}" -X POST \
  -H "Content-Type: application/json" \
  -d '{"rawInput":"New user who just signed up for the product and is going through onboarding"}' \
  "$WORKER_URL/api/persona" 2>&1 || echo "999")

TTFB_MS=$(echo "$TTFB" | awk '{printf "%.0f", $1 * 1000}')
if (( TTFB_MS < 2000 )); then
  pass "Time to first byte: ${TTFB_MS}ms (< 2000ms)"
elif (( TTFB_MS < 5000 )); then
  warn "Time to first byte: ${TTFB_MS}ms (> 2000ms, may be cold start)"
else
  fail "Time to first byte: ${TTFB_MS}ms (> 5000ms)"
fi

# ──────────────────────────────────────────────
# Test 5: Rate Limiting
# ──────────────────────────────────────────────
echo ""
echo "▸ Test 5: Rate limiting"
RATE_LIMIT_HIT=false
for i in $(seq 1 21); do
  RL_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
    -H "Content-Type: application/json" \
    -d '{"rawInput":"rate limit test"}' \
    "$WORKER_URL/api/persona")
  if [[ "$RL_STATUS" == "429" ]]; then
    pass "Rate limit triggered on request $i (429)"
    RATE_LIMIT_HIT=true
    break
  fi
done
if [[ "$RATE_LIMIT_HIT" == "false" ]]; then
  warn "Rate limit not triggered after 21 requests (per-isolate distribution may mask it)"
fi

# Check rate limit headers on a normal response
RL_HEADERS=$(curl -s -D - -o /dev/null -X POST \
  -H "Content-Type: application/json" \
  -d '{"rawInput":"header test"}' \
  "$WORKER_URL/api/persona" 2>&1)

if echo "$RL_HEADERS" | grep -qi "x-ratelimit-remaining"; then
  pass "X-RateLimit-Remaining header present"
else
  warn "X-RateLimit-Remaining header missing (may be per-isolate issue)"
fi

# ──────────────────────────────────────────────
# Test 6: Error Handling
# ──────────────────────────────────────────────
echo ""
echo "▸ Test 6: Error handling"
ERR_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  -d 'not json' \
  "$WORKER_URL/api/persona")

if [[ "$ERR_STATUS" == "400" ]]; then
  pass "Malformed JSON returns 400"
else
  warn "Malformed JSON returned $ERR_STATUS (expected 400, backend may return different code)"
fi

# ──────────────────────────────────────────────
# Test 7: Route Rejection
# ──────────────────────────────────────────────
echo ""
echo "▸ Test 7: Route rejection"
GET_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X GET "$WORKER_URL/api/persona")
if [[ "$GET_STATUS" == "405" ]]; then
  pass "GET /api/persona returns 405"
else
  fail "GET /api/persona returned $GET_STATUS (expected 405)"
fi

BAD_PATH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$WORKER_URL/not-api")
if [[ "$BAD_PATH_STATUS" == "404" ]]; then
  pass "POST /not-api returns 404"
else
  fail "POST /not-api returned $BAD_PATH_STATUS (expected 404)"
fi

# ──────────────────────────────────────────────
# Summary
# ──────────────────────────────────────────────
echo ""
echo "=== Verification Summary ==="
echo "  Passed: $PASS"
echo "  Failed: $FAIL"
echo "  Warnings: $WARN"
echo ""

if [[ "$FAIL" -gt 0 ]]; then
  echo "RESULT: SOME TESTS FAILED"
  exit 1
else
  echo "RESULT: ALL TESTS PASSED"
  exit 0
fi
