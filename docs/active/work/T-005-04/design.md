# Design: T-005-04 Streaming Animations

## Decision: Svelte Built-in Transitions + Tailwind Utilities

Use Svelte's `transition:` / `in:` directives (`fade`, `slide`, `fly`) for element enter/exit animations, combined with Tailwind CSS classes for shimmer effects and pulse indicators. Handle `prefers-reduced-motion` via a shared reactive helper that zeroes transition durations.

## Options Evaluated

### Option A: Pure CSS Transitions (Tailwind + Custom Keyframes)

Add Tailwind `transition-*` classes and custom `@keyframes` in `app.css`. Toggle CSS classes reactively.

**Pros:** No framework coupling, works with any renderer, familiar to all CSS developers.
**Cons:** Verbose — requires tracking "just appeared" state for each field manually (e.g., a `wasNull` → `isNotNull` transition class). Svelte's `{#if}` blocks don't naturally trigger CSS class-based transitions because the element either exists or doesn't. Would need wrapper divs with `animate-in` classes and timeouts to clean up. Significant boilerplate.

**Rejected:** Too much manual state management for enter transitions. Svelte's built-in solution handles this natively.

### Option B: Svelte Transitions (CHOSEN)

Use `in:fade`, `in:fly`, `in:slide` on elements inside `{#if}` blocks. Svelte automatically triggers these when the element is created (condition becomes true). Configure `duration`, `delay`, and `easing` parameters.

**Pros:**
- Native Svelte feature, zero dependencies
- Triggers automatically on DOM insertion — perfect for streaming where `{#if field}` guards already exist
- Declarative, minimal code: just add `in:fade={{ duration: 200 }}` to existing elements
- Supports `delay` parameter for staggered grid animations
- Handles cleanup automatically (no orphaned animation classes)
- SSR-safe — transitions only run on client

