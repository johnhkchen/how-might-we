# Plan — T-003-05: analysis-panel-component

## Step 1: Implement AnalysisPanel component

**File:** `frontend/src/lib/components/AnalysisPanel.svelte`

Replace the stub with the full display component:
- Accept `analysis: Partial<HMWAnalysis>` and `isStreaming: boolean` props
- Render each section conditionally based on field presence
- Scope level badge with color coding
- Solution bias conditional callout
- Underlying tension emphasized block
- Initial reframing preview block
- Skeleton placeholders during streaming
- All sections with `data-testid` attributes

**Verify:** `npm run check` and `npm run lint` pass.

## Step 2: Wire Stage 2 into workshop page

**File:** `frontend/src/routes/workshop/+page.svelte`

- Add import for AnalysisPanel and HMWAnalysis type
- Add local state: `hmwStatement`, `streamingAnalysis`, `analysisError`, `hasAnalysisStarted`
- Add `analyzeHMW()` function following the refinePersona pattern
- Add derived states: `displayAnalysis`, `isAnalysisComplete`
- Add Stage 2 template section gated by `isComplete` (Stage 1 done)
- Stage 2 contains: HMW input textarea, Analyze button, error display, AnalysisPanel

**Verify:** `npm run check` and `npm run lint` pass. Visual check with `npm run dev:mock` — Stage 2 should appear after persona refinement, and clicking Analyze should stream analysis data.

## Step 3: Write Playwright E2E tests

**File:** `frontend/tests/workshop.spec.ts`

Add test blocks:
- Stage 2 visibility gating (not visible before Stage 1 completion)
- Stage 2 form elements (HMW input, Analyze button)
- Analyze button enable/disable behavior
- Full streaming flow (mock both persona and analyze APIs, complete Stage 1 first, then test Stage 2)
- All analysis fields displayed correctly
- Scope level badge text and color
- Solution bias conditional display
- Underlying tension and initial reframing present

**Verify:** `npx playwright test` passes.

## Step 4: Verify build and lint

Run all verification commands:
- `npm run check` — Svelte + TypeScript
- `npm run lint` — ESLint
- `npx playwright test` — E2E tests

Fix any issues found.

## Testing Strategy

- **E2E (Playwright):** Primary test layer. Mock API routes via `page.route()` to return fixture SSE data. Tests verify the full user flow: complete Stage 1 → see Stage 2 → enter HMW → click Analyze → see streaming analysis.
- **No unit tests needed:** AnalysisPanel is a pure display component with no business logic. The session store methods are already tested via existing tests. The streaming infrastructure is tested in `streaming.spec.ts`.
- **Mock data:** Use existing `mockAnalysisPartials` and `mockAnalysisFinal` from `tests/fixtures/analysis.ts`. No new fixtures needed.
