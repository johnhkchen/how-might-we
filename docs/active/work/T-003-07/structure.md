# Structure — T-003-07: workshop-page-flow-integration

## Files Modified

### 1. `frontend/src/lib/stores/session.svelte.ts`

**Change**: Add `iteration` field to `HMWCandidate` interface and update `addCandidates()`.

```
HMWCandidate {
  id: string
  variant: HMWVariant
  status: CandidateStatus
  userEdits?: string
+ iteration: number          // 0 = from expand, 1+ = from refine
}
```

```
- addCandidates(variants: HMWVariant[]): void
+ addCandidates(variants: HMWVariant[], iteration: number = 0): void
```

The `iteration` parameter defaults to 0 for backwards compatibility. Each new candidate gets this value.

### 2. `frontend/src/routes/workshop/+page.svelte`

**Changes**:

a) **Iteration tracking in refineHMW()**:
- Increment iteration count BEFORE streaming (so candidates get the correct iteration number).
- Pass `session.iterationCount` to `addCandidates()` in both expand and refine callbacks.

b) **Iteration count display**:
- Add `data-testid="iteration-count"` element below Go Deeper button.
- Show only when `session.iterationCount > 0`.
- Text: "Iteration {session.iterationCount}"

c) **Re-analysis warning state**:
- Add `let personaDirty = $state(false)` local state.
- In `handlePersonaUpdate()`: set `personaDirty = true` if `session.analysis` exists.
- In `handleConstraintUpdate()`: set `personaDirty = true` if `session.analysis` exists.
- In `analyzeHMW()`: reset `personaDirty = false` on success.

d) **Re-analysis warning banner**:
- Amber banner between Stage 1 output and Stage 2 section.
- `data-testid="reanalysis-warning"`.
- Text: "You've edited the persona or constraints since the last analysis. Consider re-running the analysis to update."
- Rendered when `personaDirty && isComplete`.

### 3. `frontend/src/lib/components/VariantCard.svelte`

**Changes**:

a) **Accept iteration from candidate**:
- Read `candidate.iteration` (already available via HMWCandidate type).

b) **Visual distinction for refined variants**:
- When `candidate.iteration > 0`: add a small purple "Iteration N" badge next to the move badge.
- Add `data-iteration={candidate.iteration}` attribute to the card root div.
- Add a subtle left border accent (purple) for iteration > 0 cards.

### 4. `frontend/tests/workshop.spec.ts`

**Changes**:

a) **Add `completeStage3()` helper**:
- Extends `completeStage2()` to also mock `/api/expand`, click Expand, wait for 6 cards.

b) **New test group: "Full flow"**:
- Test: walk Setup -> Analyze -> Expand -> Select -> Go Deeper -> verify 9 cards, insights visible.

c) **New test group: "Iteration tracking"**:
- Test: iteration count not visible after expand only.
- Test: iteration count shows "Iteration 1" after Go Deeper.
- Test: refined variant cards have `data-iteration="1"`.
- Test: expand variant cards have `data-iteration="0"`.

d) **New test group: "Re-analysis warning"**:
- Test: warning not visible initially after completing Stage 2.
- Test: editing persona after analysis shows warning.
- Test: re-running analysis clears the warning.

## Component Dependency Graph (unchanged)

```
workshop/+page.svelte
  ├── PersonaCard.svelte         (no changes)
  ├── ConstraintList.svelte      (no changes)
  ├── AnalysisPanel.svelte       (no changes)
  ├── VariantGrid.svelte         (no changes)
  │     └── VariantCard.svelte   (minor: iteration badge + data attr)
  └── ClipBoard.svelte           (no changes)
```

## Files NOT Modified

- `frontend/src/lib/api/stream.ts` — No changes needed.
- `frontend/src/lib/api/mock.ts` — No changes needed.
- `frontend/src/lib/api/client.ts` — No changes needed.
- `frontend/tests/fixtures/*` — Existing fixtures work as-is.
- All backend files — Backend is complete.
- `frontend/src/lib/components/PersonaCard.svelte` — Warning lives in workshop page, not the component.
- `frontend/src/lib/components/ConstraintList.svelte` — Same reason.
- `frontend/src/lib/components/AnalysisPanel.svelte` — No changes needed.
- `frontend/src/lib/components/VariantGrid.svelte` — Passes candidates to VariantCard; no awareness of iteration needed.
- `frontend/src/lib/components/ClipBoard.svelte` — No changes needed.

## Ordering

1. Session store first (adds `iteration` field) — everything else depends on this.
2. VariantCard next (consumes the new field).
3. Workshop page (passes iteration values, adds warning + iteration display).
4. Tests last (verifies all the above).
