# Design — T-003-07: workshop-page-flow-integration

## Decision Summary

Four features need implementation: iteration tracking on candidates, iteration count display, re-analysis warning, and full-flow E2E tests.

---

## Feature 1: Visual Distinction for Refined Variants

### Options

**A. Add `iteration` field to HMWCandidate**
- Extend `HMWCandidate` interface with `iteration: number`.
- `addCandidates()` accepts an optional `iteration` param.
- Workshop page passes `0` for expand, `session.iterationCount + 1` for each refine call.
- VariantCard shows a small "Iteration N" badge when iteration > 0.
- Pro: Clean data model, enables future features (filter by iteration, collapse old iterations).
- Con: Slightly more complex store change; need to handle backwards compat in case candidates without iteration exist.

**B. Add a visual divider between iteration groups**
- No data model change. Instead, in the workshop page, track which candidates came from which call.
- Insert divider elements between groups.
- Pro: No store changes.
- Con: Fragile — relies on candidate ordering. Harder to test. Loses information about which iteration produced which variant.

**C. Use a CSS class based on timing**
- Apply a "new" class to recently-added variants, fade after a few seconds.
- Pro: Simple.
- Con: Ephemeral — once the animation ends, no distinction remains. Doesn't meet AC.

### Decision: Option A — Add `iteration` field to HMWCandidate

Rationale: The iteration is a meaningful attribute of a candidate. Storing it in the data model is the cleanest approach and enables the visual distinction to persist. It also makes the full-flow E2E test assertions cleaner (can check `data-iteration` attributes).

**Implementation**:
- `addCandidates(variants, iteration = 0)` — add optional second parameter with default 0.
- In `expandHMW()`: call `addCandidates(newVariants)` (iteration defaults to 0).
- In `refineHMW()`: increment iteration count FIRST, then call `addCandidates(newVariants, session.iterationCount)`.
- VariantCard: when `candidate.iteration > 0`, show a small purple "Iteration N" label and a subtle left-border accent.

---

## Feature 2: Iteration Count Display

### Options

**A. Show count next to Go Deeper button**
- "Go Deeper (Iteration 2)" or "Iteration 1 — Go Deeper"
- Pro: Contextual, right where the user acts.
- Con: Clutters the button area.

**B. Show count as a section header between Stage 3 and the refine button**
- "Refinement — Iteration 2" header text.
- Pro: Clear, prominent, establishes a visual section.
- Con: Adds visual weight.

**C. Show count inline below the Go Deeper button, as a subtle indicator**
- Small text: "Iteration 1 of refinement" below the button.
- Pro: Unobtrusive, informative.

### Decision: Option C — Subtle inline indicator

Rationale: The iteration count is informational, not a primary action. A small text indicator below the Go Deeper button keeps the UI clean while satisfying the AC. Show it only when `iterationCount > 0` (after at least one refine cycle).

---

## Feature 3: Re-analysis Warning

### Options

**A. Warning banner above the analysis panel when persona is dirty**
- Track a `personaDirty` flag. Set to true when persona is edited after analysis exists.
- Show amber warning: "You've edited the persona. The analysis below may no longer apply. Re-run analysis to update."
- Pro: Clear, actionable.
- Con: Need to track dirty state.

**B. Warning on the PersonaCard itself**
- When user clicks to edit a persona field (while analysis exists), show inline warning.
- Pro: Immediate feedback at point of action.
- Con: PersonaCard would need to know about analysis state, coupling components.

**C. Warning banner in the workshop page, between Stage 1 and Stage 2**
- Same as A but positioned between stages.
- Pro: Separates concerns — workshop page owns the warning, components stay pure.
- Con: Same as A.

### Decision: Option A — Warning banner above Stage 2

Rationale: The workshop page already knows about both persona and analysis state. A `personaDirty` flag is simple reactive state. The banner appears above Stage 2 when persona is edited after analysis is set. The warning is non-blocking — user can choose to re-analyze or continue.

**Implementation**:
- Track `personaDirty = $state(false)` in workshop page.
- In `handlePersonaUpdate()`: if `session.analysis` exists, set `personaDirty = true`.
- In `handleConstraintUpdate()`: same logic.
- In `analyzeHMW()`: on success, reset `personaDirty = false`.
- Render amber warning banner with `data-testid="reanalysis-warning"` between Stage 1 output and Stage 2 when `personaDirty` is true.

---

## Feature 4: Full-Flow E2E Tests

### New Tests

1. **Full flow test**: Setup -> Analyze -> Expand -> Select -> Go Deeper -> verify 9 cards + iteration indicator.
2. **Iteration count display**: After Go Deeper, iteration counter shows "Iteration 1".
3. **Visual distinction**: Refined variants have `data-iteration="1"` attribute.
4. **Re-analysis warning**: Complete Stage 1+2, edit persona, warning appears. Re-analyze, warning disappears.
5. **Re-analysis warning for constraints**: Complete Stage 1+2, edit constraint, warning appears.

### Test Helper

Add `completeStage3(page)` helper that extends `completeStage2` through expansion and returns with 6 variant cards visible.

---

## Rejected Approaches

- **Separate Stage 4 section**: Could have given Stage 4 its own `<section data-testid="stage-4">` block. Rejected because the spec says refine variants appear in the same grid as expand variants — they share the VariantGrid. A separate section would fragment the variant display.
- **Invalidate analysis on persona edit**: Could automatically clear `session.analysis` when persona changes. Rejected because this is destructive — the user may want to compare old analysis against new persona. Warning is non-destructive.
- **Per-stage streaming flags in store**: Could refactor session store to have `isExpandStreaming`, `isRefineStreaming`, etc. Rejected as over-engineering for this ticket — local flags in the page work fine and T-003-05/06 established this pattern.
