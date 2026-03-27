# Research — T-003-06: variant-grid-clipboard-components

## Ticket Summary

Build the Stage 3-4 (Expand + Refine) UI components: VariantCard, VariantGrid, and ClipBoard. VariantCards stream in one at a time, each showing HMW statement, move type tag, and rationale. Users can select, skip, edit, or clip each card. ClipBoard is a persistent panel showing clipped HMWs.

## Current State

### Existing Components (Stubs)

All three target components exist as placeholder stubs:

- `frontend/src/lib/components/VariantCard.svelte` — empty shell, "TODO: implement"
- `frontend/src/lib/components/VariantGrid.svelte` — empty shell, "TODO: implement"
- `frontend/src/lib/components/ClipBoard.svelte` — empty shell, "TODO: implement"

### Session Store (`session.svelte.ts`)

Already has all necessary types and state management:

- **Types**: `HMWVariant`, `MoveType` (8 move types), `CandidateStatus` (generated/selected/edited/skipped/clipped), `HMWCandidate`
- **State**: `candidates: HMWCandidate[]` with `$state`, `clippedIds: Set<string>` derived, `clippedCandidates` derived
- **Methods**: `addCandidates(variants)`, `updateCandidateStatus(id, status, userEdits?)`, `clipCandidate(id)`, `startStreaming()`, `stopStreaming()`, `isStreaming`

The store is complete — no modifications needed for this ticket.

### Workshop Page (`workshop/+page.svelte`)

Currently implements Stages 1-2 only:
- Stage 1: Setup (persona + context) — fully functional
- Stage 2: Analyze — fully functional
- Stages 3-5: Not present in the template

The page already imports `session` and `streamFromAPI`. It follows a pattern of visibility gating: Stage 2 only appears after Stage 1 completes (`isComplete` derived).

### Streaming Infrastructure

- `lib/api/stream.ts` — `streamFromAPI<T>()` handles SSE parsing, calls `onPartial` with each partial
- `lib/api/client.ts` — switches between real fetch and mock fetch
- `lib/api/mock.ts` — returns fixture data with 150ms delays, already has `/api/expand` and `/api/refine` entries

### Test Fixtures

Expansion and refinement fixtures exist and are complete:

- `tests/fixtures/expansion.ts` — 4 partials, 6 variants in final, includes `emergentTheme`. Variants grow incrementally (1, 2, 3, 6).
- `tests/fixtures/refinement.ts` — 3 partials, 3 `newVariants` in final, includes `tensions`, `recommendation`, `suggestedNextMove`.
- Both are already re-exported from `tests/fixtures/index.ts` and wired into `mock.ts`.

### Existing Patterns (from PersonaCard, AnalysisPanel)

Components follow Svelte 5 conventions:
- Props via `$props()` destructuring with defaults
- State via `$state()`
- Derived via `$derived()`
- Inline editing pattern: `editingField` + `editValue` + `startEdit()` + `commitEdit()` + `handleKeydown()`
- `focusOnMount` action directive
- `data-testid` attributes for Playwright tests
- Tailwind CSS for styling, consistent with gray/white/blue palette

### Move Type Color Map (from ticket AC)

The ticket defines 8 color assignments:
- narrowed → green
- broadened → purple
- shifted_user → orange
- reframed_constraint → teal
- elevated_abstraction → indigo
- inverted → red
- combined → amber
- decomposed → sky

### Existing Tests (`workshop.spec.ts`, `streaming.spec.ts`)

- `workshop.spec.ts`: Tests Stages 1-2, uses `buildSSEBody()` helper and `page.route()` mocking
- `streaming.spec.ts`: Tests SSE parsing, fixture data validation, mock timing
- Pattern: `completeStage1()` helper progresses through persona refinement before Stage 2 tests
- Same pattern will be needed for `completeStage2()` before Stage 3 tests

## Key Constraints & Boundaries

1. **No store modifications needed** — all candidate management methods exist
2. **No backend changes** — endpoints `/api/expand` and `/api/refine` already exist and are mocked
3. **No fixture changes** — expansion and refinement fixtures are complete
4. **Frontend-only ticket** — all work is in `frontend/src/lib/components/` and `frontend/src/routes/workshop/+page.svelte`
5. **Streaming UX** — expansion streams variants array that grows (partial has all variants so far); refinement streams newVariants similarly
6. **The expand endpoint returns `HMWExpansion` (variants + emergentTheme)** — not individual variants. The partial callback receives the full array each time with one more variant added. VariantGrid must diff against what's already displayed.
7. **Two concurrent agents** — backend agent may be working simultaneously. This ticket touches only frontend files.

## Data Flow

```
User clicks "Expand"
  → streamFromAPI('/api/expand', { analysis, context }, onPartial)
  → Each partial: { variants: HMWVariant[], emergentTheme? }
  → On each partial, diff new variants → add to candidates via session.addCandidates()
  → VariantGrid renders candidates
  → User actions (select/skip/edit/clip) → session.updateCandidateStatus()
  → ClipBoard reads session.clippedCandidates

User clicks "Go Deeper" (refine)
  → streamFromAPI('/api/refine', { session: HMWSession }, onPartial)
  → Each partial: { newVariants, tensions?, recommendation?, suggestedNextMove? }
  → Diff new variants → session.addCandidates()
  → New cards appear in VariantGrid alongside existing ones
```

## Open Questions

1. Should VariantGrid show ALL candidates or just the current iteration's? The spec says "new variants stream in alongside existing selected ones, visually distinct as new" — implying all candidates are shown.
2. For the `edit` action on VariantCard, does the user edit the variant statement only, or also the rationale? The store has `userEdits?: string` suggesting statement only.
3. ClipBoard is described as "persistent sidebar/bottom panel" — the current layout is `max-w-4xl` centered. Should ClipBoard be a sidebar (changing layout) or a bottom panel within the same column?
