# Plan — T-003-06: variant-grid-clipboard-components

## Implementation Steps

### Step 1: Implement VariantCard component

Replace the stub in `VariantCard.svelte` with the full component:
- Props: `candidate`, `onStatusChange`
- Move type color map (8 entries)
- Move type label formatter (snake_case → Title Case)
- Status-based rendering (generated/selected/edited/skipped/clipped)
- Inline edit mode with textarea, commit on blur/Enter, cancel on Escape
- Action buttons with appropriate data-testid attributes
- Appropriate border/opacity styling per status

**Verify:** `npm run check` passes. Component renders in isolation mentally (no runtime test yet — tested via VariantGrid).

### Step 2: Implement VariantGrid component

Replace the stub in `VariantGrid.svelte` with:
- Props: `candidates`, `onStatusChange`, `isStreaming`
- Responsive grid layout (`grid-cols-1 lg:grid-cols-2 gap-4`)
- Keyed `{#each}` block using `candidate.id`
- Pass-through of `onStatusChange` to each VariantCard
- Empty/streaming state with pulse placeholders

**Verify:** `npm run check` passes.

### Step 3: Implement ClipBoard component

Replace the stub in `ClipBoard.svelte` with:
- Props: `clippedCandidates`, `onRemove`
- Header with "Clipped HMWs" title + count badge
- List of clipped items with statement, move badge, remove button
- Empty state message
- data-testid attributes for testing

**Verify:** `npm run check` passes.

### Step 4: Wire Stage 3 (Expand) into workshop page

Modify `workshop/+page.svelte`:
- Import VariantGrid, ClipBoard, new types (HMWVariant, HMWExpansion)
- Add local state: `isExpanding`, `expandError`, `hasExpandStarted`, `seenStatements`
- Add `expandHMW()` function: calls streamFromAPI, diffs variants, calls session.addCandidates()
- Add Stage 3 section in template, gated on `isAnalysisComplete`
- Add "Expand" button, VariantGrid, and ClipBoard
- Wire candidate status changes through to session.updateCandidateStatus

**Verify:** `npm run check` passes. `npm run lint` passes.

### Step 5: Wire Stage 4 (Refine / "Go Deeper") into workshop page

Modify `workshop/+page.svelte`:
- Add local state: `isRefining`, `refineError`, `streamingRefinement`
- Add `refineHMW()` function: builds HMWSession object, calls streamFromAPI('/api/refine', ...), diffs newVariants
- Add "Go Deeper" button gated on having selected/edited candidates
- Display tensions and recommendation from refinement response
- Increment iteration count on refine completion

**Verify:** `npm run check` passes. `npm run lint` passes.

### Step 6: Write Playwright E2E tests

Add to `workshop.spec.ts`:
- `completeStage2(page)` helper (mock persona + analyze, complete both)
- Stage 3 visibility gating tests
- Expand streaming test (mock /api/expand, verify cards appear)
- VariantCard action tests (click select/skip/clip, verify visual state)
- VariantCard inline edit test
- Move type badge color tests
- ClipBoard rendering tests (clip a card, verify clipboard shows it)
- ClipBoard remove tests
- Stage 4 "Go Deeper" gating and streaming tests

**Verify:** `npx playwright test` — all tests pass.

### Step 7: Verify build is green

- `npm run check` — Svelte + TypeScript checks
- `npm run lint` — ESLint
- `npx playwright test` — all E2E tests
- Fix any issues found

## Testing Strategy

### E2E Tests (Playwright)
- Mock `/api/expand` and `/api/refine` via `page.route()` using existing fixture data
- Test component visibility gating (Stage 3 after Stage 2, Go Deeper after selections)
- Test all VariantCard actions and visual states
- Test ClipBoard rendering and removal
- Test move type badge colors
- Test streaming: cards appear after expand button click
- Test inline editing: click statement → textarea → type → commit

### Manual Verification
- `npm run dev:mock` and click through full flow: persona → analyze → expand → select cards → clip → go deeper
- Verify responsive layout at different breakpoints
- Verify animation/transition on card appearance

## Commit Strategy

One commit per step is ideal, but grouping steps 1-3 (pure components) and step 4-5 (page wiring) is acceptable since they're tightly coupled. Tests in step 6 can be a separate commit.
