# Design — T-006-01: fix-streaming-partial-dedup

## Problem Restatement

BAML streams progressively-built JSON objects via SSE. Each event contains the full array with partially-complete entries. The frontend must:
1. Detect when a variant is **complete** (has `moveType`).
2. Add each variant **exactly once** to the session store.
3. Show variants appearing one-at-a-time during streaming.
4. Work identically with mock fixtures and real BAML streaming.

## Approach A: Index-Based Tracking with Completion Gate

**Mechanism**: Track a Set of indices that have already been committed to the store. For each partial, iterate ALL array indices. If index is not in the committed set AND the variant at that index has `moveType`, commit it and mark the index as committed.

**Pros**:
- Simple, deterministic. Index is the identity, not the statement text.
- No string comparison — immune to statement mutations during streaming.
- `moveType` is the single completeness gate per the ticket spec.
- A committed index is never revisited, guaranteeing exactly-once addition.

**Cons**:
- If BAML ever reorders array elements mid-stream, this breaks. (BAML does not do this — arrays are append-only during streaming.)
- The variant committed might have an incomplete `rationale` field if `rationale` comes after `moveType` in the JSON. Per `types.baml`, field order is `statement, moveType, rationale` — so `rationale` streams after `moveType`. The committed variant would have a partial `rationale`.

**Mitigation for partial rationale**: We can require all three fields (`statement`, `moveType`, `rationale`) to be truthy before committing. But `rationale` may still be partial (mid-token). Better: commit on `moveType` and update the variant at that index in subsequent partials until the next index starts building.

Actually, simpler: commit once moveType is present (statement is already complete since it precedes moveType). For rationale, it will be partially built but that's fine — the card renders progressively anyway. Or we can wait for the rationale to also be present and non-empty.

**Best variant**: Commit when `moveType` is present. Don't update after commit — the partial rationale is a minor cosmetic issue that resolves when streaming completes and the final partial has everything. The VariantCard already handles missing rationale gracefully.

## Approach B: Statement-Based Dedup with Stable Hash

**Mechanism**: Hash each variant's statement and use the hash as identity. Only add variants whose hash hasn't been seen.

**Pros**: Independent of array position.
**Cons**:
- Statement grows token-by-token. The hash changes every partial → duplicate detection fails for in-progress variants.
- Would need to wait for the "final" version of a statement, but there's no explicit "statement complete" signal.
- This is essentially what the current `localSeen` set does, and it has the exact bug we're fixing.

**Rejected**: Fundamentally incompatible with progressive streaming.

## Approach C: Two-Pass Strategy (Buffer + Commit)

**Mechanism**: During streaming, maintain a local buffer of variants mirroring the BAML array. On each partial, update the buffer. Only commit to the session store when streaming is fully complete (after `data: [DONE]`).

**Pros**:
- Guarantees final, complete variants.
- Zero duplication risk.

**Cons**:
- Variants don't appear one-at-a-time during streaming. They all pop in at once when the stream ends. This violates acceptance criterion: "Variant cards appear one at a time as each variant completes during streaming."

**Rejected**: Violates streaming UX requirement.

## Approach D: Index-Based + Progressive Update

**Mechanism**: Like Approach A, but after committing a variant at index i, continue updating it with later partials (to capture the complete rationale). This requires the session store to support updating a candidate by some tracking key.

**Pros**: Most complete data at all times.
**Cons**:
- Requires modifying the session store to support update-by-index or update-by-commit-key.
- Adds complexity. The VariantCard already handles partial data during streaming.
- Over-engineered for the actual problem.

**Rejected**: Unnecessary complexity.

## Decision: Approach A — Index-Based Tracking with Completion Gate

### Rationale

1. **Simplicity**: One Set of committed indices. One guard (`moveType` present). One commit per index. Zero string comparisons.
2. **Correctness**: BAML arrays are append-only during streaming. Index is a stable identity. `moveType` appearing means the variant's `statement` field is already complete (it precedes `moveType` in the BAML type definition).
3. **UX**: Variants appear one-at-a-time as each completes, satisfying the streaming UX requirement.
4. **Mock compatibility**: Mock fixtures emit complete variants — they'll pass the `moveType` gate immediately.

### Implementation Shape

Replace the current `lastVariantCount` + `seenStatements` approach with:

```typescript
const committedIndices = new Set<number>();
// ...
for (let i = 0; i < partial.variants.length; i++) {
    const v = partial.variants[i];
    if (!committedIndices.has(i) && v.moveType && v.statement) {
        committedIndices.add(i);
        session.addCandidates([v], iteration);
    }
}
```

This eliminates:
- `seenStatements` Set (string-based dedup)
- `lastVariantCount` variable
- `completeCount` calculation
- The window where an incomplete variant passes the guard

### What about the `seenStatements` shared between expand and refine?

Currently `seenStatements` persists across expand→refine to prevent re-adding a variant the LLM repeats. With index-based tracking, we lose this cross-call dedup. But:
- `expandHMW()` and `refineHMW()` hit different endpoints returning different response types (`variants` vs `newVariants`). The indices are independent per call.
- If the LLM returns a duplicate statement in a refine call, it should appear as a new card — the user chose to refine, and seeing the same statement again is valid feedback.
- If we still want cross-call statement dedup, we can keep a separate `seenStatements` set as a secondary guard. But the ticket's acceptance criteria don't mention cross-call dedup, and removing it simplifies the logic.

**Decision**: Remove `seenStatements`. Each streaming call gets its own `committedIndices`. If the LLM returns duplicates across calls, those are valid candidates.

### Extracting a Helper

Both `expandHMW()` and `refineHMW()` have identical variant-processing logic (the only difference is the field name: `variants` vs `newVariants`). Extract a helper function to eliminate duplication:

```typescript
function processStreamingVariants(
    variants: HMWVariant[] | undefined,
    committedIndices: Set<number>,
    iteration: number
): void {
    if (!variants) return;
    for (let i = 0; i < variants.length; i++) {
        const v = variants[i];
        if (!committedIndices.has(i) && v.moveType && v.statement) {
            committedIndices.add(i);
            session.addCandidates([v], iteration);
        }
    }
}
```

This helper is local to the workshop page — not a new file.

### Test Fixtures

The existing mock fixtures already model the correct behavior (each partial has complete variants). They'll work without changes. The fix ensures the real BAML streaming path — with many more intermediate partials containing incomplete variants — also works correctly.

To make fixtures more realistic (and test the fix), we should add intermediate partials where variants lack `moveType` (simulating token-by-token building). This would exercise the `moveType` gate in tests.
