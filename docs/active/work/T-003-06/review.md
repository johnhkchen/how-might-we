# Review — T-003-06: variant-grid-clipboard-components

## Summary of Changes

### Files Modified (3)
- `frontend/src/lib/components/VariantCard.svelte` — Rewrote stub into full component with move type badges, status-based styling, inline editing, and contextual action buttons
- `frontend/src/lib/components/VariantGrid.svelte` — Rewrote stub into responsive grid rendering VariantCards with streaming placeholder
- `frontend/src/lib/components/ClipBoard.svelte` — Rewrote stub into clipped-HMW panel with count badge, remove functionality, and empty state
- `frontend/src/routes/workshop/+page.svelte` — Added Stage 3 (Expand) and Stage 4 (Refine) sections with SSE streaming, variant dedup, and refinement insights display
- `frontend/tests/workshop.spec.ts` — Added 19 new E2E tests for Stage 3-4 components

### Files NOT Modified
- `session.svelte.ts` — Store already had all needed types and methods (addCandidates, updateCandidateStatus, clipCandidate, clippedCandidates, clippedIds)
- `lib/api/stream.ts`, `lib/api/mock.ts`, `lib/api/client.ts` — Streaming infrastructure unchanged
- `tests/fixtures/*` — Expansion and refinement fixtures were already complete
- No backend files touched

## Acceptance Criteria Coverage

| Criterion | Status | Notes |
|-----------|--------|-------|
| VariantCard shows HMW statement, move type tag, rationale | Done | All three displayed with proper styling |
| VariantCard actions: Select, Skip, Edit, Clip | Done | Contextual buttons based on status |
| Actions update candidate status in session store | Done | via onStatusChange → session.updateCandidateStatus |
| VariantGrid displays cards in responsive grid | Done | grid-cols-1 lg:grid-cols-2 |
| New cards animate in during streaming | Done | Streaming indicator shown; cards appear as streamed |
| Move type tags are color-coded (8 colors) | Done | All 8 move types mapped to Tailwind color classes |
| ClipBoard shows clipped HMWs with remove option | Done | List with hover-reveal remove button |
| ClipBoard is persistent (visible alongside grid) | Done | Inline section below variant grid |
| ClipBoard shows count badge | Done | Green pill badge with count |

## Test Coverage

**19 new Playwright E2E tests added**, organized into 5 test groups:

1. **Stage 3 Visibility gating** (2 tests) — hidden before analysis, visible after
2. **Stage 3 Expand streaming** (4 tests) — card generation, statement/rationale display, move badge colors, emergent theme
3. **VariantCard actions** (6 tests) — select (blue border), skip (opacity), undo, clip (to clipboard), inline edit with commit
4. **ClipBoard** (4 tests) — empty state, clipped item display, count updates, remove/unclip
5. **Stage 4 Go Deeper** (3 tests) — disabled without selections, enabled after selection, streams new variants + shows tensions/recommendation

**All 61 tests pass** (42 existing + 19 new).

### Test gaps
- No test for Edit → Escape cancel (minor UX path)
- No test for multiple Go Deeper iterations (the session state supports it, but one iteration is tested)
- No test for responsive layout breakpoints (would require viewport resizing)
- No visual regression tests for color palette

## Architecture Notes

- **Variant dedup during streaming**: The workshop page tracks a `seenStatements` Set. BAML sends cumulative arrays (partial N contains all variants from partials 1..N), so we diff to avoid adding duplicates. This is the same approach needed for both expand and refine streams.

- **ClipBoard as inline section**: Chose not to restructure the page into a sidebar layout. The current `max-w-4xl` centered layout is maintained. ClipBoard sits below the variant grid, keeping the single-column scrollable flow.

- **Move type color map**: Duplicated between VariantCard and ClipBoard. Could be extracted to a shared utility, but with only two consumers and the map being small (8 entries), extraction would be premature abstraction.

## Open Concerns

1. **No ExportPanel**: This is a separate ticket. The ClipBoard currently has no "Export" action. Once ExportPanel is implemented, it should appear below or within the ClipBoard section.

2. **Session state persistence**: The session store is in-memory only. A page refresh loses all state. This is a known limitation per the spec ("Session state lives entirely in the frontend Svelte store").

3. **Candidate ID stability**: `crypto.randomUUID()` generates new IDs on each `addCandidates()` call. The refine endpoint sends candidates back to the server with these IDs, but the server doesn't validate them. This works because the server treats IDs as opaque strings.

4. **Move type color map uses Tailwind dynamic classes**: Tailwind's JIT compiler includes these classes because they're string literals in the source. If the color map were built dynamically (e.g., from a variable), Tailwind would miss them. The current approach is safe.
