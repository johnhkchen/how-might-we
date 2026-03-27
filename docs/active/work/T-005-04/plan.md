# Plan: T-005-04 Streaming Animations

## Step 1: Create motion utility

**File:** `frontend/src/lib/utils/motion.ts`

Create `motionParams(duration, delay?)` function:
- Check `window.matchMedia('(prefers-reduced-motion: reduce)')`
- Return `{ duration: 0, delay: 0 }` for reduced motion
- Return `{ duration, delay: delay ?? 0 }` otherwise
- SSR guard: `typeof window !== 'undefined'`

**Verify:** `npm run check` passes with new file.

## Step 2: Add shimmer CSS and reduced-motion overrides

**File:** `frontend/src/app.css`

Add after `@tailwind utilities`:
- `.shimmer` class with gradient background sweep animation
- `@keyframes shimmer` (background-position -200% to 200%, 1.5s infinite)
- `.streaming-dot` pulse animation
- `@media (prefers-reduced-motion: reduce)` block that disables shimmer and streaming-dot animations

**Verify:** Dev server renders shimmer class correctly on a test element.

## Step 3: Add animations to PersonaCard

**File:** `frontend/src/lib/components/PersonaCard.svelte`

Changes:
- Import `fade`, `fly` from `svelte/transition` and `motionParams` from `$lib/utils/motion`
- Add `in:fade={motionParams(200)}` to label, role, and context elements in their `{:else if}` branches
- Add `in:fly={{ y: 10, ...motionParams(250, index * 60) }}` to each item in goals, frustrations, influencers `{#each}` blocks
- Replace `animate-pulse bg-gray-200` with `shimmer` on skeleton placeholder divs
- Add streaming indicator (pulsing dot + "Streaming...") when `isStreaming && !persona.label`

**Verify:** `npm run check` passes. Run `npm run dev:mock`, trigger persona refinement, observe field fade/fly-in.

## Step 4: Add animations to AnalysisPanel

**File:** `frontend/src/lib/components/AnalysisPanel.svelte`

Changes:
- Import `fade`, `slide` from `svelte/transition` and `motionParams`
- Add `in:fade={motionParams(250)}` to implicitUser, scopeLevel, reframing content elements
- Add `in:slide={motionParams(300)}` to assumptions list, solutionBias, underlyingTension containers
- Add stagger `in:fade={{ ...motionParams(200, index * 60) }}` to individual assumption list items
- Replace `animate-pulse bg-gray-200` with `shimmer` on skeleton placeholders
- Add streaming indicator (pulsing dot + "Analyzing...") at panel top when `isStreaming`

**Verify:** `npm run check` passes. Mock dev server shows analysis sections revealing sequentially.

## Step 5: Add staggered entry to VariantGrid

**File:** `frontend/src/lib/components/VariantGrid.svelte`

Changes:
- Import `fly` from `svelte/transition` and `motionParams`
- Wrap each VariantCard in a div with `in:fly={{ y: 20, ...motionParams(300, index * 80) }}`
- Replace skeleton `animate-pulse` with `shimmer` class
- Add streaming indicator (pulsing dot + "Generating...") below grid when `isStreaming`

**Verify:** `npm run check` passes. Mock dev server shows cards entering with stagger delay.

## Step 6: Add streaming indicator to workshop page

**File:** `frontend/src/routes/workshop/+page.svelte`

Changes:
- Add a small streaming indicator (dot + text) near the "Refine Persona" button area when `session.isStreaming` is true
- Indicator disappears when streaming completes

**Verify:** `npm run check` passes.

## Step 7: Run linting and type checks

**Commands:**
```bash
cd frontend && npm run check
cd frontend && npm run lint
```

Fix any issues found.

## Step 8: Run Playwright tests

**Command:**
```bash
cd frontend && npx playwright test
```

All existing tests should pass. If any test fails due to animation timing:
- Check if the failure is in element visibility detection
- If needed, adjust transition duration or use `{ duration: 0 }` in test environment
- Prefer fixing the animation parameters over modifying tests

## Step 9: Manual verification with mock server

**Command:**
```bash
cd frontend && npm run dev:mock
```

Verify each acceptance criterion:
- [ ] PersonaCard fields fade/slide in during streaming
- [ ] AnalysisPanel sections reveal with animation
- [ ] VariantCards enter grid with staggered animation
- [ ] Shimmer placeholders visible for fields not yet arrived
- [ ] "Streaming..." indicator visible and pulsing during active calls
- [ ] Animations are smooth (no layout thrash)
- [ ] Test with `prefers-reduced-motion: reduce` in browser devtools — all animations should be instant

## Testing Strategy

**Unit tests:** Not applicable — these are CSS/transition changes with no business logic.

**Integration tests:** Existing Playwright tests cover the functional behavior. Animations are additive and shouldn't change functional outcomes.

**Manual verification:** Required for visual quality. Use mock server (`npm run dev:mock`) to verify animation smoothness and timing without LLM costs.

**Accessibility testing:** Toggle `prefers-reduced-motion: reduce` in Chrome DevTools (Rendering tab) and verify all animations are disabled.

## Risk Mitigation

- **Flaky tests:** All animation durations < 400ms, well within Playwright's default 5000ms timeout
- **SSR errors:** `motionParams` guards against missing `window` object
- **Performance:** Using CSS transitions and Svelte's built-in transition system — both GPU-accelerated for opacity/transform
- **Layout thrash:** `fly` uses `transform: translateY()` which doesn't trigger reflow. `slide` uses `height` which can trigger reflow but is contained to individual elements
