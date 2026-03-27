# Review — T-003-07: workshop-page-flow-integration

## Summary

Integrated the full workshop stage flow with iteration tracking, visual distinction for refined variants, re-analysis warnings when editing the persona after analysis, and comprehensive E2E test coverage including a full-flow walk-through.

## Files Modified

| File | Change |
|------|--------|
| `frontend/src/lib/stores/session.svelte.ts` | Added `iteration: number` to `HMWCandidate`; updated `addCandidates()` signature to accept iteration param |
| `frontend/src/lib/components/VariantCard.svelte` | Added `data-iteration` attr, iteration badge (purple, visible when > 0), purple left border accent for refined cards |
| `frontend/src/routes/workshop/+page.svelte` | Iteration tracking in expand/refine, iteration count display, re-analysis warning banner with `personaDirty` flag |
| `frontend/tests/workshop.spec.ts` | 9 new tests: iteration tracking (5), re-analysis warning (3), full flow (1) |

## Acceptance Criteria Coverage

| AC | Status | How |
|----|--------|-----|
| Workshop shows Stage 1 initially | Pass | Pre-existing, verified in full-flow test |
| Completing Stage 1 reveals Stage 2 | Pass | Pre-existing, verified in full-flow test |
| Completing Stage 2 reveals Stage 3 with Expand | Pass | Pre-existing, verified in full-flow test |
| Variant cards with select/skip/edit/clip actions | Pass | Pre-existing, verified in full-flow test |
| Go Deeper triggers refine loop | Pass | Pre-existing, verified in full-flow test |
| New variants from refine visually distinct | Pass | Purple left border + "Iteration N" badge; `data-iteration` attribute; tested |
| Iteration count displayed and incremented | Pass | "Iteration N" text below Go Deeper button; tested for visibility and text |
| Previous stages visible and editable with warning | Pass | All stages remain visible; amber re-analysis warning on persona/constraint edit; tested |
| All stages work with mock API | Pass | Full flow test runs entirely with mocked API endpoints |
| Playwright tests cover full flow | Pass | Single comprehensive test walks Setup -> Analyze -> Expand -> Select -> Go Deeper |

## Test Coverage

- **Total**: 70 tests (9 new + 61 existing)
- **All passing**: `npm run check` (0 errors), `npm run lint` (clean), `npx playwright test` (70/70)

### New Test Groups

1. **Iteration tracking** (5 tests):
   - Count not visible after expand only
   - Count shows "Iteration 1" after Go Deeper
   - Expand cards have `data-iteration="0"`
   - Refined cards have `data-iteration="1"`
   - Refined cards show iteration badge; expand cards do not

2. **Re-analysis warning** (3 tests):
   - Warning absent after completing Stage 2
   - Editing persona triggers warning
   - Re-running analysis clears warning

3. **Full flow integration** (1 test):
   - Walks through all stages: Setup -> Analyze -> Expand -> Select + Clip -> Go Deeper
   - Verifies 9 total cards, iteration count, all stages visible, refinement insights

### Test Gaps

- No test for constraint editing triggering the re-analysis warning (code handles it; only persona edit is tested).
- No test for multiple Go Deeper iterations (iteration 2+). Code supports it.
- No test for ExportPanel (placeholder, separate ticket).

## Architecture Notes

- **Iteration increment timing**: Moved `session.incrementIteration()` from after-stream to before-stream in `refineHMW()`. This ensures candidates receive the correct iteration number. The iteration count is captured in a local `const currentIteration` to avoid race conditions during streaming.
- **personaDirty flag**: Local to the workshop page, not the session store. This keeps the store clean — the store doesn't need to know about UI warning state.
- **No fixture changes**: Existing mock data works as-is for all new tests.

## Open Concerns

1. **Single `session.isStreaming` flag**: Still used only for Stage 1 persona streaming. Local flags (`isAnalyzing`, `isExpanding`, `isRefining`) handle other stages. This is a workaround, not a design — if a future ticket adds more streaming stages, it should consider per-stage streaming flags in the store.
2. **Session state is ephemeral**: In-memory only. Page refresh loses everything. This is by design per the spec but worth noting for users expecting persistence.
3. **ExportPanel**: Still a placeholder stub. Separate ticket expected.
