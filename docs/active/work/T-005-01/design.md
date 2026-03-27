# Design — T-005-01 export-panel

## Decision: Single Self-Contained Component

The ExportPanel will be a single Svelte component that receives the data it needs via props, generates all three export formats internally, and handles copy/download actions. No new store state, no new utilities, no backend calls.

### Props

```typescript
{
  clippedCandidates: HMWCandidate[];
  problemContext: ProblemContext | null;
}
```

`problemContext` is needed for the structured markdown and JSON formats (persona summary, domain, constraints).

### Format Generation

All three formats are pure functions of the props — computed via `$derived`.

**Plain text**: Numbered list of HMW statements. Uses `userEdits ?? variant.statement` for each clipped candidate.

```
1. How might we reduce onboarding friction for junior designers?
2. How might we help facilitators gauge participant energy in real-time?
3. How might we make workshop prep take less than 15 minutes?
```

**Markdown**: Structured document with persona context header, then each HMW with its move type and rationale.

```markdown
# HMW Export

## Persona
**Junior Designer** — Entry-level product designer at a mid-size SaaS company
**Domain:** Design thinking facilitation

## HMW Questions

### 1. How might we reduce onboarding friction for junior designers?
- **Move:** Narrowed
- **Rationale:** Focuses specifically on the first-time experience...

### 2. How might we help facilitators gauge participant energy?
- **Move:** Shifted User
- **Rationale:** Reframes from the designer to the facilitator...
```

**JSON**: Full structured export matching the `HMWSession` shape from the BAML spec. Includes `context`, `analysis` (null in export — analysis isn't per-candidate), `candidates` (only clipped ones), `clippedIds`, and `iterationCount`. This format is machine-parseable for piping into other tools.

### UI Layout

**Format selector**: Three tab-like buttons (Plain Text | Markdown | JSON). Active tab highlighted. Default: Plain Text.

**Preview area**: Read-only `<pre>` block showing the generated text for the selected format. Monospaced font, horizontal scroll for long lines.

**Action bar**: Two buttons below the preview:
- **Copy to Clipboard**: Uses `navigator.clipboard.writeText()`. Shows brief "Copied!" feedback.
- **Download**: Generates and downloads a file with the appropriate extension (`.txt`, `.md`, `.json`).

**Empty state**: When no HMWs are clipped, show a message instead of the format selector/preview/actions. Same pattern as ClipBoard empty state.

### Alternatives Considered

**Option A: Separate export page/route** — Rejected. The specification says the workshop is "a single continuous experience, not separate pages." Export should be inline.

**Option B: Modal/dialog for export** — Rejected. Adds complexity (focus trapping, backdrop). The export is not a transient action — users may want to switch formats and compare. Inline panel is simpler.

**Option C: Export directly from ClipBoard** — Rejected. ClipBoard is a compact sidebar/list component. Adding format selection and preview would bloat it. Separation of concerns: ClipBoard is for curation, ExportPanel is for output.

**Option D: Rich text preview with syntax highlighting** — Rejected. Over-engineering for v1. A monospaced `<pre>` block is sufficient. Users will paste into their own tools.

### Copy Feedback

After clicking "Copy," the button text changes to "Copied!" with a green checkmark for 2 seconds, then reverts. This is a common, well-understood pattern. Implemented with a simple `setTimeout`.

### Download Implementation

1. Create a `Blob` with the text content and appropriate MIME type
2. Create an object URL via `URL.createObjectURL(blob)`
3. Create a temporary `<a>` element with `download` attribute set to filename
4. Programmatically click it
5. Revoke the object URL

Filename pattern: `hmw-export.{txt,md,json}`.

### Test Strategy

Playwright tests will:
1. Verify empty state when no items clipped
2. Verify panel appears when items are clipped
3. Verify format switching (all three tabs)
4. Verify plain text content matches expected output
5. Verify markdown content includes persona/domain/move/rationale
6. Verify JSON content is valid and parseable
7. Verify copy button exists and has correct aria-label
8. Verify download button exists and has correct aria-label

Note: Clipboard write and file downloads are hard to test in Playwright without custom handling. Tests will focus on content generation and UI state, not browser API side effects.

### Placement in Workshop Page

ExportPanel renders as a Stage 5 section, after the ClipBoard, gated on `hasExpandStarted` and `clippedCandidates.length > 0`. It sits at the bottom of the workshop flow — the natural terminus.
