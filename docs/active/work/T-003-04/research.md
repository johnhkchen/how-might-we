# Research — T-003-04: persona-constraint-components

## Ticket Scope

Build PersonaCard and ConstraintList components for Stage 1 (Setup) of the workshop page. Both must support inline editing and streaming updates. Wire them into the workshop page with input form that calls `/api/persona`.

## Existing Component Files

All seven component stubs exist at `frontend/src/lib/components/`:
- `PersonaCard.svelte` — stub, placeholder text
- `ConstraintList.svelte` — stub, placeholder text
- `AnalysisPanel.svelte` — stub (not in scope)
- `VariantCard.svelte` — stub (not in scope)
- `VariantGrid.svelte` — stub (not in scope)
- `ClipBoard.svelte` — stub (not in scope)
- `ExportPanel.svelte` — stub (not in scope)

Each stub has a `<script lang="ts">` block with a TODO comment and a minimal div with placeholder text.

## Session Store (`session.svelte.ts`)

Svelte 5 runes-based class at `frontend/src/lib/stores/session.svelte.ts`. Key types:

- **`Persona`**: `{ label, role, goals: string[], frustrations: string[], context, influencers: string[] }`
- **`Constraint`**: `{ statement, type: 'hard' | 'soft' | 'assumption', challengeRationale?: string }`
- **`ProblemContext`**: `{ domain, persona: Persona, constraints: Constraint[], priorContext?: string }`

Store state:
- `session.persona` — `$state<Persona | null>` with `setPersona()` setter
- `session.problemContext` — `$state<ProblemContext | null>` with `setContext()` setter
- `session.isStreaming` — `$state(false)` with `startStreaming()` / `stopStreaming()`

Missing methods needed:
- **`updatePersonaField(field, value)`** — for inline editing individual persona fields
- **`updateConstraint(index, constraint)`** — for editing a constraint
- **`removeConstraint(index)`** — for deleting a constraint
- **`addConstraint(constraint)`** — for adding a new constraint

These will need to be added or the components can call `setPersona()` / `setContext()` with the full updated object. Since persona and problemContext are `$state`, mutating via `setPersona()` with a spread is fine for reactivity.

## Streaming Infrastructure

### SSE Client (`lib/api/stream.ts`)
`streamFromAPI<T>(endpoint, body, onPartial)` — calls the API, parses SSE events, fires `onPartial(Partial<T>)` for each intermediate result. Uses `apiFetch` from `client.ts` which switches between real and mock fetch.

### Mock Layer (`lib/api/mock.ts`)
`mockFetch` returns fixture data with 150ms delays per partial. Supports `/api/persona`, `/api/analyze`, `/api/expand`, `/api/refine`.

### Persona Fixture (`tests/fixtures/persona.ts`)
6 progressively-building `Partial<Persona>` objects. First has only `label`, last has all fields. The streaming simulation shows fields appearing one by one — label, then role, then goals incrementally, then frustrations, then context+influencers.

## Backend API

### `/api/persona` endpoint
- **Input**: `{ "rawInput": string }` — rough persona description
- **Output**: Streaming SSE of `Partial<Persona>` objects
- Backend does NOT return constraints. The `RefinePersona` BAML function returns only a `Persona` struct.

### Constraint generation
Constraints are part of `ProblemContext`, not `Persona`. Looking at the BAML functions, there is no dedicated endpoint for constraint generation. The spec says Stage 1 produces structured `Persona` and `ProblemContext`, but the only BAML function for Stage 1 is `RefinePersona`. This means constraints will likely be user-entered manually in Stage 1 (the user types them, picks types), not AI-generated. The AC confirms: "text inputs for persona description, domain, constraints -> calls `/api/persona` -> shows PersonaCard + ConstraintList". The persona is AI-refined; constraints are user-provided.

## Workshop Page (`routes/workshop/+page.svelte`)

Currently a bare shell with a header and placeholder text. The stage comments outline the flow:
- Stage 1: Setup (persona + context) — **this ticket**
- Stage 2: Analyze
- Stage 3: Expand
- Stage 4: Refine
- Stage 5: Export

## Svelte 5 Patterns in Use

The project uses Svelte 5 runes (`$state`, `$derived`, `$props`). The layout uses `let { children } = $props()`. Components should follow this pattern — use `$props()` for component inputs, avoid legacy `export let` syntax.

## Testing Infrastructure

- Playwright E2E tests in `frontend/tests/`
- Tests run against `VITE_MOCK_API=true` preview build (port 4173)
- Mock data provides realistic streaming without LLM costs
- 19 existing tests pass (3 workshop, 16 streaming)

## Type Alignment Concern

The T-003-03 review flagged a `move` vs `moveType` mismatch between BAML types and frontend types. BAML `types.baml` uses `moveType`, frontend `session.svelte.ts` uses `move`. Not directly relevant to this ticket (PersonaCard/ConstraintList don't touch variants), but noted.

## Key Constraints

1. **No Svelte component library** — using raw Tailwind CSS, no headless UI or component framework
2. **Svelte 5 runes** — must use `$state`, `$derived`, `$props`, `$effect` where appropriate
3. **Inline editing** — click-to-edit fields, blur-to-save. No separate edit modal
4. **Streaming graceful degradation** — partial data means fields may be `undefined` initially
5. **Store is source of truth** — edits must flow back to `session.persona` / `session.problemContext`
6. **Two concurrent agents** — this is frontend track, should not touch backend files
7. **Playwright tests use mock data** — tests verify UI behavior against fixture data, not real API
