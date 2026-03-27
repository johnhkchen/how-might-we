# Structure — T-003-05: analysis-panel-component

## Files Modified

### 1. `frontend/src/lib/components/AnalysisPanel.svelte` (rewrite)

Replace the stub with a full display component.

**Props interface:**
```typescript
{
  analysis: Partial<HMWAnalysis>;
  isStreaming?: boolean;
}
```

**Internal structure:**
- No local state (pure display component)
- Sections rendered conditionally based on which fields exist in the partial
- Skeleton placeholders for sections not yet streamed
- `data-testid="analysis-panel"` on root

**Sections (in order):**
1. **Implicit User** — label + text value. `data-testid="analysis-implicit-user"`
2. **Embedded Assumptions** — label + bulleted list. `data-testid="analysis-assumptions"`
3. **Scope Level** — label + colored badge. `data-testid="analysis-scope-level"`
4. **Solution Bias** — conditional amber callout. `data-testid="analysis-solution-bias"` (only rendered when value is present)
5. **Underlying Tension** — emphasized block with left border. `data-testid="analysis-tension"`
6. **Initial Reframing** — preview block with italic quote style. `data-testid="analysis-reframing"`

Note: `originalStatement` is not displayed in the panel — it's the user's input already visible above.

**Scope badge color map:**
```typescript
const scopeClasses = {
  too_narrow: 'bg-amber-100 text-amber-800',
  too_broad: 'bg-amber-100 text-amber-800',
  well_scoped: 'bg-green-100 text-green-800'
};
const scopeLabels = {
  too_narrow: 'Too Narrow',
  too_broad: 'Too Broad',
  well_scoped: 'Well Scoped'
};
```

### 2. `frontend/src/routes/workshop/+page.svelte` (modify)

Add Stage 2 section below Stage 1. Follow the exact same orchestration pattern as Stage 1.

**New state variables:**
- `hmwStatement: string` — text input value
- `streamingAnalysis: Partial<HMWAnalysis>` — streaming partial
- `analysisError: string | null` — error state
- `hasAnalysisStarted: boolean` — controls display

**New function:**
- `analyzeHMW()` — validates input, calls `streamFromAPI<HMWAnalysis>('/api/analyze', { statement, context }, onPartial)`, stores result via `session.setAnalysis()`

**New imports:**
- `import AnalysisPanel from '$lib/components/AnalysisPanel.svelte'`
- `import type { HMWAnalysis } from '$lib/stores/session.svelte'`

**New template section:**
- Stage 2 section wrapped in `{#if isComplete}` guard (only shows after persona is finalized)
- Contains: textarea for HMW statement, "Analyze" button, error display, AnalysisPanel (when streaming/done)
- `data-testid="stage-2"` on section

**Derived state:**
- `displayAnalysis` — similar to `displayPersona`: shows `session.analysis` if set, else `streamingAnalysis` if streaming has started
- `isAnalysisComplete` — `!!session.analysis && !session.isStreaming`

### 3. `frontend/tests/workshop.spec.ts` (modify)

Add test describe block for Stage 2.

**New tests:**
1. Stage 2 section not visible before persona completion
2. Stage 2 section visible after persona completion
3. Analyze button disabled when HMW input is empty
4. Analyze button enabled when HMW input is filled
5. Clicking Analyze streams analysis and shows AnalysisPanel
6. AnalysisPanel displays all analysis fields
7. Scope level badge shows correct text and color
8. Solution bias callout appears when present
9. Underlying tension is displayed with emphasis
10. Initial reframing is displayed

**Test pattern:** Route mock for `/api/persona` (to complete Stage 1) + route mock for `/api/analyze` (to test Stage 2). Use `buildSSEBody(mockAnalysisPartials)`.

## Files NOT Modified

- `frontend/src/lib/stores/session.svelte.ts` — Already has all needed interfaces and methods
- `frontend/src/lib/api/stream.ts` — No changes needed
- `frontend/src/lib/api/mock.ts` — Already handles `/api/analyze`
- `frontend/tests/fixtures/analysis.ts` — Already has all needed fixture data
- Backend files — Backend is complete for this endpoint
- Other components — No cross-component changes

## Component Boundary

AnalysisPanel is a leaf component with no children. It receives data and renders it. All streaming logic, API calls, and state management happen in the workshop page (the orchestrator).
