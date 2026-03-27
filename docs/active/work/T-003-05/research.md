# Research — T-003-05: analysis-panel-component

## Ticket Summary

Build the Stage 2 (Analyze) UI: AnalysisPanel. Text input for raw HMW statement, "Analyze" button calls `/api/analyze`, streams in HMWAnalysis section by section, stores result in session store.

## Relevant Files

### Frontend — Session Store
- `frontend/src/lib/stores/session.svelte.ts` — Svelte 5 runes-based store. Already has `HMWAnalysis` interface (lines 26–34), `analysis` state field (line 74), `setAnalysis()` method (line 99), `isStreaming`/`startStreaming()`/`stopStreaming()` (lines 77, 126–132).
- `HMWAnalysis` fields: `originalStatement`, `implicitUser`, `embeddedAssumptions: string[]`, `scopeLevel: 'too_narrow' | 'too_broad' | 'well_scoped'`, `solutionBias?: string`, `underlyingTension`, `initialReframing`.

### Frontend — Existing Placeholder
- `frontend/src/lib/components/AnalysisPanel.svelte` — Stub with `// TODO: implement` and placeholder text. This is the file we modify.

### Frontend — Workshop Page
- `frontend/src/routes/workshop/+page.svelte` — Currently implements only Stage 1 (persona + context). Stage 2 section needs to be added below Stage 1. The page imports `session`, `streamFromAPI`, `PersonaCard`, `ConstraintList`.
- Pattern: stage visibility is controlled by session state (e.g., `displayPersona` derived, `isComplete` derived). Stage 2 should appear when `session.problemContext` is set and persona refinement is complete.

### Frontend — Streaming Infrastructure
- `frontend/src/lib/api/stream.ts` — `streamFromAPI<T>(endpoint, body, onPartial)` handles SSE. Returns `Promise<void>`. The `onPartial` callback receives `Partial<T>` for each SSE event.
- `frontend/src/lib/api/client.ts` — `apiFetch` switches between real fetch and mock fetch based on `VITE_MOCK_API` env.
- `frontend/src/lib/api/mock.ts` — Already maps `/api/analyze` to `mockAnalysisPartials`. No changes needed.

### Frontend — Analysis Mock Fixture
- `frontend/tests/fixtures/analysis.ts` — Already has `mockAnalysisPartials` (5 progressive partials), `mockAnalysisFinal`, and `analysisSSEStream()`. Partials build: `originalStatement` → `implicitUser` → `embeddedAssumptions` → `scopeLevel` → `solutionBias + underlyingTension + initialReframing`.

### Backend — Handler
- `backend/handlers.go` — `handleAnalyze` (line 48) accepts `{ statement, context }`, validates both, streams `AnalyzeHMW` BAML output via SSE. Already fully implemented.

### Backend — BAML Types
- `backend/baml_src/types.baml` — `HMWAnalysis` class matches frontend interface.
- `backend/baml_src/analyze.baml` — `AnalyzeHMW(statement, context)` function prompt.

### Existing Component Patterns
- `PersonaCard.svelte` — Props via `$props()`, inline editing with `editingField`/`editValue` state, `focusOnMount` action, skeleton pulse for streaming fields. Good reference for streaming display.
- `ConstraintList.svelte` — Props via `$props()`, type badges with color mapping, add/edit/remove patterns.
- Workshop page pattern: local component state for form inputs (`let x = $state('')`), streaming state in a local variable (`streamingPersona`), session store for final state. Error handling via try/catch around `streamFromAPI`.

### Testing Patterns
- `frontend/tests/workshop.spec.ts` — Playwright tests mock API routes via `page.route()`, use `buildSSEBody()` helper to create SSE responses from fixture partials. Tests check `data-testid` attributes for element presence and content.
- `frontend/tests/streaming.spec.ts` — Fixture validation and SSE parsing tests.

## Key Observations

1. **Session store already supports analysis.** `session.analysis`, `session.setAnalysis()`, `session.isStreaming` are all ready.
2. **Mock data already exists.** `/api/analyze` is mapped in mock.ts, analysis fixtures exist. No fixture work needed.
3. **Backend is complete.** The `/api/analyze` endpoint is fully implemented and tested.
4. **AnalysisPanel.svelte exists as stub.** We modify it in place rather than creating a new file.
5. **Stage gating needed.** Stage 2 should only appear after Stage 1 is complete (i.e., `session.problemContext` is set). This matches the spec's "sections appear below" pattern.
6. **Streaming pattern is established.** The persona streaming pattern in workshop/+page.svelte is the template: local `streamingX` state for partials, `streamFromAPI` call, `session.setX()` on completion.
7. **HMWAnalysis has both required and optional fields.** `solutionBias` is optional — UI must handle null gracefully.
8. **`ProblemContext` is passed to `/api/analyze`.** The request body is `{ statement, context }` where context is the full `ProblemContext` from the store.

## Constraints & Risks

- **Two concurrent agents.** Must only touch frontend files — no backend changes needed (backend is complete).
- **isStreaming is global.** The session store has a single `isStreaming` flag. If persona and analysis share it, we need to ensure only one stream runs at a time. Current UI naturally prevents this (Stage 2 only appears after Stage 1 completes).
- **Scope indicator needs visual design.** The ticket says "scope level displayed with visual indicator (too narrow / too broad / well scoped)" — needs color/icon treatment similar to constraint type badges.
