# Review — T-003-05: analysis-panel-component

## Summary of Changes

### Files Modified

1. **`frontend/src/lib/components/AnalysisPanel.svelte`** (rewrite)
   - Replaced placeholder stub with full display component
   - Accepts `analysis: Partial<HMWAnalysis>` and `isStreaming: boolean` props
   - Renders 6 sections conditionally as streaming partials arrive:
     - Implicit User (text)
     - Embedded Assumptions (bulleted list)
     - Scope Level (colored badge: amber for too_narrow/too_broad, green for well_scoped)
     - Solution Bias (conditional amber callout, only when present)
     - Underlying Tension (emphasized block with left blue border accent)
     - Initial Reframing (italic quoted text in gray background)
   - Skeleton pulse placeholders for sections not yet streamed
   - All sections have `data-testid` attributes for testing

2. **`frontend/src/routes/workshop/+page.svelte`** (modified)
   - Added Stage 2 section gated by `isComplete` (appears after Stage 1 persona is finalized)
   - HMW textarea input with label "Your rough HMW statement"
   - "Analyze" button triggers `analyzeHMW()` function
   - Streaming orchestration follows Stage 1 pattern: local `streamingAnalysis` state, `streamFromAPI` call, `session.setAnalysis()` on completion
   - **Key design decision**: Uses local `isAnalyzing` flag instead of `session.isStreaming` for analysis streaming state. The global `isStreaming` flag drives `isComplete` (which gates Stage 2 visibility), so using it for analysis would hide Stage 2 during its own streaming.
   - Error display with `data-testid="analysis-error"`
   - Imported `AnalysisPanel` component and `HMWAnalysis` type

3. **`frontend/tests/workshop.spec.ts`** (modified)
   - Added import for `mockAnalysisPartials` and `mockAnalysisFinal`
   - Added `completeStage1()` helper function (routes persona mock, navigates, fills form, clicks Refine, waits for completion)
   - Added 10 new tests in 4 describe blocks:
     - **Stage 2 — Visibility gating** (2 tests): hidden before, visible after Stage 1
     - **Stage 2 — Analyze form** (3 tests): elements present, button disabled/enabled
     - **Stage 2 — Analysis streaming** (5 tests): full flow, all fields, scope badge, solution bias absent, fixture validation

### Files NOT Modified

- Session store (`session.svelte.ts`) — already had `HMWAnalysis` interface, `setAnalysis()`, all needed
- Stream utility (`stream.ts`) — no changes needed
- Mock layer (`mock.ts`) — already handles `/api/analyze`
- Analysis fixture (`analysis.ts`) — already has all needed data
- Backend files — backend endpoint already complete

## Acceptance Criteria Mapping

| Criterion | Status | Notes |
|-----------|--------|-------|
| Text input for raw HMW statement | Done | Textarea with label, placeholder, disabled during streaming |
| "Analyze" button calls `/api/analyze` with statement + ProblemContext | Done | Sends `{ statement, context }` to `/api/analyze` |
| Analysis streams section by section | Done | Progressive rendering with skeleton placeholders |
| Scope level with visual indicator | Done | Colored badge: amber (too narrow/broad), green (well scoped) |
| Solution bias highlighted if present | Done | Amber callout block, conditionally rendered |
| Underlying tension visually emphasized | Done | Left blue border accent + medium font weight |
| Initial reframing shown as preview | Done | Italic quoted text in gray background block |
| Analysis stored in session store | Done | `session.setAnalysis()` called after streaming completes |

## Test Coverage

- **42 total Playwright tests** (10 new for Stage 2 + 32 existing)
- All pass: `npm run check` (0 errors), `npm run lint` (clean), `npx playwright test` (42 passed)

### Coverage Gaps

- **Solution bias present rendering**: Cannot test via Playwright because `VITE_MOCK_API=true` bakes `mockFetch` into the build, so `page.route()` cannot override API responses. The conditional rendering logic (`{#if analysis.solutionBias}`) is verified by: (a) the "not visible when undefined" test proving the conditional branch works, and (b) fixture-level validation confirming the data shape.
- **API error handling**: Same limitation — cannot trigger a 500 response through `mockFetch`. The error handling code path is standard try/catch with reactive error display.

## Open Concerns

1. **Single `session.isStreaming` flag is a footgun.** The global `isStreaming` flag was designed for persona streaming but becomes problematic as more stages are added. I worked around it for Stage 2 with a local `isAnalyzing` variable. Future stages (Expand, Refine) will need similar local flags. Consider either:
   - Removing `session.isStreaming` entirely and using only local component state
   - Or adding per-stage streaming flags to the session store

2. **`page.route()` is silently bypassed by mockFetch.** The existing Stage 1 tests set up `page.route('/api/persona', ...)` but it's actually `mockFetch` serving the data. This works by coincidence (both return the same fixture data) but is misleading. The `page.route()` calls in Stage 1 tests are no-ops. This could be cleaned up in a future ticket.

3. **`isAnalysisComplete` is defined but unused.** Added the derived state for consistency with Stage 1's `isComplete`, but Stage 2 has no post-analysis editing behavior yet. Future tickets (Expand stage) will use it to gate Stage 3 visibility.
