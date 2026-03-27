# Research — T-003-07: workshop-page-flow-integration

## Scope

Wire up the workshop page to orchestrate the full stage flow (Setup -> Analyze -> Expand -> Refine loop -> Export) with progressive disclosure, iteration tracking, re-analysis warnings, and visual distinction for refined variants.

## Current State

### What Already Works

T-003-05 and T-003-06 implemented the individual stage components and wired them into the workshop page:

- **Stage 1 (Setup)**: Persona input, domain, constraints, streaming refinement via `/api/persona`. PersonaCard with inline editing. ConstraintList with add/edit/delete. Works end-to-end.
- **Stage 2 (Analyze)**: HMW input, Analyze button, streaming via `/api/analyze`. AnalysisPanel with all fields (implicit user, assumptions, scope badge, solution bias, tension, reframing). Gated on Stage 1 completion.
- **Stage 3 (Expand)**: Expand button, streaming via `/api/expand`. VariantGrid + VariantCard with all actions (select, skip, edit, clip). ClipBoard panel. Gated on Stage 2 completion.
- **Stage 4 (Refine)**: Go Deeper button, streaming via `/api/refine`. New variants deduped and appended. Refinement insights (tensions, recommendation, suggested next). `session.incrementIteration()` called. Gated on having actioned candidates.
- **Mock API**: All 4 endpoints mocked in `frontend/src/lib/api/mock.ts` with fixtures in `frontend/tests/fixtures/`.
- **Tests**: 61 Playwright tests covering individual stages, component actions, fixture validation.

### What's Missing (Gap Analysis vs. Acceptance Criteria)

**AC 6 — New variants from refine appear visually distinct from previous ones**
- Current: `addCandidates()` in session store creates candidates with no iteration metadata. All candidates look identical regardless of when they were generated.
- `HMWCandidate` interface has: `id, variant, status, userEdits` — no `iteration` or `source` field.
- VariantCard renders identically for all candidates. No visual cue for "new from refine."

**AC 7 — Iteration count displayed and incremented each cycle**
- `session.iterationCount` exists and `incrementIteration()` is called after each refine cycle.
- But the count is never rendered anywhere in the workshop page UI.
- The initial expand should be iteration 0; first refine makes it 1, etc.

**AC 8 — Previous stages remain visible and editable (editing persona shows warning about re-analysis)**
- Stages remain visible: Stage 1 always shows; Stage 2 shows after Stage 1; Stage 3 shows after Stage 2. All remain on page.
- PersonaCard inline editing is functional.
- **No warning exists** when editing persona after analysis is complete. Per the spec, editing persona should show a warning that downstream analysis may become stale.
- ConstraintList editing is similarly unwired — changes update `session.problemContext` but don't warn.

**AC 10 — Playwright tests cover the full flow with mock data**
- Tests exist for each stage individually, plus cross-stage helpers (`completeStage1`, `completeStage2`, `setupWithExpansion`).
- No single test walks through the entire flow: Setup -> Analyze -> Expand -> Select -> Go Deeper -> verify.
- No tests for: iteration count display, re-analysis warning, visual distinction of refine variants.

## Key Files

| File | Role | Needs Changes? |
|------|------|---------------|
| `frontend/src/routes/workshop/+page.svelte` | Main page orchestrating all stages | Yes — add iteration display, re-analysis warning, pass iteration to candidates |
| `frontend/src/lib/stores/session.svelte.ts` | Session state store | Yes — add `iteration` field to `HMWCandidate` |
| `frontend/src/lib/components/VariantCard.svelte` | Individual variant card | Yes — show iteration badge for refined variants |
| `frontend/src/lib/components/VariantGrid.svelte` | Grid layout for cards | No changes needed |
| `frontend/src/lib/components/PersonaCard.svelte` | Persona display with editing | No changes needed (warning lives in parent) |
| `frontend/tests/workshop.spec.ts` | E2E tests | Yes — add full-flow test, iteration count, warning, visual distinction tests |

## Data Flow for Iteration Tracking

```
expandHMW()
  -> session.addCandidates(variants)  // iteration = 0 (initial expand)
  -> seenStatements updated

refineHMW() [1st cycle]
  -> session.addCandidates(variants)  // iteration = 1
  -> session.incrementIteration()     // now iterationCount = 1

refineHMW() [2nd cycle]
  -> session.addCandidates(variants)  // iteration = 2
  -> session.incrementIteration()     // now iterationCount = 2
```

The iteration value for each candidate is `session.iterationCount` at the time `addCandidates` is called. For expand, this is 0. For the first refine cycle, this is 1 (incremented after adding). Wait — actually `incrementIteration()` is called AFTER `addCandidates()` in `refineHMW()`, so the first refine batch would get iteration 0, same as expand. Need to increment BEFORE adding, or pass iteration explicitly.

Looking at the code: `refineHMW()` calls `session.addCandidates(newVariants)` during the streaming callback, then `session.incrementIteration()` after the stream completes. So refine variants from iteration 1 would be added while `iterationCount` is still 0.

**Fix**: Either increment before the stream, or pass iteration explicitly to `addCandidates`. The cleanest approach: add an optional `iteration` parameter to `addCandidates`, and always pass the current iteration count + 1 for refine calls (or just use a separate counter in the workshop page).

## Constraints

- Backend is complete and stateless — no backend changes needed.
- Two concurrent agents may be running; this ticket is frontend-only.
- Must not break existing 61 tests.
- Mock API already handles all endpoints; no fixture changes needed for existing functionality.
- Svelte 5 runes pattern must be followed.

## Streaming Flag Architecture

T-003-05 noted that the single `session.isStreaming` flag is problematic. T-003-06 worked around it with local `isExpanding` and `isRefining` flags. Stage 2 uses local `isAnalyzing`. This pattern is stable and should be continued — no refactor needed for this ticket.

## Re-analysis Warning Design

The spec says: "editing persona shows warning about re-analysis." This means:
- After analysis is complete (`session.analysis` is set), if the user edits the persona via PersonaCard, a warning should appear.
- The warning should indicate that the analysis was based on the previous persona and may need to be re-run.
- This is a UI-only change — no actual invalidation of analysis data (user decides whether to re-analyze).
- Warning should also apply to constraint editing in the post-refinement ConstraintList.
