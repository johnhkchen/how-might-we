# HMW Workshop

An AI-powered tool for sculpting well-calibrated "How Might We" questions through structured, iterative refinement. You start with a rough problem statement and progressively sculpt it into a curated set of workshop-ready HMW questions — guided by LLM analysis at each step.

**Live demo:** [hmw-workshop.pages.dev](https://hmw-workshop.pages.dev)

## How It Works

The interaction model is **sculpting, not form-filling**. Each AI call produces structured output. You select, lightly edit, and ask for more. Your primary actions are **select**, **edit**, and **go deeper**.

```
Setup          Analyze         Expand          Refine (loop)     Export
Persona +  →   Critique    →   Generate    →   Go deeper on  →   Clipped HMWs
Context        rough HMW       variants        selections        + context
```

1. **Setup** — Describe your persona in rough terms. The AI refines it into a structured persona with goals, frustrations, and context. You edit inline.
2. **Analyze** — Paste your rough HMW statement. The AI critiques it: embedded assumptions, scope issues, solution bias, and the underlying tension.
3. **Expand** — The AI generates 6-8 diverse reframings, each tagged with the "move" it makes (narrowed, broadened, shifted user, inverted, etc.).
4. **Refine** — Select the variants that resonate, skip what doesn't land, edit wording. Hit "Go Deeper" — the AI sees what you kept and generates further refinements in your direction. Repeat as many times as you want.
5. **Export** — Your clipped HMW list as plain text, structured markdown, or JSON.

## Architecture

```
Cloudflare Pages        CF Worker Proxy         AWS Lambda            LLM
(SvelteKit)        →    (CORS, rate limit,  →   (Go + BAML)      →   (Claude
                         Turnstile)              via SST               Sonnet 4.6)
```

| Layer | Technology | Why |
|-------|-----------|-----|
| Frontend | SvelteKit 5 + Tailwind | Svelte 5 runes for reactive session state, CF Pages for free hosting |
| API proxy | Cloudflare Worker | CORS, rate limiting (per-IP + per-session), Turnstile bot protection |
| Backend | Go + BAML | Single binary, ~100ms cold starts, native SSE streaming, type-safe LLM outputs |
| Infra | SST (AWS Lambda) | True scale-to-zero, streaming Function URLs, infrastructure-as-code |
| Secrets | Doppler | Centralized secret management across local dev, Lambda, and CF Worker |
| LLM | BAML → Claude Sonnet 4.6 | Structured streaming with typed outputs, retry/fallback logic |

**Cost at prototyping scale:** $0 except LLM API tokens. Lambda free tier, CF free tier, Doppler free tier, SST free.

## Project Structure

```
├── backend/                 # Go + BAML backend
│   ├── main.go              # HTTP server + Lambda streaming adapter
│   ├── handlers.go          # One handler per BAML function
│   ├── lambda.go            # Lambda Function URL streaming adapter
│   ├── sse.go               # Generic SSE streaming helper
│   ├── build.sh             # Cross-compile for Lambda (zig cc, no Docker)
│   └── baml_src/            # BAML type definitions and prompt functions
│       ├── types.baml       # Persona, HMWAnalysis, HMWVariant, etc.
│       ├── persona.baml     # RefinePersona
│       ├── analyze.baml     # AnalyzeHMW
│       ├── expand.baml      # ExpandHMW
│       └── refine.baml      # RefineHMW
├── frontend/                # SvelteKit 5 + Tailwind
│   ├── src/lib/stores/      # Session state (Svelte 5 runes)
│   ├── src/lib/components/  # PersonaCard, VariantGrid, ClipBoard, etc.
│   ├── src/lib/api/         # SSE client with mock support
│   └── tests/               # Playwright E2E tests + mock fixtures
├── worker/                  # Cloudflare Worker proxy
│   └── src/index.ts         # CORS, rate limiting, Turnstile, SSE passthrough
├── sst.config.ts            # SST infra (Lambda Function URL + streaming)
├── docs/
│   ├── specification.md     # Full product + technical specification
│   ├── active/stories/      # Lisa story files (S-001 through S-007)
│   ├── active/tickets/      # Lisa ticket files (29 tickets)
│   └── active/work/         # RDSPI work artifacts per ticket
└── CLAUDE.md                # AI agent instructions
```

## Local Development

```bash
# Backend — plain HTTP server, no AWS needed
cd backend
doppler run -- go run main.go
# → http://localhost:8080

# Frontend — proxies /api to backend
cd frontend
npm install
npm run dev
# → http://localhost:5173

# Frontend with mock API (no LLM costs)
npm run dev:mock
```

## Deploy

```bash
# Build backend for Lambda (zig cross-compiles CGo to linux/arm64, no Docker)
cd backend && ./build.sh

# Deploy Lambda
npx sst deploy --stage dev

# Build + deploy frontend
cd frontend
doppler run -- bash -c 'PUBLIC_API_URL=$PUBLIC_API_URL npm run build'
npx wrangler pages deploy .svelte-kit/cloudflare --project-name hmw-workshop
```

## Key Technical Decisions

**BAML for LLM orchestration** — Every LLM call is a typed function with structured streaming output. The frontend receives progressively-building JSON objects (fields fill in one by one) rather than raw text tokens. This enables the "watching someone think" streaming UX.

**Go + zig for Lambda** — BAML's Go bindings require CGo (native Rust FFI). SST hardcodes `CGO_ENABLED=0` for Go. We bypass this with `zig cc` as a cross-compiler — builds in ~3 seconds on macOS, no Docker needed. The `bundle` + `provided.al2023` runtime tells SST to use our pre-built binary.

**Lambda response streaming** — SSE events stream through Lambda Function URLs in `RESPONSE_STREAM` mode. A custom `lambdaResponseWriter` implements `http.Flusher`, piping the Go HTTP handler's output through `io.Pipe` into `LambdaFunctionURLStreamingResponse`.

**Sculpting, not form-filling** — Session state accumulates across iterations. The refine loop passes the full session (what was selected, edited, skipped, clipped) back to the LLM, which generates variants in the direction you're gravitating toward.

## How This Was Built

This project was scaffolded and largely implemented by AI coding agents using [lisa](https://github.com/anthropics/claude-code), a workflow tool that manages concurrent Claude Code sessions against a ticket DAG. 29 tickets across 7 stories were executed by 2 parallel agent threads, with human oversight for architecture decisions, deployment, and bug fixes.

The `docs/active/work/` directory contains full RDSPI (Research → Design → Structure → Plan → Implement → Review) artifacts for every ticket — a complete record of how each piece was designed and built.
