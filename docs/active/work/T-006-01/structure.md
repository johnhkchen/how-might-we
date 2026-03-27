# Structure — T-006-01: fix-streaming-partial-dedup

## Files Modified

### 1. `frontend/src/routes/workshop/+page.svelte`

**Changes**:
- Remove module-level `seenStatements` state variable (line 65).
- Add a local `processStreamingVariants()` function that both `expandHMW()` and `refineHMW()` use.
- Rewrite `expandHMW()` streaming callback:
  - Replace `lastVariantCount` + `localSeen` with `committedIndices: Set<number>`.
  - Use `processStreamingVariants(partial.variants, committedIndices, 0)`.
- Rewrite `refineHMW()` streaming callback:
  - Replace `lastVariantCount` + `localSeen` with `committedIndices: Set<number>`.
  - Use `processStreamingVariants(partial.newVariants, committedIndices, currentIteration)`.
- Remove assignment of `seenStatements = localSeen` in both functions' post-stream blocks.

**Interface unchanged**: No changes to component props, event handlers, or template.

### 2. `frontend/tests/fixtures/expansion.ts`

**Changes**:
- Add intermediate partials that simulate real BAML streaming behavior:
  - Partial with variant at index 0 having `statement` but no `moveType` (incomplete).
  - This exercises the `moveType` gate and proves partial variants are not committed.
- Keep existing final partials unchanged so the complete-variant path still works.

### 3. `frontend/tests/fixtures/refinement.ts`

**Changes**:
- Same pattern as expansion: add intermediate partials with incomplete variants (no `moveType`).
- Keep existing final partials unchanged.

## Files NOT Modified

| File | Reason |
|------|--------|
| `frontend/src/lib/api/stream.ts` | SSE client is correct — it passes all partials through. Dedup is not its job. |
| `frontend/src/lib/stores/session.svelte.ts` | `addCandidates()` is called correctly once per completed variant. No store changes needed. |
| `frontend/src/lib/components/VariantGrid.svelte` | Rendering is correct. Bug is in data flow, not display. |
| `frontend/src/lib/components/VariantCard.svelte` | Same — no display bugs. |
| `backend/handlers.go` | Backend is stateless and correct. Bug is frontend-only. |

## New Code Shape

### processStreamingVariants (local to +page.svelte)

```
function processStreamingVariants(
    variants: HMWVariant[] | undefined,
    committedIndices: Set<number>,
    iteration: number
): void
```

- Iterates all indices in the `variants` array.
- Skips indices already in `committedIndices`.
- Skips variants without `moveType` or `statement`.
- For passing variants: adds index to `committedIndices`, calls `session.addCandidates([v], iteration)`.

### expandHMW() callback shape

```
const committedIndices = new Set<number>();
await streamFromAPI<HMWExpansion>('/api/expand', payload, (partial) => {
    if (partial.emergentTheme) emergentTheme = partial.emergentTheme;
    processStreamingVariants(partial.variants, committedIndices, 0);
});
```

### refineHMW() callback shape

```
const committedIndices = new Set<number>();
await streamFromAPI<HMWRefinement>('/api/refine', payload, (partial) => {
    if (partial.tensions) refinementTensions = partial.tensions;
    if (partial.recommendation) refinementRecommendation = partial.recommendation;
    if (partial.suggestedNextMove) refinementSuggestedNext = partial.suggestedNextMove;
    processStreamingVariants(partial.newVariants, committedIndices, currentIteration);
});
```

## Ordering of Changes

1. Add `processStreamingVariants()` function.
2. Update `expandHMW()` to use it and remove old tracking variables.
3. Update `refineHMW()` to use it and remove old tracking variables.
4. Remove `seenStatements` module-level state.
5. Update test fixtures with intermediate partials.
6. Run `npm run check`, `npm run lint`, and Playwright tests.

## Risk Assessment

- **Low risk**: Changes are isolated to one page component and test fixtures. No store, API, or component changes.
- **No new files**: Helper is local to the page module, not extracted to a utility.
- **Backward compatible**: Mock fixtures gain new partials but retain existing ones, so tests that check final output are unaffected.
