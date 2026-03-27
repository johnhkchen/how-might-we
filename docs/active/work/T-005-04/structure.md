# Structure: T-005-04 Streaming Animations

## File Changes Overview

```
frontend/src/
├── app.css                          # MODIFY: Add shimmer keyframe + reduced-motion media query
├── lib/
│   ├── utils/
│   │   └── motion.ts                # CREATE: Reduced-motion transition helper
│   └── components/
│       ├── PersonaCard.svelte       # MODIFY: Add field enter transitions, shimmer placeholders
│       ├── AnalysisPanel.svelte     # MODIFY: Add section reveal transitions, shimmer, streaming indicator
│       ├── VariantGrid.svelte       # MODIFY: Add stagger logic, streaming indicator
│       └── VariantCard.svelte       # MODIFY: Add enter animation
├── routes/
│   └── workshop/+page.svelte       # MODIFY: Add streaming indicator near persona section
```

No files deleted. No backend changes. No test file changes (existing tests should pass as-is).

## New File: `lib/utils/motion.ts`

**Purpose:** Single utility function for reduced-motion-aware transition parameters.

**Public Interface:**
```typescript
export function motionParams(
  duration: number,
  delay?: number
): { duration: number; delay: number }
```

**Behavior:**
- Reads `window.matchMedia('(prefers-reduced-motion: reduce)')` on each call
- Returns `{ duration, delay: delay ?? 0 }` normally
- Returns `{ duration: 0, delay: 0 }` when reduced motion is preferred
- SSR-safe: check `typeof window !== 'undefined'`, default to no-motion on server

**Size:** ~15 lines.

## Modified File: `app.css`

**Current state:** 3 Tailwind directives only.

**Additions (after `@tailwind utilities`):**

1. Shimmer keyframe animation:
   - `.shimmer` class with linear-gradient background sweep
   - `@keyframes shimmer` — translates background-position from -200% to 200%
   - Duration: 1.5s, infinite repeat, ease-in-out

2. Reduced-motion media query:
   - `@media (prefers-reduced-motion: reduce)` block
   - Disables `.shimmer` animation
   - Sets `.streaming-dot` animation to none

3. Streaming dot utility:
   - `.streaming-dot` class for the pulsing indicator dot

**Size delta:** ~25 lines added.

## Modified File: `PersonaCard.svelte`

**Imports to add:**
```svelte
import { fade, fly } from 'svelte/transition';
import { motionParams } from '$lib/utils/motion';
```

**Changes by section:**

1. **Label/Role header** — Add `in:fade={motionParams(200)}` to the h2/p elements in the `{:else if}` branch
2. **Goals list** — Each `{#each}` item gets `in:fly={{ y: 10, ...motionParams(250, index * 60) }}`
3. **Frustrations list** — Same stagger pattern as goals
4. **Context textarea** — `in:fade={motionParams(200)}` on the content div
5. **Influencers list** — Same stagger pattern as goals
6. **Skeleton placeholders** — Replace `animate-pulse bg-gray-200` with `shimmer` class

**Structural change:** None. All `{#if}` blocks remain identical. Transitions are added as attributes on existing elements.

**Streaming indicator:** Add a small "Streaming..." text with pulsing dot next to the card header when `isStreaming` is true.

## Modified File: `AnalysisPanel.svelte`

**Imports to add:**
```svelte
import { fade, slide } from 'svelte/transition';
import { motionParams } from '$lib/utils/motion';
```

**Changes by section:**

1. **Implicit User** — `in:fade={motionParams(250)}` on content element
2. **Embedded Assumptions** — `in:slide={motionParams(300)}` on the list container; individual items get `in:fade` with stagger
3. **Scope Level badge** — `in:fade={motionParams(200)}`
4. **Solution Bias** — `in:slide={motionParams(300)}` (conditional section, natural transition point)
5. **Underlying Tension** — `in:slide={motionParams(300)}`
6. **Initial Reframing** — `in:fade={motionParams(250)}`
7. **Skeleton placeholders** — Replace `animate-pulse bg-gray-200` with `shimmer` class

**Streaming indicator:** Add pulsing dot + "Analyzing..." text at top of panel when `isStreaming` is true.

## Modified File: `VariantGrid.svelte`

**Imports to add:**
```svelte
import { fly } from 'svelte/transition';
import { motionParams } from '$lib/utils/motion';
```

**Changes:**

1. **Card wrapper divs** — Each `{#each candidates as candidate, index}` iteration wraps the VariantCard in a div with `in:fly={{ y: 20, ...motionParams(300, index * 80) }}`
2. **Skeleton cards** — Replace `animate-pulse` with `shimmer` class
3. **Streaming indicator** — Add pulsing "Generating..." text below the grid when `isStreaming` is true

**Note on stagger:** The `index * 80` delay works naturally for initial load. For incrementally added cards during streaming, the index of new cards will be higher, so they'll have larger delays — this creates a pleasant effect of later cards appearing slightly after earlier ones.

## Modified File: `VariantCard.svelte`

**No transition imports needed** — the parent (VariantGrid) handles the enter animation on the wrapper div. VariantCard itself doesn't need to know about transitions.

**Changes:**
- No `in:` transitions added directly (handled by parent wrapper)
- Existing status-based border classes remain as-is (instant state changes are fine — those are user actions, not streaming)

This keeps VariantCard focused on card content/interactions and VariantGrid responsible for layout animations.

## Modified File: `workshop/+page.svelte`

**Changes:**

1. **Persona section header area** — When `session.isStreaming`, show streaming indicator dot
2. **Import** `motionParams` if any direct transitions are added to page-level elements

**Scope:** Minimal. The streaming indicators for analysis and variants are better placed in their respective components (AnalysisPanel, VariantGrid) since those components already receive `isStreaming` props.

## Component Boundaries

```
workshop/+page.svelte
  ├── [streaming indicator for persona]  ← page owns this
  ├── PersonaCard
  │     └── [field transitions, shimmer] ← component owns its field animations
  ├── AnalysisPanel
  │     └── [section transitions, shimmer, streaming indicator] ← component owns
  ├── VariantGrid
  │     ├── [stagger wrapper, streaming indicator] ← grid owns stagger
  │     └── VariantCard[] ← no animation responsibility
  └── ClipBoard / ExportPanel ← unchanged
```

Each component manages its own animations. No animation state crosses component boundaries. The only shared dependency is the `motionParams` utility.

## Ordering of Changes

1. `motion.ts` — utility first, no dependencies
2. `app.css` — shimmer styles, no component dependencies
3. `PersonaCard.svelte` — depends on motion.ts + app.css
4. `AnalysisPanel.svelte` — depends on motion.ts + app.css
5. `VariantGrid.svelte` — depends on motion.ts + app.css
6. `workshop/+page.svelte` — depends on motion.ts (minor change)

Steps 3-6 are independent of each other and can be done in any order.
