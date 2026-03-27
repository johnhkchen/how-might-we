# Research: T-005-04 Streaming Animations

## Ticket Summary

Add visual polish to the streaming UX: fade/slide-in for persona fields, reveal animations for analysis sections, staggered grid entry for variant cards, skeleton/shimmer placeholders, a streaming pulse indicator, smooth CSS transitions, and `prefers-reduced-motion` support.

## Current Streaming Architecture

### Data Flow

1. User clicks action button (Refine Persona, Analyze, Expand, Go Deeper)
2. `streamFromAPI<T>()` in `lib/api/stream.ts` opens an SSE connection
3. `onPartial` callback receives progressively-complete `Partial<T>` objects
4. Local reactive state (`streamingPersona`, `streamingAnalysis`, etc.) updates
5. `$derived` bindings (`displayPersona`, `displayAnalysis`) bridge streaming/committed state
6. Components re-render as fields materialize
7. On `[DONE]`: data commits to session store, streaming flags clear

### Streaming Flags

- `session.isStreaming` — boolean, toggled by `startStreaming()`/`stopStreaming()` for persona
- `isAnalyzing` — local boolean in workshop page, controls analysis streaming
- `isExpanding` — local boolean, controls expand streaming
- `isRefining` — local boolean, controls refine streaming

### Where Animations Must Hook In

| Component | Streaming source | Fields that arrive incrementally |
|---|---|---|
| PersonaCard | `streamingPersona` | label, role, goals[], frustrations[], context, influencers[] |
| AnalysisPanel | `streamingAnalysis` | implicitUser, embeddedAssumptions[], scopeLevel, solutionBias, underlyingTension, initialReframing |
| VariantGrid/VariantCard | `session.candidates` via `addCandidates()` | Entire cards arrive as batch after stream completes, but expansion sends progressive partials with variant[] growing |
| RefineHMW | Same as expand | New variants added via `addCandidates()` |

## Current Visual State During Streaming

### PersonaCard (204 lines)

Already has basic skeleton loaders:
- Lines 7-10: `isStreaming` prop received
- Skeleton placeholders shown via `{#if isStreaming && !persona.label}` pattern
- Uses `animate-pulse` Tailwind class on gray placeholder divs
- Partial fields render immediately as they arrive (no transition)
- No enter/exit animations on field appearance

### AnalysisPanel (123 lines)

Also has skeleton loaders:
- `{#if isStreaming && !analysis.implicitUser}` pattern for each section
- Gray `animate-pulse` divs as placeholders
- Sections appear instantly when data arrives (no transition)
- No reveal animation between skeleton→content

### VariantGrid (43 lines)

Minimal streaming handling:
- Shows 4 skeleton cards during `isStreaming` when no candidates exist
- Cards appear all at once, no stagger
- No enter animation for individual cards

### VariantCard (193 lines)

No streaming awareness:
- Renders immediately when candidate data is present
- Status-based border colors change instantly
- No transition effects

## Existing CSS/Animation Infrastructure

### Tailwind Config

- Default config, no custom theme extensions
- No animation keyframes or transition utilities defined
- Only built-in `animate-pulse` used currently

### app.css

Minimal — just Tailwind directives:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

### Svelte Transition Support

Svelte has built-in transition directives:
- `transition:fade`, `transition:slide`, `transition:fly` — bidirectional
- `in:fade`, `in:slide`, `in:fly` — enter only
- `out:fade` — exit only
- `animate:flip` — for keyed each blocks
- Parameters: `duration`, `delay`, `easing`
- All from `svelte/transition` and `svelte/animate`

These are well-suited for streaming UX because they trigger on DOM element creation, exactly when streamed fields materialize.

### prefers-reduced-motion

No current handling. Svelte transitions do NOT automatically respect `prefers-reduced-motion`. This must be handled explicitly — either by conditionally applying transitions or setting duration to 0.

## Component Touch Points

### Files That Need Modification

1. **PersonaCard.svelte** — Add fade/slide-in for each field as it appears
2. **AnalysisPanel.svelte** — Add reveal animations for sections
3. **VariantGrid.svelte** — Add staggered entry animation for cards
4. **VariantCard.svelte** — Add enter animation, improve skeleton-to-content transition
5. **workshop/+page.svelte** — Potentially add streaming indicator at page level
6. **app.css** — Add custom keyframes for shimmer/pulse if needed

### Files That Should NOT Change

- `session.svelte.ts` — State logic is clean, animations are view-layer only
- `stream.ts` — Transport layer, no UI concerns
- `client.ts`, `mock.ts` — API layer unchanged
- `ClipBoard.svelte`, `ExportPanel.svelte` — Not involved in streaming
- `ConstraintList.svelte` — Static data, not streamed

## Test Implications

### Existing Test Coverage (913+ lines in workshop.spec.ts)

Tests use `page.route()` to mock SSE responses and assert final UI state. Key concerns:
- Tests check for element existence via `data-testid` selectors
- Tests use `waitForSelector` and Playwright's auto-waiting
- Animations could affect timing — Playwright waits for elements to be visible
- Need to ensure animations don't break existing test assertions
- Svelte transitions with short durations (200-300ms) shouldn't cause flaky tests
- May need `animation: none` in test environment or keep durations short enough

### Test Strategy for New Animations

- Animations are purely visual polish — existing functional tests should still pass
- Could add visual regression tests but that's out of scope
- Key risk: if `in:fly` or `in:slide` starts elements off-screen, Playwright's visibility checks might fail during the transition period. Keep transitions subtle (opacity, short slides).

## Constraints and Boundaries

1. **CSS transitions preferred over JS animations** — better performance, less layout thrash
2. **Svelte built-in transitions** — native, zero-dependency, well-integrated with Svelte's reactivity
3. **Must not break SSE streaming** — animations are display-layer only
4. **Must respect `prefers-reduced-motion`** — accessibility requirement
5. **Must not break Playwright tests** — keep transition durations short, avoid off-screen starts
6. **Tailwind + minimal custom CSS** — stay consistent with existing styling approach
7. **Frontend-only changes** — no backend modifications needed
8. **Two concurrent agents** — only touch frontend files per CLAUDE.md rules

## Key Patterns Observed

1. **Skeleton → Content pattern**: All streaming components already use `{#if isStreaming && !field}` conditionals to show skeletons. The transition from skeleton to content is where animations should hook in.

2. **Progressive field arrival**: Persona and analysis arrive field-by-field. Each field needs its own enter animation.

3. **Batch card arrival**: Variant cards arrive as the expansion partial grows. The grid sees candidates added progressively via `addCandidates()` or during streaming via the seenStatements dedup logic.

4. **Streaming indicator**: `isStreaming`, `isAnalyzing`, `isExpanding`, `isRefining` flags already exist and are properly managed. A pulse indicator just needs to consume these.
