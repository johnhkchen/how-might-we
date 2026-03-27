# Research — T-006-01: fix-streaming-partial-dedup

## Bug Summary

The expand and refine stages produce hundreds of duplicate variant cards instead of the expected 6-8. Root cause: BAML streams progressively-building partial objects where each SSE event contains the **full array so far** with partially-complete entries. The frontend treats each growing `statement` string as unique, adding a new candidate per streaming update.

## Streaming Data Flow

### Backend (handlers.go)

All four endpoints (`/api/persona`, `/api/analyze`, `/api/expand`, `/api/refine`) use `streamSSE()` to emit SSE events. Each event is `data: <json>\n\n` containing the **entire current state** of the progressively-built BAML response object. The stream ends with `data: [DONE]`.

For expand, the response type is `HMWExpansion { variants: HMWVariant[], emergentTheme?: string }`.
For refine, the response type is `HMWRefinement { newVariants: HMWVariant[], tensions: string[], recommendation?: string, suggestedNextMove?: string }`.

### SSE Client (frontend/src/lib/api/stream.ts)

`streamFromAPI<T>()` reads the SSE stream and calls `onPartial(parsed)` for every `data:` line. It does not perform any deduplication or diff logic — it passes the full parsed object directly to the callback.

### Mock Fixtures (tests/fixtures/expansion.ts, refinement.ts)

The mock fixtures model BAML's actual streaming behavior accurately:
- **Expansion**: 4 partials — arrays of length [1, 2, 3, 6]. Each partial contains ALL prior variants plus new ones. Variants appear fully-formed (with `moveType`) in the mocks.
- **Refinement**: 3 partials — newVariants arrays of length [1, 3, 3]. Same pattern.

**Critical difference from real BAML**: Mock fixtures emit variants that are already complete (all fields populated). Real BAML emits partially-built objects where `statement` grows token-by-token and `moveType` appears only when the object is fully formed.

## The Bug — Current Workshop Page Logic

### expandHMW() (workshop/+page.svelte, lines 153-198)

```typescript
let lastVariantCount = 0;
// ...
(partial) => {
    if (partial.variants && partial.variants.length > lastVariantCount) {
        for (let i = lastVariantCount; i < partial.variants.length; i++) {
            const v = partial.variants[i];
            if (v.moveType && v.statement && !localSeen.has(v.statement)) {
                localSeen.add(v.statement);
                session.addCandidates([v], 0);
            }
        }
        const completeCount = partial.variants.filter((v) => v.moveType).length;
        lastVariantCount = completeCount;
    }
}
```

**Bug mechanics with real BAML streaming:**

1. Partial 1: `variants = [{ statement: "How", moveType: undefined }]` — length 1 > lastVariantCount(0). Index 0 checked: no moveType, skipped. `completeCount = 0`, so `lastVariantCount` stays 0.

2. Partial 2: `variants = [{ statement: "How might", moveType: undefined }]` — length 1 > lastVariantCount(0). Index 0 checked AGAIN: no moveType, skipped. Same state.

3. Partial N: `variants = [{ statement: "How might we help...", moveType: "narrowed" }]` — length 1 > lastVariantCount(0). Index 0 now has moveType. `localSeen` doesn't have this statement → added. `completeCount = 1`, `lastVariantCount = 1`.

4. Partial N+1: `variants = [{ complete_variant_0 }, { statement: "How", moveType: undefined }]` — length 2 > lastVariantCount(1). Index 1 checked: no moveType, skipped. `completeCount = 1`, **lastVariantCount stays 1**.

5. Partial N+2: `variants = [{ complete_variant_0 }, { statement: "How might", moveType: undefined }]` — length 2 > lastVariantCount(1). Index 1 checked AGAIN: no moveType, skipped.

**So far this looks correct!** The `moveType` guard prevents partial additions. But the real issue is subtler:

6. Partial M: `variants = [{ complete_variant_0 }, { statement: "How might we make...", moveType: "shifted_user" }]` — Index 1 has moveType. Statement is "How might we make..." (full text). Added to localSeen and candidates. `completeCount = 2`, `lastVariantCount = 2`. **This is correct.**

**BUT**: Consider what happens if BAML emits the `moveType` before the `statement` is fully built (possible with JSON streaming), or if the statement appears in earlier partials with a slightly different form. The `localSeen` set uses exact string matching, so any difference in the statement means a duplicate card.

