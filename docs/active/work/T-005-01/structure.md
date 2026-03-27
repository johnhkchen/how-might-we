# Structure — T-005-01 export-panel

## Files Modified

### 1. `frontend/src/lib/components/ExportPanel.svelte` (rewrite)

Replace the stub with the full component.

**Props interface:**
```typescript
{
  clippedCandidates: HMWCandidate[];
  problemContext: ProblemContext | null;
}
```

**Internal state:**
- `activeFormat`: `'text' | 'markdown' | 'json'` — default `'text'`
- `copied`: `boolean` — transient feedback flag, resets after 2s

**Derived values (via `$derived`):**
- `plainText`: string — numbered list of statements
- `markdownText`: string — structured markdown with persona/domain/HMWs
- `jsonText`: string — JSON.stringify of HMWSession-shaped object
- `activeContent`: string — switches on `activeFormat`
- `fileExtension`: string — `.txt`, `.md`, or `.json`
- `mimeType`: string — for blob creation

**Functions:**
- `copyToClipboard()`: async, writes `activeContent` to clipboard, sets `copied = true`, setTimeout to reset
- `download()`: creates Blob, triggers download via temporary anchor element

**Template structure:**
```
<section data-testid="export-panel">
  <!-- Empty state (when clippedCandidates.length === 0) -->

  <!-- Format tabs -->
  <div> <!-- tab bar -->
    <button data-testid="format-text">Plain Text</button>
    <button data-testid="format-markdown">Markdown</button>
    <button data-testid="format-json">JSON</button>
  </div>

  <!-- Preview -->
  <pre data-testid="export-preview">{activeContent}</pre>

  <!-- Actions -->
  <div>
    <button data-testid="copy-button">Copy to Clipboard / Copied!</button>
    <button data-testid="download-button">Download</button>
  </div>
</section>
```

### 2. `frontend/src/routes/workshop/+page.svelte` (modify)

**Changes:**
1. Add import: `import ExportPanel from '$lib/components/ExportPanel.svelte';`
2. Add Stage 5 section after ClipBoard, inside the `hasExpandStarted` block:

```svelte
<!-- Stage 5: Export -->
{#if session.clippedCandidates.length > 0}
  <section data-testid="stage-5">
    <h2>5. Export</h2>
    <ExportPanel
      clippedCandidates={session.clippedCandidates}
      problemContext={session.problemContext}
    />
  </section>
{/if}
```

The ExportPanel section appears only when there are clipped candidates. It sits after the ClipBoard within the Stage 3 expand block.

### 3. `frontend/tests/workshop.spec.ts` (modify)

**New test group: `ExportPanel`** (approximately 8-10 tests)

Tests follow the existing pattern — navigate to workshop, complete stages 1-3 via mock API, clip a variant, then assert ExportPanel behavior.

Test cases:
- Export panel not visible when no items clipped
- Export panel appears after clipping a variant
- Format tabs render (text, markdown, json)
- Default format is plain text
- Plain text shows numbered list
- Switching to markdown shows persona/domain headers
- Switching to JSON shows valid JSON with expected structure
- Copy button present with correct label
- Download button present with correct label
- Export panel disappears when all items unclipped

## Files NOT Modified

- `frontend/src/lib/stores/session.svelte.ts` — no new state needed
- `frontend/src/lib/api/` — no API calls
- `frontend/tests/fixtures/` — no new mock data
- All other components — unchanged
- Backend — unchanged
- `sst.config.ts` — unchanged

## Component Boundaries

ExportPanel is a pure presentation component. It:
- Receives data via props (no store imports)
- Generates export text via derived computations
- Handles clipboard/download via browser APIs
- Has no side effects beyond clipboard write and file download

The workshop page is responsible for:
- Deciding when to show ExportPanel (clipped count > 0)
- Passing the correct data (clippedCandidates, problemContext)

## Ordering

1. ExportPanel.svelte first (self-contained, testable in isolation)
2. Workshop page integration second (just import + render)
3. Tests third (need both component and integration in place)