**Cons:**
- Couples animations to Svelte framework (acceptable — entire frontend is Svelte)
- `prefers-reduced-motion` must be handled explicitly (we'll add a helper)
- Stagger delay for dynamic lists requires computing index-based delays

**Chosen because:** Direct alignment with existing codebase patterns. The `{#if streaming && !field}` guards are exactly where Svelte transitions hook in. Minimal code changes, maximum visual impact.

### Option C: Animation Library (e.g., Motion One / AutoAnimate)

Use a third-party animation library for more sophisticated animations.

**Pros:** Rich animation primitives, spring physics, layout animations.
**Cons:** New dependency, bundle size increase, learning curve, may conflict with Svelte's own transition system, overkill for the scope of this ticket.

**Rejected:** Over-engineered for fade-in and slide-in effects.

## Detailed Design

### 1. Reduced Motion Helper

Create a shared utility that detects `prefers-reduced-motion: reduce` and provides a reactive flag. All transition parameters will use this to conditionally set `duration: 0`.

**Location:** `frontend/src/lib/utils/motion.ts`

```typescript
export function getTransitionParams(base: { duration?: number; delay?: number; ... }) {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return reduced ? { ...base, duration: 0, delay: 0 } : base;
}
```

Simple function, not a store — called at transition time. This avoids reactivity overhead and works correctly because `matchMedia` is fast and the preference rarely changes mid-session.

### 2. PersonaCard Field Animations

**Current pattern:**
```svelte
{#if isStreaming && !persona.label}
  <div class="animate-pulse bg-gray-200 ..."></div>
{:else if persona.label}
  <h2>{persona.label}</h2>
{/if}
```

**New pattern:**
```svelte
{#if isStreaming && !persona.label}
  <div class="shimmer ..."></div>
{:else if persona.label}
  <h2 in:fade={motionParams(200)}>{persona.label}</h2>
{/if}
```

Each field gets `in:fade` or `in:fly={{ y: 10 }}` for a subtle upward slide-in. Array fields (goals, frustrations, influencers) use `in:fly` with index-based `delay` for stagger.

### 3. AnalysisPanel Section Reveals

Each section block gets `in:slide` for a vertical reveal effect. Sections are already guarded by `{#if analysis.fieldName}`, so the transition triggers naturally.

Order of appearance during streaming: implicitUser → assumptions → scopeLevel → solutionBias → tension → reframing. Each gets a slight delay offset to create a sequential feel even when multiple fields arrive in the same partial.

### 4. VariantGrid Staggered Entry

Cards are rendered in an `{#each}` block. Use `in:fly={{ y: 20, duration: 300, delay: index * 80 }}` on each VariantCard wrapper. The `index` from `{#each candidates as candidate, index}` provides natural stagger.

During expansion streaming, new variants appear in the partial as the array grows. Each new card entering the DOM triggers its fly-in animation automatically.

### 5. Shimmer Placeholders

Replace current `animate-pulse` (simple opacity pulse) with a shimmer effect — a gradient sweep from left to right. This is more visually polished and clearly communicates "loading."

**Implementation:** Custom keyframe in `app.css`:
```css
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
.shimmer {
  background: linear-gradient(90deg, #e5e7eb 25%, #f3f4f6 50%, #e5e7eb 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
}
```

A `.shimmer` utility class applied to placeholder elements. Respects `prefers-reduced-motion` via a media query override that disables the animation.

### 6. Streaming Indicator

A small pill/badge component shown near the active section header while streaming is in progress. Uses a pulsing dot animation.

**Implementation:** Inline in each component that streams, not a separate component. Pattern:
```svelte
{#if isStreaming}
  <span class="streaming-indicator">
    <span class="animate-pulse inline-block w-2 h-2 rounded-full bg-blue-500"></span>
    Streaming...
  </span>
{/if}
```

This is small enough to inline without a separate component.

### 7. prefers-reduced-motion Strategy

Two layers:
1. **CSS level:** Media query disabling shimmer animation
   ```css
   @media (prefers-reduced-motion: reduce) {
     .shimmer { animation: none; }
   }
   ```
2. **Svelte transition level:** The `getTransitionParams()` helper zeros duration/delay

This ensures both CSS animations and Svelte transitions respect the user preference.

## Animation Timing Budget

| Animation | Duration | Delay | Easing |
|---|---|---|---|
| Field fade-in | 200ms | 0 | ease-out |
| Field fly-in (y: 10) | 250ms | 0 | ease-out |
| Array item stagger | 250ms | index * 60ms | ease-out |
| Analysis section slide | 300ms | 0 | ease-out |
| Variant card fly-in | 300ms | index * 80ms | ease-out |
| Shimmer cycle | 1500ms | 0 | ease-in-out (infinite) |
| Streaming dot pulse | Built-in animate-pulse | 0 | — |

All durations are short enough (< 400ms) that Playwright's auto-wait (default timeout 5000ms) will not be affected.

## Test Impact

- Existing Playwright tests should pass without modification — animations complete well within auto-wait timeouts
- Svelte transitions on elements inside `{#if}` blocks don't change DOM structure, just add intro CSS
- If any test becomes flaky, we can add `* { animation-duration: 0s !important; transition-duration: 0s !important; }` to test CSS, but this is unlikely needed

## Files Changed

| File | Change Type | Scope |
|---|---|---|
| `lib/utils/motion.ts` | New | ~15 lines, reduced-motion helper |
| `app.css` | Modified | ~20 lines, shimmer keyframe + reduced-motion override |
| `PersonaCard.svelte` | Modified | Add `in:fade`/`in:fly` to field elements, shimmer class |
| `AnalysisPanel.svelte` | Modified | Add `in:slide`/`in:fade` to sections, shimmer class |
| `VariantGrid.svelte` | Modified | Add stagger delay to card wrappers |
| `VariantCard.svelte` | Modified | Add `in:fly` enter animation |
| `workshop/+page.svelte` | Modified | Add streaming indicator near section headers |
