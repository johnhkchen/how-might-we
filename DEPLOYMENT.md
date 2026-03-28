# Deployment Guide

This document covers the full deploy pipeline for the HMW Workshop. There are three independently deployable pieces: the Go backend (AWS Lambda), the SvelteKit frontend (Cloudflare Pages), and the API proxy worker (Cloudflare Worker).

## Prerequisites

| Tool | Install | Purpose |
|------|---------|---------|
| zig | `brew install zig` | Cross-compile CGo from macOS to linux/arm64 |
| doppler | `brew install dopplerhq/cli/doppler` | Secrets management |
| wrangler | `npm install -g wrangler` | Cloudflare Pages + Workers CLI |
| sst | `npx sst` (in repo) | AWS Lambda infra-as-code |
| AWS CLI | `brew install awscli` | AWS authentication |

### Authentication

```bash
# Doppler (one-time)
doppler login
doppler setup --project hmw-workshop --config dev

# AWS — uses `aws login` with a credential_process bridge for SST
# The [profile sst] in ~/.aws/config bridges aws login tokens to SDK format:
#   [profile sst]
#   credential_process = aws configure export-credentials --profile default --format process
aws login

# Cloudflare (one-time)
npx wrangler login
```

## Secrets (Doppler)

All secrets live in Doppler project `hmw-workshop`, config `dev`:

| Secret | Purpose | Used by |
|--------|---------|---------|
| `ANTHROPIC_API_KEY` | LLM API key for BAML/Claude | Lambda (via SST secret) |
| `PUBLIC_API_URL` | Lambda Function URL | Frontend (build-time) |
| `FRONTEND_URL` | CF Pages production URL | Worker (CORS origin) |

SST has its own secret store (SSM) for `AnthropicApiKey`. Set it once:
```bash
npx sst secret set AnthropicApiKey $(doppler secrets get ANTHROPIC_API_KEY --plain) --stage dev
```

## Deploy: Backend (Lambda)

The Go backend uses BAML which requires CGo. SST hardcodes `CGO_ENABLED=0` for Go, so we pre-build the binary with `zig cc` and use `bundle` + `provided.al2023` to bypass SST's build.

```bash
cd backend

# 1. Build linux/arm64 binary + download BAML native .so (~3 seconds)
./build.sh

# 2. Copy bundle to local filesystem (SST can't read external volumes)
rm -rf /tmp/hmw-bundle
mkdir -p /tmp/hmw-bundle
cp bootstrap libbaml_cffi-aarch64-unknown-linux-gnu.so /tmp/hmw-bundle/

# 3. Deploy
cd ..
npx sst deploy --stage dev
```

The `sst.config.ts` reads the bundle from `/tmp/hmw-bundle`. This is required because SST's Go binary cannot resolve external volume paths (e.g., `/Volumes/ext1/...`).

### Post-deploy: Set RESPONSE_STREAM mode

SST's `transform.url` for invoke mode doesn't always persist. Verify and fix after deploy:

```bash
# Check current mode
aws lambda get-function-url-config \
  --function-name hmw-workshop-dev-HmwApiFunction-bdkkkrxs \
  --region us-west-1 --query InvokeMode

# If BUFFERED, set to RESPONSE_STREAM
aws lambda update-function-url-config \
  --function-name hmw-workshop-dev-HmwApiFunction-bdkkkrxs \
  --region us-west-1 --invoke-mode RESPONSE_STREAM --auth-type NONE
```

### Verify

```bash
curl -s --no-buffer -m 60 -X POST \
  https://h7tiplyniegzytse3e5ijlx6340gwsaz.lambda-url.us-west-1.on.aws/api/persona \
  -H 'Content-Type: application/json' \
  -d '{"rawInput":"junior designer"}' | head -5
```

First request after deploy may take ~10s (BAML lib initialization). Subsequent requests: ~2-5s.

## Deploy: Frontend (Cloudflare Pages)

