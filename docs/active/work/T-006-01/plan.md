# Plan — T-006-01: fix-streaming-partial-dedup

## Step 1: Rewrite variant processing in +page.svelte

### Actions
1. Add `processStreamingVariants()` helper function after the state declarations and before `refinePersona()`.
2. Rewrite `expandHMW()`:
   - Remove `const localSeen = new Set(seenStatements);` and `let lastVariantCount = 0;`.
   - Replace with `const committedIndices = new Set<number>();`.
   - Replace the streaming callback body's variant-processing block with a call to `processStreamingVariants(partial.variants, committedIndices, 0)`.
   - Remove `seenStatements = localSeen;` from the post-stream block.
3. Rewrite `refineHMW()`:
   - Remove `const localSeen = new Set(seenStatements);` and `let lastVariantCount = 0;`.
   - Replace with `const committedIndices = new Set<number>();`.
   - Replace the variant-processing block with `processStreamingVariants(partial.newVariants, committedIndices, currentIteration)`.
   - Remove `seenStatements = localSeen;` from the post-stream block.
4. Remove the module-level `let seenStatements = $state(new Set<string>());` declaration (line 65).

### Verification
- `npm run check` passes (TypeScript/Svelte).
- `npm run lint` passes.

## Step 2: Update test fixtures with intermediate partials

### Actions
1. **expansion.ts**: Insert partial-build SSE events before the first complete variant. These represent the token-by-token building of the first variant:
   - Partial with `{ variants: [{ statement: "How might we help junior designers identify when an HMW question" }] }` — no `moveType`.
   - This should NOT result in a committed variant, proving the gate works.
2. **refinement.ts**: Same pattern — insert an intermediate partial with a variant missing `moveType`.

### Verification
- Fixture shape checks in `streaming.spec.ts` may need count updates if they assert specific partial counts.

## Step 3: Run Playwright tests

### Actions
1. Run `cd frontend && npx playwright test` to execute all E2E tests.
2. Verify:
   - Expand stage produces exactly 6 variants (from mock data).
   - Refine stage produces exactly 3 new variants.
   - No duplicate candidates.
   - All variant interactions (select, skip, clip, edit) still work.

### Fix any failures
- If fixture count assertions break in `streaming.spec.ts`, update them to account for new intermediate partials.
- If variant count assertions change, investigate — the fix should produce the same number of final variants.

## Step 4: Build verification

### Actions
1. `cd frontend && npm run build` — production build succeeds.
2. `cd frontend && npm run check` — type checks pass.
3. `cd frontend && npm run lint` — lint passes.

## Testing Strategy

| What | How | Criteria |
|------|-----|----------|
| No duplicates from mocks | Playwright `workshop.spec.ts` | Expand produces exactly 6 cards, refine adds exactly 3 |
| Partial variants filtered | Updated fixtures with incomplete partials | Intermediate partials don't produce cards |
| Streaming UX | Playwright test sequence | Cards appear during streaming, not all at once at the end |
| Type safety | `npm run check` | No TypeScript errors |
| Lint | `npm run lint` | No ESLint errors |
| Build | `npm run build` | Production build succeeds |
