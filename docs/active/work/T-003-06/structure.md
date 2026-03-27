# Structure — T-003-06: variant-grid-clipboard-components

## Files Modified

### 1. `frontend/src/lib/components/VariantCard.svelte` (rewrite stub)

**Props:**
- `candidate: HMWCandidate` — the candidate to display
- `onStatusChange: (id: string, status: CandidateStatus, userEdits?: string) => void` — callback for action buttons

**Internal state:**
- `isEditing: boolean` — inline edit mode toggle
- `editText: string` — textarea value during editing

**Sections:**
- Move type badge (color-coded pill, top-left)
- HMW statement (main text, or textarea in edit mode)
- Rationale (smaller text below)
- Action buttons (contextual based on candidate status)

**Status-based rendering:**
- `generated`: Show select, skip, edit, clip buttons. Normal styling.
- `selected`: Highlighted border (blue). Show clip, skip, edit buttons.
- `edited`: Highlighted border (blue). Show edited text with indicator. Show clip, skip buttons.
- `skipped`: Grayed out (opacity-50). Show undo button.
- `clipped`: Green border/check indicator. Show unclip button.

### 2. `frontend/src/lib/components/VariantGrid.svelte` (rewrite stub)

**Props:**
- `candidates: HMWCandidate[]` — all candidates to display
- `onStatusChange: (id: string, status: CandidateStatus, userEdits?: string) => void` — passed through to VariantCards
- `isStreaming?: boolean` — whether new cards are currently streaming in

**Layout:**
- Responsive grid: `grid-cols-1 lg:grid-cols-2 gap-4`
- Cards rendered via `{#each candidates as candidate (candidate.id)}`
- Streaming placeholder pulse animation when `isStreaming` is true and there are no candidates yet

**Keyed each block** uses `candidate.id` for stable DOM updates during streaming.

### 3. `frontend/src/lib/components/ClipBoard.svelte` (rewrite stub)

**Props:**
- `clippedCandidates: HMWCandidate[]` — already filtered to clipped status
- `onRemove: (id: string) => void` — callback to unclip

**Sections:**
- Header: "Clipped HMWs" + count badge
- List of clipped items, each showing:
  - HMW statement (user-edited text if available, else variant statement)
  - Move type badge
  - Remove (unclip) button
- Empty state message when count is 0

### 4. `frontend/src/routes/workshop/+page.svelte` (modify)

**Add Stage 3 section** after Stage 2:
- Visibility gated on `isAnalysisComplete`
- "Expand" button triggers `expandHMW()` async function
- `expandHMW()` calls `streamFromAPI('/api/expand', ...)`, diffs incoming variants, calls `session.addCandidates()`
- Renders `<VariantGrid>` with candidates
- Renders `<ClipBoard>` with clipped candidates

**Add Stage 4 section** (inline with Stage 3):
- "Go Deeper" button gated on having at least one selected/edited candidate
- Triggers `refineHMW()` async function
- `refineHMW()` calls `streamFromAPI('/api/refine', ...)`, diffs incoming newVariants, calls `session.addCandidates()`
- Shows tensions and recommendation from refinement response

**New local state in workshop page:**
- `isExpanding: boolean` — tracks expand streaming state
- `expandError: string | null`
- `streamingExpansion: Partial<HMWExpansion>` — latest expansion partial
- `hasExpandStarted: boolean`
- `isRefining: boolean` — tracks refine streaming state
- `refineError: string | null`
- `streamingRefinement: Partial<HMWRefinement>` — latest refinement partial
- `seenStatements: Set<string>` — dedup set for streaming variants

**New derived state:**
- `isExpandComplete` — analysis exists and not expanding
- `hasActionedCandidates` — at least one candidate is selected or edited
- `displayExpansion` — session or streaming expansion data

**New imports:** VariantGrid, ClipBoard, and relevant types.

### 5. `frontend/tests/workshop.spec.ts` (modify)

**Add test helpers:**
- `completeStage2(page)` — runs completeStage1 + mocks analyze + clicks Analyze

**Add test groups:**
- Stage 3 visibility gating (hidden until analysis complete, visible after)
- Stage 3 expand streaming (mock /api/expand, click Expand, verify VariantCards appear)
- VariantCard actions (select, skip, edit, clip — verify status changes)
- VariantCard move type badges (verify color classes)
- ClipBoard (clip a candidate, verify it appears in ClipBoard, verify count badge)
- ClipBoard remove (unclip, verify removed from ClipBoard)
- Stage 4 "Go Deeper" gating (hidden until candidate selected)

## Files NOT Modified

- `session.svelte.ts` — store already has all needed methods
- `lib/api/stream.ts` — streaming utility unchanged
- `lib/api/mock.ts` — mock already handles `/api/expand` and `/api/refine`
- `tests/fixtures/*` — fixtures already complete
- `ExportPanel.svelte` — separate ticket
- Any backend files

## Component Dependency Graph

```
workshop/+page.svelte
  ├── PersonaCard.svelte
  ├── ConstraintList.svelte
  ├── AnalysisPanel.svelte
  ├── VariantGrid.svelte
  │     └── VariantCard.svelte (×N)
  └── ClipBoard.svelte
```

## Public Interface Summary

```typescript
// VariantCard
{ candidate: HMWCandidate, onStatusChange: (id, status, userEdits?) => void }

// VariantGrid
{ candidates: HMWCandidate[], onStatusChange: (id, status, userEdits?) => void, isStreaming?: boolean }

// ClipBoard
{ clippedCandidates: HMWCandidate[], onRemove: (id: string) => void }
```
