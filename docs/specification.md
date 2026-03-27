# HMW Workshop Tool — Specification

## Overview

An AI-powered tool that helps teams produce well-calibrated "How Might We" questions through structured, iterative refinement. The user starts with a rough problem statement and progressively sculpts it into a curated set of workshop-ready HMW questions — guided by BAML-driven LLM analysis at each step.

The interaction model is **sculpting, not form-filling**. Each BAML call produces structured output. The user selects, lightly edits, and asks for more. State accumulates across iterations. The user's primary actions are **select**, **edit**, and **go deeper** — not "fill out another form."

---

## Architecture

```
┌─────────────────┐      ┌──────────────────────┐      ┌──────────────┐
│  Cloudflare      │      │  AWS Lambda           │      │  LLM Provider│
│  Pages           │ SSE  │  (Go + BAML)          │      │  (Anthropic, │
│  ─────────────── │─────▶│  ──────────────────── │─────▶│   OpenAI,    │
│  SvelteKit       │      │  Deployed via SST     │      │   etc.)      │
│  Tailwind CSS    │◀─────│  Function URL         │◀─────│              │
│                  │      │  Secrets via SSM       │      │              │
└─────────────────┘      └──────────────────────┘      └──────────────┘
```

### Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Frontend | SvelteKit + Tailwind CSS | Deploys to CF Pages natively, minimal runtime, clean reactivity for session state |
| Frontend hosting | Cloudflare Pages | Free tier, global CDN, Turnstile for bot protection |
| API proxy / rate limiting | Cloudflare Worker | Sits in front of Lambda Function URL, handles CORS, rate limiting, Turnstile verification |
| Backend | Go + BAML | Single binary, near-zero cold starts (~100ms), native SSE via `net/http`, BAML bindings compile in cleanly |
| Backend hosting | AWS Lambda via SST | True scale-to-zero ($0 idle), free tier covers prototyping usage, infrastructure-as-code |
| Secrets | AWS SSM (via SST) | Free, encrypted, CLI-managed via `npx sst secrets set` |
| LLM orchestration | BAML | Structured streaming, type-safe outputs, retry/fallback logic, tested in VSCode playground |

### Cost at Prototyping Scale

| Component | Monthly Cost |
|-----------|-------------|
| Cloudflare Pages + Workers | $0 (free tier) |
| AWS Lambda compute | $0 (free tier: 1M requests, 400K GB-seconds) |
| AWS SSM secrets | $0 (standard parameters are free) |
| Lambda Function URL | $0 (no additional charge) |
| LLM API tokens | **Only real cost** — proportional to actual usage |

---

## Local Development

The Go backend runs locally as a plain HTTP server. No SST, no AWS account needed for development.

```bash
# Start backend
cd backend
go run main.go
# → http://localhost:8080 serving SSE endpoints

# Start frontend (separate terminal)
cd frontend
npm run dev
# → http://localhost:5173 proxying API calls to localhost:8080
```

Streaming works identically local and deployed. The Go handler is the same code in both environments — locally it runs as an HTTP server, on Lambda it's wrapped with a thin streaming adapter.

### Development Workflow

1. Write/edit `.baml` files in `backend/baml_src/`
2. Test prompts in the BAML VSCode playground (instant feedback)
3. Run `baml-cli generate` to update the Go client
4. Go handler picks up changes, test via `curl` or frontend
5. When ready to deploy: `npx sst deploy`

### Deployment Workflow

```bash
# One-time setup
npx sst init
npx sst secrets set ANTHROPIC_API_KEY sk-ant-...

# Every deploy
npx sst deploy
```

---

## Product Design

### Core Concept

Most teams do HMW exercises badly. They brainstorm questions that are thinly disguised solutions, or go so broad that the questions don't generate useful ideation. The facilitator's skill is the bottleneck.

This tool is an **AI facilitator for the HMW phase**. You come in with a vague sense of a problem and leave with a curated set of well-calibrated HMW questions plus the structured problem context that produced them.

### Interaction Flow

The flow is iterative. Output from one BAML call becomes input to the next. The user curates rather than authors.

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  1. Setup     │────▶│  2. Analyze   │────▶│  3. Expand    │
│  Persona +    │     │  Critique     │     │  Generate     │
│  Context      │     │  rough HMW    │     │  variants     │
└──────────────┘     └──────────────┘     └──────┬───────┘
                                                  │
                                                  ▼
                                          ┌──────────────┐
                                     ┌───▶│  4. Refine    │───┐
                                     │    │  Go deeper on │   │
                                     │    │  selections   │   │
                                     │    └──────────────┘   │
                                     │                        │
                                     │  select, edit,         │
                                     │  ask for more          │
                                     └────────────────────────┘
                                                  │
                                                  ▼
                                          ┌──────────────┐
                                          │  5. Export    │
                                          │  Clipped HMWs│
                                          │  + context    │
                                          └──────────────┘