**The actual duplication path**: When BAML streams the last variant in the array, the `statement` field grows token by token. Once `moveType` appears (it can appear before the full statement is complete, since BAML streams JSON fields as they appear), the variant passes both guards (`v.moveType && v.statement`). Each subsequent partial with a longer `statement` for that same index will also pass both guards, and since the statement is different each time, `localSeen` won't catch it.

**Even more critically**: `lastVariantCount` is set to `completeCount` (number of variants with moveType). Once index i's variant has moveType, `completeCount` advances, and index i won't be re-examined. BUT: there's a window where moveType appears on an incomplete statement at index i, the candidate is added, then the loop re-checks index i on the next partial (since lastVariantCount hasn't advanced yet in the same callback cycle) — no, `lastVariantCount` is updated at the end of each callback.

**Let me re-examine more carefully.** The real issue: `lastVariantCount` is set to `completeCount` at the end of each callback. If index i gets `moveType` when statement is incomplete, it's added. Next callback, `completeCount` includes index i, so `lastVariantCount` advances past i. The statement at index i in later partials is longer but index i is no longer checked. So the bug is: **one card per variant, but with an incomplete statement**.

**Wait — re-reading the ticket**: "The frontend treats each partial `statement` string as unique (since it grows token by token), adding a new candidate for every streaming update." This implies the old code (before the current fix attempt) had no `moveType` or index tracking. Let me check git history.

## Key Insight

The current code in `+page.svelte` **already contains a fix attempt** (using `moveType` guard and `lastVariantCount`/`completeCount` tracking). But this fix has a flaw: **`lastVariantCount` only advances when complete variants are counted, but the `for` loop starts from `lastVariantCount` each time**. This means:

- When the array has 2 items but only 1 is complete, `lastVariantCount = 1`.
- Next partial still has 2 items. `2 > 1` is true. Loop checks index 1. If moveType now present with a partial statement, it gets added.
- But `completeCount` now = 2, so `lastVariantCount = 2`. Index 1 won't be rechecked.
- **Net effect**: each variant gets added exactly once, but possibly with an incomplete statement.

The **actual bug** is more likely that `moveType` can be streamed as one of the first fields in the BAML JSON before `statement` and `rationale` are complete. BAML streams JSON fields in declaration order from `types.baml`:

```
class HMWVariant {
    statement string
    moveType MoveType
    rationale string
}
```

Since `statement` comes before `moveType`, the statement should be complete (or nearly so) before `moveType` appears. But BAML's streaming is token-level within fields too — `moveType` is a short enum value that arrives in one token, while `statement` may still be building.

## Session Store (session.svelte.ts)

`addCandidates(variants, iteration)` creates new `HMWCandidate` objects with `crypto.randomUUID()` IDs and appends them. There is no dedup — if called multiple times with the same variant, multiple candidates are created.

## Mock vs Real Behavior

The mock fixtures emit variants that jump from incomplete arrays to complete arrays (e.g., 1 variant → 2 variants → 3 variants → 6 variants). Each variant in each partial is fully formed. This means the mock path exercises the "add on first complete appearance" path correctly.

Real BAML streaming emits many more intermediate partials where a variant at index N is partially built across many events before completion. The existing code may work with mocks but fail with real streaming.

## Affected Files

| File | Role | Relevant Section |
|------|------|-----------------|
| `frontend/src/routes/workshop/+page.svelte` | Bug site | `expandHMW()` lines 153-198, `refineHMW()` lines 200-262 |
| `frontend/src/lib/stores/session.svelte.ts` | State store | `addCandidates()` — no dedup |
| `frontend/src/lib/api/stream.ts` | SSE client | Passes all partials through |
| `frontend/tests/fixtures/expansion.ts` | Mock data | Only tests complete-variant partials |
| `frontend/tests/fixtures/refinement.ts` | Mock data | Same limitation |
| `backend/baml_src/types.baml` | Type defs | Field order determines stream order |

## Constraints

1. The backend is stateless — all dedup must happen in the frontend.
2. BAML streaming behavior (progressive JSON building) cannot be changed.
3. Mock fixtures must continue to work for dev and tests.
4. The `moveType` field IS the completeness signal per the ticket spec.
5. Two concurrent agents — this ticket is frontend-only.
