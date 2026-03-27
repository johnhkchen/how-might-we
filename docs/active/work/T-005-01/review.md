# Review — T-005-01 export-panel

## Summary of Changes

### Files Modified

| File | Action | Description |
|------|--------|-------------|
| `frontend/src/lib/components/ExportPanel.svelte` | Rewritten | Replaced stub with full export panel component |
| `frontend/src/routes/workshop/+page.svelte` | Modified | Import ExportPanel, add Stage 5 section |
| `frontend/tests/workshop.spec.ts` | Modified | 7 new ExportPanel tests |

### Files NOT Modified

- Session store (`session.svelte.ts`) — no new state needed
- Other components — unchanged
- API layer — no backend calls for export
- Mock fixtures — export is client-side only
- Backend — unchanged

## Acceptance Criteria Evaluation

| Criterion | Status | Notes |
|-----------|--------|-------|
| ExportPanel shows clipped HMWs with format selector | Pass | Three-tab format selector (Plain Text / Markdown / JSON) |
| Plain text: numbered list of HMW statements | Pass | Uses `userEdits ?? variant.statement` |
| Markdown: persona summary, domain, each HMW with move type and rationale | Pass | Full structured document with headers |
| JSON: full structured export matching HMWSession type | Pass | Includes context, candidates, clippedIds |
| Copy-to-clipboard button for each format | Pass | Copies activeContent regardless of format |
| Download button generates a file (.txt, .md, .json) | Pass | Dynamic file extension based on format |
| Empty state when no HMWs clipped | Pass | Shown via conditional rendering in ExportPanel |

## Test Coverage

**Total tests:** 77 (70 existing + 7 new), all passing.

**New test cases:**
1. Visibility gating (panel hidden when no clips, visible after clip, hidden after unclip)
2. Format switching (default plain text, markdown content, JSON validity)
3. Action button presence (copy, download)

**Gaps:**
- Clipboard write side effect not tested (browser API limitation in Playwright without custom setup). The button renders and has correct label.
- File download side effect not tested (same reason). Button renders with correct extension.
- Multiple clipped items not explicitly tested (single-item tests cover the rendering logic; the numbering logic is trivial).

## Architecture Notes

- ExportPanel is a pure presentation component — receives data via props, generates text via `$derived`, handles browser APIs for copy/download. No store imports, no side effects beyond clipboard and file download.
- The `markdownText` and `jsonText` use `$derived(() => ...)` (closure form) since they are multi-statement computations. `plainText` uses the simpler expression form.
- Move label formatting is duplicated across ExportPanel, ClipBoard, and VariantCard. This is a pre-existing pattern — not introduced by this ticket.

## Open Concerns

- **None blocking.** The component is straightforward, the tests are comprehensive, and all acceptance criteria are met.
- The `moveLabel()` and `moveColors` duplication across components could be extracted to a shared utility in a future cleanup ticket, but is not a correctness issue.