```

#### Stage 1: Setup — Persona & Context

User provides rough text inputs. BAML refines them into structured form. User reviews and edits.

**Inputs (free text):**
- Who is this for? (rough persona description)
- What's the space/domain?
- Any known constraints?

**BAML output:** Structured `Persona` and `ProblemContext`. User edits inline — fixes the role, adds a frustration, removes an irrelevant constraint. These edits happen directly on the structured output, not by re-filling a form.

#### Stage 2: Analyze — Critique the Rough HMW

User types (or pastes) their rough HMW statement. BAML analyzes it against the persona and context.

**Input:** Raw HMW string + `ProblemContext` from Stage 1

**BAML output:** `HMWAnalysis` — identifies the implicit user, embedded assumptions, scope issues, solution bias, and the underlying tension. Streams in progressively.

#### Stage 3: Expand — Generate Variants

BAML generates a spread of reframed HMW questions. Each is tagged with the "move" it makes (narrowed, broadened, shifted user, reframed constraint, etc.).

**Input:** `HMWAnalysis` + `ProblemContext`

**BAML output:** Array of `HMWVariant` objects streaming in one by one. The user sees them appear like a shopping aisle — scanning, selecting the ones that resonate, lightly editing wording.

**User actions:** Select (add to active set), skip, edit inline, clip (save to final list).

#### Stage 4: Refine — Iterate

This is the core loop. The user's selections and edits from Stage 3 (or previous iterations of Stage 4) feed back into BAML. BAML can see what was kept, what was discarded, what was modified — and generates further refinements in the direction the user is gravitating toward.

**Input:** Full `HMWSession` state — persona, context, all generated variants with their status (selected, edited, skipped, clipped), edit history.

**BAML output:** New `HMWVariant` objects, plus optional `tensions` between selected framings and `recommendations` for which combinations work best together.

**User actions:** Same as Stage 3. Select, skip, edit, clip. Then "go deeper" again, or move to export.

This stage repeats as many times as the user wants. Each iteration, BAML has richer signal about the user's intent.

#### Stage 5: Export

The user's clipped HMW list — the "shopping cart" — is the deliverable. Exportable as:
- Plain text list
- Structured markdown (with persona, context, and rationale per HMW)
- JSON (for feeding into other tools)

---

## BAML Types

```baml
// ─── Persona & Context ───

class Persona {
  label string @description("short name like 'Junior Designer'")
  role string
  goals string[]
  frustrations string[]
  context string @description("their daily reality relevant to this problem")
  influencers string[] @description("who/what shapes their decisions")
}

class Constraint {
  statement string
  type "hard" | "soft" | "assumption"
  challengeRationale string? @description("if type is assumption, why it might not be fixed")
}

class ProblemContext {
  domain string
  persona Persona
  constraints Constraint[]
  priorContext string? @description("any additional context the user provided")
}

// ─── Stage 2: Analysis ───

class HMWAnalysis {
  originalStatement string
  implicitUser string @description("who this HMW assumes as the target")
  embeddedAssumptions string[]
  scopeLevel "too_narrow" | "too_broad" | "well_scoped"
  solutionBias string? @description("if the HMW accidentally prescribes a solution")
  underlyingTension string @description("the real conflict or insight beneath the surface")
  initialReframing string @description("a first pass at a better version, before full expansion")
}

// ─── Stage 3 & 4: Variants ───

class HMWVariant {
  statement string
  move "narrowed" | "broadened" | "shifted_user" | "reframed_constraint" | "elevated_abstraction" | "inverted" | "combined" | "decomposed"
  rationale string @description("why this reframing opens up better solution space")
}

class HMWExpansion {
  variants HMWVariant[]
  emergentTheme string? @description("pattern BAML notices across the variants it generated")
}

// ─── Session State ───

enum CandidateStatus {
  GENERATED
  SELECTED
  EDITED
  SKIPPED
  CLIPPED
}

class HMWCandidate {
  id string
  variant HMWVariant
  status CandidateStatus
  userEdits string? @description("if edited, what the user changed it to")
}

class HMWSession {
  context ProblemContext
  analysis HMWAnalysis?
  candidates HMWCandidate[]
  clippedIds string[] @description("IDs of candidates saved to final list")
  iterationCount int
}

// ─── Stage 4: Refinement Output ───

