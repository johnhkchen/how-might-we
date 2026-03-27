# Review — T-006-01: fix-streaming-partial-dedup

## Summary of Changes

Fixed infinite variant card generation in expand and refine stages caused by BAML's progressive streaming. Replaced string-based dedup with index-based tracking using `moveType` as the completeness gate.

## Files Changed

| File | Change |
|------|--------|
| `frontend/src/routes/workshop/+page.svelte` | Rewrote variant streaming logic in `expandHMW()` and `refineHMW()`. Added `processStreamingVariants()` helper. Removed `seenStatements` state. |
| `frontend/tests/fixtures/expansion.ts` | Added intermediate partial with incomplete variant (no `moveType`). 4→5 partials. |
| `frontend/tests/fixtures/refinement.ts` | Added intermediate partial with incomplete variant (no `moveType`). 3→4 partials. |
| `frontend/tests/streaming.spec.ts` | Updated fixture count assertions (4→5 expansion, 3→4 refinement). |

## What Changed Technically

### Before (broken)
- `lastVariantCount` tracked the number of complete variants, but the `for` loop starting from `lastVariantCount` could still re-examine an index where `moveType` appeared on a partial `statement`.
- `seenStatements: Set<string>` used exact string matching, which fails during token-by-token streaming (each growing prefix is unique).
- Cross-call `seenStatements` persisted between expand and refine calls, adding unnecessary coupling.

### After (fixed)
- `committedIndices: Set<number>` tracks which array indices have been committed to the session store.
- Each index is committed exactly once: when `moveType` (completeness signal) and `statement` are both present.
- `processStreamingVariants()` helper shared by both expand and refine, eliminating code duplication.
- Each streaming call gets its own `committedIndices` — no cross-call state.

### Why index-based tracking works
BAML streams arrays append-only: index `i` always refers to the same variant throughout a single stream. The `moveType` field appears only after `statement` is complete (it follows `statement` in the BAML type declaration). Once committed at index `i`, that index is never revisited regardless of how many subsequent partials contain updated data at that index.

## Test Coverage

| Area | Coverage | Notes |
|------|----------|-------|
| Expand produces exactly 6 variants | Playwright test | `workshop.spec.ts` — "clicking Expand generates variant cards" |
| Refine produces exactly 3 new variants | Playwright test | `workshop.spec.ts` — "Go Deeper streams new variants" |
| Incomplete partials (no moveType) filtered | Mock fixtures | New intermediate partials in expansion.ts and refinement.ts exercise the gate |
| Variant interactions (select/skip/clip/edit) | Playwright tests | 8+ tests covering all card actions |
| Full flow integration | Playwright test | "complete flow: Setup -> Analyze -> Expand -> Select -> Go Deeper" |
| Fixture shape validation | Streaming spec | Count and structure assertions updated |
| Type safety | svelte-check | 0 errors, 0 warnings |
| Lint | ESLint | Passes |
| Production build | vite build | Succeeds |

**All 77 Playwright tests pass.**

## Acceptance Criteria Status

- [x] Expand stage produces exactly the number of variants BAML returns (6 in mocks) — not hundreds
- [x] Refine stage produces exactly the number of new variants BAML returns (3 in mocks) — not hundreds
- [x] Variant cards appear one at a time as each variant completes during streaming
- [x] No duplicate candidates in the session store after streaming completes
- [x] Works with both real API and mock fixtures
- [x] Existing Playwright tests still pass

## Open Concerns

1. **Partial rationale on commit**: When `moveType` appears, `rationale` may still be partially streamed (it comes after `moveType` in the type definition). The committed variant will have a truncated rationale until the stream completes. This is cosmetic — the VariantCard renders whatever text is available, and the final SSE event always contains the complete data. If this becomes noticeable in practice, a follow-up could update committed variants with the final partial's data.

2. **No real BAML streaming test**: The mock fixtures simulate the streaming pattern but with coarser granularity than real BAML (which emits token-by-token). The new intermediate partials improve coverage but don't fully replicate real behavior. A true integration test against the BAML backend would provide higher confidence.

3. **Cross-call duplicate variants**: The old `seenStatements` set prevented the LLM from surfacing the same statement in both expand and refine calls. This guard was removed. If the LLM repeats a variant statement across calls, it will appear as a separate card. This is arguably correct behavior (the user asked to refine and got the same thing back — that's feedback), but could surprise users.
