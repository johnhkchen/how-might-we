# Progress — T-006-01: fix-streaming-partial-dedup

## Completed

### Step 1: Rewrite variant processing in +page.svelte
- Added `processStreamingVariants()` helper function using index-based tracking with `moveType` completion gate.
- Rewrote `expandHMW()` to use `committedIndices: Set<number>` instead of `lastVariantCount` + `localSeen`.
- Rewrote `refineHMW()` with the same pattern.
- Removed module-level `seenStatements` state variable.

### Step 2: Update test fixtures
- Added intermediate partial to `expansion.ts` with incomplete variant (no `moveType`) — now 5 partials.
- Added intermediate partial to `refinement.ts` with incomplete variant (no `moveType`) — now 4 partials.
- Updated count assertions in `streaming.spec.ts` (4→5 for expansion, 3→4 for refinement).

### Step 3: Verification
- `npm run check` — 0 errors, 0 warnings.
- `npm run lint` — passes.
- `npx playwright test` — all 77 tests pass.
- `npm run build` — production build succeeds.

## Deviations from Plan

None. Implementation followed the plan exactly.