class HMWRefinement {
  newVariants HMWVariant[]
  tensions string[] @description("interesting conflicts between selected framings")
  recommendation string? @description("which framings work best together and why")
  suggestedNextMove string? @description("what kind of exploration might be most productive next")
}
```

---

## BAML Functions

```baml
function RefinePersona(rawInput: string) -> Persona {
  client Claude
  prompt #"
    The user described a persona in rough terms. Turn this into a structured
    persona useful for design thinking exercises. Infer reasonable details
    from context but don't fabricate specifics the user didn't imply.

    Raw input: {{ rawInput }}

    {{ ctx.output_format }}
  "#
}

function AnalyzeHMW(statement: string, context: ProblemContext) -> HMWAnalysis {
  client Claude
  prompt #"
    Analyze this "How Might We" question for a design thinking exercise.
    Identify what's working and what's not about its framing.

    Persona: {{ context.persona.label }} — {{ context.persona.role }}
    Domain: {{ context.domain }}
    Constraints: {% for c in context.constraints %}
      - {{ c.statement }} ({{ c.type }}){% endfor %}

    HMW Statement: {{ statement }}

    {{ ctx.output_format }}
  "#
}

function ExpandHMW(analysis: HMWAnalysis, context: ProblemContext) -> HMWExpansion {
  client Claude
  prompt #"
    Generate a diverse set of reframed "How Might We" questions based on
    this analysis. Each variant should make a clear, different "move" —
    don't just rephrase, genuinely shift the framing.

    The persona is {{ context.persona.label }}: {{ context.persona.context }}
    Their key frustrations: {% for f in context.persona.frustrations %}
      - {{ f }}{% endfor %}

    Original statement: {{ analysis.originalStatement }}
    Underlying tension: {{ analysis.underlyingTension }}
    {% if analysis.solutionBias %}Solution bias to avoid: {{ analysis.solutionBias }}{% endif %}

    Generate 6-8 variants with diverse moves. Prioritize framings that
    would generate genuinely different solution spaces in a brainstorm.

    {{ ctx.output_format }}
  "#
}