```bash
cd frontend

# 1. Build with API URL from Doppler
doppler run -- bash -c 'PUBLIC_API_URL=$PUBLIC_API_URL npm run build'

# 2. Deploy to Cloudflare Pages
npx wrangler pages deploy .svelte-kit/cloudflare \
  --project-name hmw-workshop --commit-dirty=true
```

The `PUBLIC_API_URL` is baked into the client bundle at build time via `$env/static/public`. When the API URL changes (new Lambda deploy, custom domain), rebuild and redeploy the frontend.

### CF Pages project setup (one-time)

```bash
npx wrangler pages project create hmw-workshop --production-branch main
```

## Deploy: Worker Proxy (Cloudflare Worker)

The worker sits between the frontend and Lambda, handling CORS, rate limiting, and Turnstile verification.

```bash
cd worker

# Set secrets
echo "$(doppler secrets get PUBLIC_API_URL --plain)" | npx wrangler secret put LAMBDA_URL
echo "$(doppler secrets get FRONTEND_URL --plain)" | npx wrangler secret put ALLOWED_ORIGIN

# Deploy
npx wrangler deploy
```

### KV rate limiting (optional)

The worker supports KV-backed rate limiting for global (not per-isolate) enforcement. To enable:

```bash
# Create KV namespaces
npx wrangler kv namespace create "RATE_LIMIT"
npx wrangler kv namespace create "RATE_LIMIT" --preview

# Update worker/wrangler.toml with the returned IDs
# Replace PLACEHOLDER_PRODUCTION_ID and PLACEHOLDER_PREVIEW_ID
```

Without KV, rate limiting falls back to per-isolate in-memory counters (sufficient for low traffic).

## Full Deploy (all three)

```bash
# Backend
cd backend && ./build.sh
rm -rf /tmp/hmw-bundle && mkdir -p /tmp/hmw-bundle
cp bootstrap libbaml_cffi-aarch64-unknown-linux-gnu.so /tmp/hmw-bundle/
cd .. && npx sst deploy --stage dev

# Verify streaming mode
aws lambda update-function-url-config \
  --function-name hmw-workshop-dev-HmwApiFunction-bdkkkrxs \
  --region us-west-1 --invoke-mode RESPONSE_STREAM --auth-type NONE

# Frontend
cd frontend
doppler run -- bash -c 'PUBLIC_API_URL=$PUBLIC_API_URL npm run build'
npx wrangler pages deploy .svelte-kit/cloudflare \
  --project-name hmw-workshop --commit-dirty=true

# Worker
cd ../worker
echo "$(doppler secrets get PUBLIC_API_URL --plain)" | npx wrangler secret put LAMBDA_URL
echo "$(doppler secrets get FRONTEND_URL --plain)" | npx wrangler secret put ALLOWED_ORIGIN
npx wrangler deploy
```

## Known Issues

| Issue | Workaround |
|-------|-----------|
| SST `bundle` path must be on local filesystem | Copy to `/tmp/hmw-bundle` before deploy |
| SST `transform.url.invokeMode` doesn't always persist | Run `aws lambda update-function-url-config` after deploy |
| SST hardcodes `CGO_ENABLED=0` for Go runtime | Use `bundle` + `provided.al2023` with pre-built binary |
| BAML downloads 54MB .so on cold start if not bundled | `build.sh` downloads and bundles it; set `BAML_LIBRARY_PATH` env var |
| KV namespace IDs are placeholders in `worker/wrangler.toml` | Create namespaces and fill in real IDs before enabling KV rate limiting |

## URLs

| Component | URL |
|-----------|-----|
| Frontend | https://hmw-workshop.pages.dev |
| Lambda API | https://h7tiplyniegzytse3e5ijlx6340gwsaz.lambda-url.us-west-1.on.aws |
| Worker Proxy | Deployed as `hmw-api-proxy` on Cloudflare |
