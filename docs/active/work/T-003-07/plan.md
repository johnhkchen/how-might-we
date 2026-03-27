# Plan — T-003-07: workshop-page-flow-integration

## Step 1: Update Session Store — Add iteration field

**Files**: `frontend/src/lib/stores/session.svelte.ts`

Changes:
- Add `iteration: number` to `HMWCandidate` interface.
- Update `addCandidates(variants, iteration = 0)` to accept and set iteration.

**Verify**: `npm run check` passes — TypeScript will flag any callers that break.

## Step 2: Update VariantCard — Visual distinction for refined variants

**Files**: `frontend/src/lib/components/VariantCard.svelte`

Changes:
- Add `data-iteration={candidate.iteration}` to root div.
- When `candidate.iteration > 0`: show small purple "Iteration N" badge.
- Add subtle left purple border for iteration > 0 cards.

**Verify**: `npm run check` passes.

## Step 3: Update Workshop Page — Iteration tracking, display, and warning

**Files**: `frontend/src/routes/workshop/+page.svelte`

Changes:
a) In `expandHMW()`: pass `0` to `addCandidates()` (explicit).
b) In `refineHMW()`: increment iteration FIRST, then pass `session.iterationCount` to `addCandidates()`.
c) Add iteration count display below Go Deeper button (visible when iterationCount > 0).
d) Add `personaDirty` state and re-analysis warning banner.
e) Wire `handlePersonaUpdate` and `handleConstraintUpdate` to set `personaDirty` when analysis exists.
f) Reset `personaDirty` in `analyzeHMW()` on success.

**Verify**: `npm run check` and `npm run lint` pass.

## Step 4: Write Playwright Tests

**Files**: `frontend/tests/workshop.spec.ts`

Changes:
a) Add `completeStage3(page)` helper.
b) Add "Full flow" test group — full walk-through from Setup to Go Deeper.
c) Add "Iteration tracking" test group — count display, data-iteration attributes.
d) Add "Re-analysis warning" test group — appears on edit, clears on re-analyze.

**Verify**: `npx playwright test` — all tests pass (existing + new).

## Step 5: Final Verification

- `npm run check` — 0 errors, 0 warnings.
- `npm run lint` — clean.
- `npx playwright test` — all tests green.
- Count total tests to report in progress.md.

## Testing Strategy

| What | How | Coverage |
|------|-----|----------|
| Iteration field on candidates | Assert `data-iteration` attribute values | Expand cards = 0, Refine cards = 1 |
| Iteration count display | Assert `data-testid="iteration-count"` text | Absent before refine, shows "Iteration 1" after |
| Visual distinction | Assert iteration badge visible on refine cards | Purple badge with "Iteration 1" text |
| Re-analysis warning | Assert `data-testid="reanalysis-warning"` | Appears on persona edit, absent before, clears on re-analyze |
| Full flow | Single test through all stages | Ensures no regressions in stage gating |