function RefineHMW(session: HMWSession) -> HMWRefinement {
  client Claude
  prompt #"
    The user is iterating on HMW questions. Look at what they've selected,
    edited, and skipped to understand their direction.

    Persona: {{ session.context.persona.label }}
    Domain: {{ session.context.domain }}

    Selected/edited candidates (what resonated):
    {% for c in session.candidates %}{% if c.status == "SELECTED" or c.status == "EDITED" %}
      - {{ c.userEdits ?? c.variant.statement }} (move: {{ c.variant.move }})
    {% endif %}{% endfor %}

    Skipped candidates (what didn't land):
    {% for c in session.candidates %}{% if c.status == "SKIPPED" %}
      - {{ c.variant.statement }} (move: {{ c.variant.move }})
    {% endif %}{% endfor %}

    Already clipped (keeper list):
    {% for c in session.candidates %}{% if c.status == "CLIPPED" %}
      - {{ c.userEdits ?? c.variant.statement }}
    {% endif %}{% endfor %}

    Iteration: {{ session.iterationCount }}

    Generate new variants that push further in the direction the user
    is gravitating. Also note tensions between their selected framings
    and suggest which combinations would be most generative.

    {{ ctx.output_format }}
  "#
}
```

---

## Go Backend

### Endpoints

| Method | Path | BAML Function | Input | Output (SSE) |
|--------|------|--------------|-------|-------------|
| POST | `/api/persona` | `RefinePersona` | `{ rawInput: string }` | Streaming `Persona` |
| POST | `/api/analyze` | `AnalyzeHMW` | `{ statement: string, context: ProblemContext }` | Streaming `HMWAnalysis` |
| POST | `/api/expand` | `ExpandHMW` | `{ analysis: HMWAnalysis, context: ProblemContext }` | Streaming `HMWExpansion` |
| POST | `/api/refine` | `RefineHMW` | `{ session: HMWSession }` | Streaming `HMWRefinement` |

### Handler Pattern

Every handler follows the same structure:

```go
func handleExpand(w http.ResponseWriter, r *http.Request) {
    // 1. Parse JSON input
    // 2. Set SSE headers (Content-Type: text/event-stream, Cache-Control: no-cache)
    // 3. Stream BAML output, flushing each partial
    // 4. Send [DONE] sentinel
}
```

### Local vs Lambda

The same `http.ServeMux` runs locally as a plain HTTP server or on Lambda wrapped by a streaming adapter. The Go code doesn't change between environments.

---

## Frontend (SvelteKit)

### Pages

| Route | Purpose |
|-------|---------|
| `/` | Landing / start new session |
| `/workshop` | Main workshop interface — all stages in one scrollable flow |

The workshop page is a single continuous experience, not separate pages per stage. As the user progresses, new sections appear below. Previous sections remain visible and editable.

### Session State

SvelteKit manages the full `HMWSession` in a Svelte store. Each BAML call updates the store. The store is the single source of truth for what's been generated, selected, edited, and clipped.

### Key UI Components

| Component | Purpose |
|-----------|---------|
| `PersonaCard` | Displays structured persona, all fields inline-editable |
| `ConstraintList` | Shows constraints with type badges, editable |
| `AnalysisPanel` | Streams in the HMW critique, highlights issues |
| `VariantCard` | Single HMW variant with move tag, rationale. Actions: select, skip, edit, clip |
| `VariantGrid` | Grid/list of VariantCards, color-coded by move type |
| `ClipBoard` | Persistent sidebar/bottom panel showing clipped HMWs (the "shopping cart") |
| `ExportPanel` | Formats clipped list for export (markdown, plain text, JSON) |

### Streaming UX

When BAML is streaming, the UI should feel like watching someone think:

- **Persona refinement:** Fields fill in one by one
- **Analysis:** The critique builds progressively — assumptions listed, then scope assessment, then the underlying tension crystallizes last
- **Variants:** Cards appear one at a time in the grid, each card's fields filling in
- **Refinement:** New variants stream in alongside existing selected ones, visually distinct as "new"

---

## SST Configuration

SST manages the infrastructure-as-code. Key resources:

- **Go Lambda** with streaming Function URL, linked to SSM secrets
- **SvelteKit on Cloudflare Pages** with the API URL injected as an environment variable
- Stage-aware removal policy (retain in production, remove otherwise)

---

## Project Structure

```
hmw-workshop/
├── sst.config.ts              # SST infrastructure definition
├── package.json               # Root — SST + workspace tooling
├── backend/
│   ├── main.go                # HTTP server + Lambda adapter
│   ├── handlers.go            # Route handlers (one per BAML function)
│   ├── middleware.go           # CORS middleware
│   ├── go.mod
│   └── baml_src/
│       ├── generators.baml    # Generator config for Go client
│       ├── clients.baml       # LLM client definitions
│       ├── types.baml         # All type definitions
│       ├── persona.baml       # RefinePersona function
│       ├── analyze.baml       # AnalyzeHMW function
│       ├── expand.baml        # ExpandHMW function
│       └── refine.baml        # RefineHMW function
├── frontend/
│   ├── package.json
│   ├── svelte.config.js       # SvelteKit config with CF adapter
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   ├── src/
│   │   ├── app.html
│   │   ├── app.css            # Tailwind base + custom styles
│   │   ├── routes/
│   │   │   ├── +layout.svelte
│   │   │   ├── +page.svelte          # Landing page
│   │   │   └── workshop/
│   │   │       └── +page.svelte      # Main workshop interface
│   │   └── lib/
│   │       ├── stores/
│   │       │   └── session.ts        # HMWSession Svelte store
│   │       ├── api/
│   │       │   └── stream.ts         # SSE client utility
│   │       └── components/
│   │           ├── PersonaCard.svelte
│   │           ├── ConstraintList.svelte
│   │           ├── AnalysisPanel.svelte
│   │           ├── VariantCard.svelte
│   │           ├── VariantGrid.svelte
│   │           ├── ClipBoard.svelte
│   │           └── ExportPanel.svelte
│   └── static/
└── docs/
    └── specification.md
```

---

## Implementation Phases

### Phase 1: BAML + Go Locally
1. Define types and `RefinePersona` function in BAML
2. Generate Go client
3. Go handler that streams persona refinement via SSE
4. Test with `curl --no-buffer`

### Phase 2: Full Backend Locally
5. Add `AnalyzeHMW`, `ExpandHMW`, `RefineHMW` functions
6. Wire up all four endpoints
7. Test the full flow via `curl` — persona → analysis → expansion → refinement

### Phase 3: Frontend
8. SvelteKit scaffold with CF Pages adapter
9. Session store + SSE client utility
10. PersonaCard + AnalysisPanel (stages 1-2)
11. VariantGrid + ClipBoard (stages 3-4)
12. Iteration loop working — select, edit, clip, go deeper

### Phase 4: Deploy
13. SST config with Lambda Function URL streaming
14. Secrets setup
15. Deploy backend to Lambda
16. Deploy frontend to CF Pages
17. End-to-end verification

### Phase 5: Polish
18. Export functionality
19. Turnstile bot protection on CF Worker
20. Rate limiting
21. Visual polish on streaming transitions
