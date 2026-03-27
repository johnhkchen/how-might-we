# Research — T-003-02: session-store-svelte5

## Objective

Map the codebase elements relevant to implementing the HMW session store using Svelte 5 runes.

---

## Existing Type Definitions

**File:** `frontend/src/lib/stores/session.ts`

The file already contains all TypeScript interfaces and types needed for session state:

- `Persona` — label, role, goals[], frustrations[], context, influencers[]
- `Constraint` — statement, type (hard|soft|assumption), challengeRationale?
- `ProblemContext` — domain, persona, constraints[], priorContext?
- `HMWAnalysis` — originalStatement, implicitUser, embeddedAssumptions[], scopeLevel, solutionBias?, underlyingTension, initialReframing
- `MoveType` — union of 8 string literals (narrowed, broadened, shifted_user, etc.)
- `HMWVariant` — statement, move, rationale
- `CandidateStatus` — 'generated' | 'selected' | 'edited' | 'skipped' | 'clipped'
- `HMWCandidate` — id, variant, status, userEdits?
- `SessionState` — persona, problemContext, analysis, candidates[], clippedIds (Set<string>), iterationCount, isStreaming

The file ends with `// TODO: implement Svelte 5 runes-based store`.

---

## Svelte 5 Runes API

Project uses Svelte 5 (`"svelte": "^5.0.0"` in package.json). Key runes:

- `$state(initialValue)` — creates deeply reactive state
- `$derived(expression)` — computed values that auto-update
- `$state.snapshot(value)` — get a plain, non-reactive copy (useful for serialization)

Svelte 5 stores are typically plain classes or objects with `$state` fields, exported as singletons. The old `writable()`/`readable()` store contract still works but runes are the idiomatic Svelte 5 approach.

Important: `$state` can only be used at the top level of a `.svelte.ts` file (not `.ts`). The file extension matters — it must be `.svelte.ts` for runes to work in non-component code.

---

## Consumer Analysis

### Components (all stubs, not yet importing the store)

- `PersonaCard.svelte` — will read/write `persona`
- `ConstraintList.svelte` — will read/write `problemContext.constraints`
- `AnalysisPanel.svelte` — will read `analysis`
- `VariantCard.svelte` — will read/write individual `HMWCandidate` status
- `VariantGrid.svelte` — will read `candidates[]`
- `ClipBoard.svelte` — will read clipped candidates (derived from `clippedIds`)
- `ExportPanel.svelte` — will read clipped candidates for export

### API Layer

- `stream.ts` — `streamFromAPI<T>()` takes an `onPartial` callback. The store methods will be called from these callbacks.
- `client.ts` — wraps fetch with mock switching
- `mock.ts` — returns fixture data as SSE streams

### Workshop Page

- `workshop/+page.svelte` — skeleton page, will orchestrate stages and call API + store methods

---

## Test Fixtures

Fixtures in `frontend/tests/fixtures/` define realistic partial streaming data. They import types from `session.ts`. The fixture types map to store state:

- `mockPersonaPartials` → `session.persona` (Persona)
- `mockAnalysisPartials` → `session.analysis` (HMWAnalysis)
- `mockExpansionPartials` → `session.candidates` (HMWCandidate[] created from HMWExpansion.variants)
- `mockRefinementPartials` → additional candidates (from HMWRefinement.newVariants)

Key observation: The expansion/refinement fixtures return `HMWVariant[]` objects, NOT `HMWCandidate[]`. The store's `addCandidates()` method must wrap variants into candidates by generating IDs and setting initial status.

---

## ID Generation

The acceptance criteria specify `crypto.randomUUID()`. This is available in all modern browsers and in Node 19+. Since the frontend targets modern browsers (SvelteKit + Vite), this is safe to use without polyfill.

---

## SessionState.clippedIds

The `SessionState` interface defines `clippedIds` as `Set<string>`. However, the acceptance criteria say `clippedIds` should be **derived** from candidates with `CLIPPED` status. This means:

1. `clippedIds` should not be independently mutable state — it's a computed view
2. It should be `$derived` from `candidates.filter(c => c.status === 'clipped')`
3. The interface may need adjustment: `clippedIds` becomes a derived getter, not stored state

---

## File Extension Constraint

Svelte 5 runes (`$state`, `$derived`) can only be used in files with `.svelte.ts` or `.svelte.js` extensions (or `.svelte` components). The current file is `session.ts` — it must be renamed to `session.svelte.ts` for runes to compile.

All imports from `$lib/stores/session` will resolve correctly since SvelteKit's `$lib` alias handles the `.svelte.ts` extension transparently.

Fixtures currently import from `../../src/lib/stores/session` — the import path stays the same since TypeScript resolves the `.svelte.ts` extension.

---

## Constraints & Boundaries

1. **Backend is stateless** — all session state lives in the frontend store
2. **No persistence** — session state is ephemeral (in-memory only)
3. **Single concurrent stream** — `isStreaming` flag prevents overlapping API calls
4. **Store must be importable** from any component via `$lib/stores/session`
5. **Types must remain exported** — fixtures and components import them from this file

---

## Summary of Key Findings

| Finding | Implication |
|---------|------------|
| File must be `.svelte.ts` for runes | Rename `session.ts` → `session.svelte.ts` |
| `clippedIds` should be derived | Use `$derived` from candidates, not independent state |
| Variants need wrapping to candidates | `addCandidates()` generates IDs + sets status |
| Fixtures import types from session | Types must remain exported after refactor |
| All components are stubs | No existing store usage to break |
| `isStreaming` is a guard flag | Methods should check/set it for concurrency safety |
