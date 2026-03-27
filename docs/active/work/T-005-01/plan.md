# Plan — T-005-01 export-panel

## Step 1: Implement ExportPanel Component

**File:** `frontend/src/lib/components/ExportPanel.svelte`

Replace the stub with the full component:

1. Define props: `clippedCandidates: HMWCandidate[]`, `problemContext: ProblemContext | null`
2. Define internal state: `activeFormat` (default `'text'`), `copied` (boolean)
3. Implement `generatePlainText()` — numbered list of `userEdits ?? variant.statement`
4. Implement `generateMarkdown()` — structured markdown with persona header, domain, constraints, then each HMW with move type and rationale
5. Implement `generateJSON()` — `JSON.stringify` of `HMWSession`-shaped object with clipped candidates, context, clippedIds
6. Derive `activeContent`, `fileExtension`, `mimeType` from `activeFormat`
7. Implement `copyToClipboard()` — `navigator.clipboard.writeText()`, set `copied = true`, reset after 2s
8. Implement `download()` — Blob + temporary anchor pattern
9. Build template: empty state, format tabs, preview area, action buttons
10. Add `data-testid` attributes to all interactive/assertable elements

**Verify:** `npm run check` passes with the new component.

## Step 2: Integrate into Workshop Page

**File:** `frontend/src/routes/workshop/+page.svelte`

1. Add import for ExportPanel
2. Inside `hasExpandStarted` block, after ClipBoard, add Stage 5 section:
   - Gated on `session.clippedCandidates.length > 0`
   - Renders `<ExportPanel>` with clippedCandidates and problemContext props
3. Add `data-testid="stage-5"` to the section

**Verify:** `npm run check` passes. Visually confirm the panel appears when items are clipped in mock mode.

## Step 3: Add Playwright Tests

**File:** `frontend/tests/workshop.spec.ts`

Add new test group `ExportPanel` with these tests:

1. Export panel not visible when no items clipped
2. Export panel visible after clipping a variant
3. Default format is plain text, preview contains numbered HMW statement
4. Switching to markdown format shows persona label and domain
5. Switching to JSON format shows valid parseable JSON
6. Copy and download buttons are present
7. Export panel hides when last item unclipped

Helper needed: a function that completes stages 1-3 and clips at least one variant (extend existing test helpers or inline).

**Verify:** `npx playwright test` — all tests pass (existing 70 + new tests).

## Step 4: Final Verification

1. `npm run check` — 0 errors
2. `npm run lint` — clean
3. `npx playwright test` — all pass
4. Confirm acceptance criteria are met:
   - ExportPanel shows clipped HMWs with export format selector
   - Plain text: numbered list
   - Markdown: persona summary, domain, each HMW with move type and rationale
   - JSON: full structured export matching HMWSession type
   - Copy-to-clipboard button for each format
   - Download button generates file
   - Empty state when no HMWs clipped

## Testing Strategy

- **E2E tests (Playwright)**: Test the full integration — clip a variant, verify export panel appears, switch formats, verify content. This covers the user-facing acceptance criteria.
- **No unit tests needed**: The component is pure presentation with simple string formatting. The Playwright tests cover the behavior at the user level. No complex logic warrants isolated unit testing.
- **Clipboard/download**: Test that buttons exist and have correct labels. Actual clipboard write and file download are browser API side effects that are difficult to test without fragile mocking; the logic is trivial (2-3 lines each).

## Commit Plan

Single commit after all steps complete — the change is small and cohesive (one component + integration + tests).
