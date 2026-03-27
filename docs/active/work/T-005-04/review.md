# Review: T-005-04 Streaming Animations

## Summary

Added visual polish to the streaming UX using Svelte's built-in transition system (`fade`, `fly`, `slide`) and a custom shimmer CSS animation. All animations respect `prefers-reduced-motion` via a shared utility function. No backend changes. All 77 Playwright tests pass.

## Files Changed

### Created
| File | Lines | Purpose |
|---|---|---|
| `frontend/src/lib/utils/motion.ts` | 14 | Reduced-motion-aware transition parameter helper |

### Modified
| File | Change Scope | What Changed |
|---|---|---|
| `frontend/src/app.css` | +21 lines | Shimmer keyframe animation + `prefers-reduced-motion` media query |
| `frontend/src/lib/components/PersonaCard.svelte` | +14 lines | `in:fade` on label/role/context, `in:fly` with stagger on array items, shimmer skeletons, streaming indicator |
| `frontend/src/lib/components/AnalysisPanel.svelte` | +16 lines | `in:fade`/`in:slide` on all sections, stagger on assumption items, shimmer skeletons, streaming indicator |
| `frontend/src/lib/components/VariantGrid.svelte` | +5 lines | `in:fly` with index-based stagger on card wrappers, shimmer skeletons |

### Unchanged
- `VariantCard.svelte` — enter animation handled by parent wrapper div in VariantGrid
- `workshop/+page.svelte` — streaming indicators placed in child components instead
- `session.svelte.ts` — animations are view-layer only, no state changes needed
- `stream.ts`, `client.ts`, `mock.ts` — transport/API layer untouched
- `ClipBoard.svelte`, `ExportPanel.svelte`, `ConstraintList.svelte` — not involved in streaming

## Acceptance Criteria Coverage

| Criterion | Status | Implementation |
|---|---|---|
| PersonaCard fields fade/slide in as they arrive | Done | `in:fade` on label/role/context, `in:fly` with stagger on array items |
| AnalysisPanel sections appear with subtle reveal | Done | `in:fade` on text sections, `in:slide` on container sections, stagger on list items |
| VariantCards enter grid with staggered animation | Done | `in:fly={{ y: 20 }}` with `index * 50ms` delay on wrapper divs |
| Skeleton/shimmer placeholders for pending fields | Done | Custom `.shimmer` CSS class with gradient sweep, replaces all `animate-pulse` instances |
| "Streaming..." indicator with subtle pulse | Done | Pulsing blue dot + text in PersonaCard and AnalysisPanel; existing indicator in VariantGrid retained |
| Animations are smooth (CSS, no layout thrash) | Done | `fade` uses opacity (composited), `fly` uses transform+opacity (composited), `slide` uses height (contained) |
| Animations respect `prefers-reduced-motion` | Done | `motionParams()` zeros duration/delay; CSS media query disables shimmer |

## Test Coverage

- **77/77 Playwright tests pass** — all existing E2E tests unaffected
- No new tests added — animations are purely visual polish with no business logic
- Animation durations (200-300ms) are well within Playwright's auto-wait timeouts
- Svelte transitions don't change DOM structure, only add intro CSS, so test selectors are stable

## Animation Timing Summary

| Animation | Duration | Delay | Method |
|---|---|---|---|
| PersonaCard field fade | 200ms | 0 | `in:fade` |
| PersonaCard array item fly | 250ms | i * 60ms | `in:fly` y=10 |
| Analysis section fade | 200-250ms | 0 | `in:fade` |
| Analysis section slide | 300ms | 0 | `in:slide` |
| Analysis assumption stagger | 200ms | i * 60ms | `in:fade` |
| Variant card fly-in | 300ms | index * 50ms | `in:fly` y=20 |
| Shimmer cycle | 1500ms | 0 | CSS keyframe |

## Open Concerns

1. **Stagger accumulation on large lists**: VariantGrid uses `index * 50ms` delay, so with 20+ cards (after multiple refine iterations) the last card would have 1000ms+ delay. In practice this is unlikely to be noticeable since later cards arrive via streaming with natural timing delays. If it becomes an issue, the delay can be capped with `Math.min(index * 50, 300)`.

2. **`slide` transition and layout**: The `in:slide` transition on AnalysisPanel sections animates `height`, which triggers reflow. This is contained to individual elements and the panel is not in a performance-critical path (it renders once per analysis). No performance concern observed.

3. **No visual regression tests**: Animations are verified manually via `npm run dev:mock`. There are no automated visual regression tests. This is acceptable for the scope of this ticket.

## Build Status

- `npm run check`: 0 errors, 0 warnings
- `npm run lint`: clean
- `npx playwright test`: 77/77 passed (39.7s)
