# CLAUDE.md

## Project

hmw-workshop — AI-powered tool for sculpting well-calibrated "How Might We" questions through iterative refinement.

## Architecture

Monorepo with three layers:
- **backend/** — Go + BAML (LLM orchestration). Runs as plain HTTP server locally, Lambda in production.
- **frontend/** — SvelteKit + Tailwind CSS. Deploys to Cloudflare Pages.
- **sst.config.ts** — SST infrastructure-as-code (Lambda + CF Pages).

Full specification: `docs/specification.md`

## Commands

```bash
# Backend (Go) — use doppler run to inject secrets
cd backend && doppler run -- go run main.go   # Local server on :8080 with secrets
cd backend && baml-cli generate               # Regenerate Go client from .baml files
cd backend && doppler run -- go test ./...    # Run Go tests

# Frontend (SvelteKit)
cd frontend && npm install                    # Install dependencies
cd frontend && npm run dev                    # Dev server on :5173 (proxies /api to :8080)
cd frontend && npm run build                  # Production build
cd frontend && npm run check                  # Svelte + TypeScript checks
cd frontend && npm run lint                   # ESLint
cd frontend && npx playwright test            # E2E tests
cd frontend && npx playwright test --ui       # E2E tests with UI

# BAML
cd backend && doppler run -- baml-cli test    # Run BAML prompt tests
cd backend && doppler run -- baml-cli test -i "RefinePersona:TestRefinePersona"

# Secrets (Doppler)
doppler secrets                               # List all secrets
doppler secrets set ANTHROPIC_API_KEY         # Set a secret (interactive)

# Deploy (requires AWS + CF credentials)
npx sst deploy                                # Deploy all
```

## Source Layout

```
├── sst.config.ts                    # SST infra (Lambda + CF Pages)
├── package.json                     # Root workspace (SST tooling)
├── backend/
│   ├── main.go                      # HTTP server + Lambda adapter entry
│   ├── handlers.go                  # Route handlers (one per BAML function)
│   ├── middleware.go                # CORS middleware
│   ├── go.mod
│   └── baml_src/                    # BAML source files
│       ├── generators.baml          # Go code generation config
│       ├── clients.baml             # LLM client (Claude Sonnet 4.6)
│       ├── types.baml               # All structured types
│       ├── persona.baml             # RefinePersona function
│       ├── analyze.baml             # AnalyzeHMW function
│       ├── expand.baml              # ExpandHMW function
│       └── refine.baml              # RefineHMW function
├── frontend/
│   ├── svelte.config.js             # CF Pages adapter
│   ├── vite.config.ts               # Vite + API proxy config
│   ├── tailwind.config.js
│   ├── src/
│   │   ├── routes/                  # SvelteKit pages
│   │   │   ├── +page.svelte         # Landing page
│   │   │   └── workshop/+page.svelte # Main workshop UI
│   │   └── lib/
│   │       ├── stores/session.svelte.ts # Session state store (Svelte 5 runes)
│   │       ├── api/stream.ts        # SSE client utility
│   │       └── components/          # UI components (PersonaCard, VariantGrid, etc.)
│   ├── tests/                       # Playwright E2E tests
│   └── tests/fixtures/              # Mock API responses for development
└── docs/
    ├── specification.md             # Full project specification
    └── knowledge/rdspi-workflow.md  # Lisa workflow definition
```

## Key Conventions

- All LLM calls go through BAML — never call LLM APIs directly from Go
- After editing any `.baml` file, run `baml-cli generate` to regenerate the Go client
- Backend streams SSE (`text/event-stream`); frontend consumes via `lib/api/stream.ts`
- Session state lives entirely in the frontend Svelte store — backend is stateless
- Frontend proxies `/api/*` to the backend in dev (see `vite.config.ts`)
- Mock fixtures in `frontend/tests/fixtures/` provide realistic streaming responses without LLM costs
- Use `npm run dev:mock` for frontend development without LLM API costs

## Agent Work Rules

- **Own all issues you encounter.** If you discover a bug, broken test, lint error, build failure, or misconfiguration while working on your ticket — fix it, even if it was pre-existing or caused by a previous ticket. Do not skip issues with "not my ticket" reasoning. The codebase must be in a better state after your ticket than before it.
- **Leave the build green.** Before marking your ticket done, verify that `go build ./...` (backend), `npm run check` and `npm run lint` (frontend), and any relevant tests pass.
- **Verify your work end-to-end.** Don't just write code — run it and confirm it works. For backend endpoints, test with curl. For frontend components, verify they render in the browser (or pass Playwright tests with mock data).
- **Two concurrent agents** run on this repo. Backend and frontend tracks are independent and touch different files. Do not modify files outside your track unless fixing a shared config issue.

### Directory Conventions

```
docs/active/tickets/    # Ticket files (markdown with YAML frontmatter)
docs/active/stories/    # Story files (same frontmatter pattern)
docs/active/work/       # Work artifacts, one subdirectory per ticket ID
```

---

The RDSPI workflow definition is in docs/knowledge/rdspi-workflow.md and is injected into agent context by lisa automatically.
