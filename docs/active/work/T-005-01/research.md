# Research — T-005-01 export-panel

## Ticket Summary

Build the ExportPanel component (Stage 5). Takes clipped HMWs from the ClipBoard and formats them for export in three formats: plain text, structured markdown, and JSON. Includes copy-to-clipboard, download, and empty state.

## Existing Code Map

### ExportPanel.svelte (stub)

`frontend/src/lib/components/ExportPanel.svelte` — placeholder component. Contains a `<script>` block with a TODO comment and a single `<div>` with "ExportPanel — to be implemented" text. No props, no logic.

### ClipBoard.svelte (dependency — T-003-07, done)

`frontend/src/lib/components/ClipBoard.svelte` — renders clipped candidates as a list. Receives `clippedCandidates: HMWCandidate[]` and `onRemove: (id: string) => void` as props. Each item shows a move-type badge and the statement (prefers `userEdits` over `variant.statement`). Has empty state.

### Session Store

`frontend/src/lib/stores/session.svelte.ts` — central state. Key types and derived state for export:

- **`HMWCandidate`**: `{ id, variant: HMWVariant, status: CandidateStatus, userEdits?, iteration }`
- **`HMWVariant`**: `{ statement, move: MoveType, rationale }`
- **`MoveType`**: `'narrowed' | 'broadened' | 'shifted_user' | 'reframed_constraint' | 'elevated_abstraction' | 'inverted' | 'combined' | 'decomposed'`
- **`CandidateStatus`**: `'generated' | 'selected' | 'edited' | 'skipped' | 'clipped'`
- **`Persona`**: `{ label, role, goals[], frustrations[], context, influencers[] }`
- **`ProblemContext`**: `{ domain, persona: Persona, constraints: Constraint[], priorContext? }`
- **`session.clippedCandidates`**: derived array of candidates with status `'clipped'`
- **`session.clippedIds`**: derived Set of clipped candidate IDs

The store also exposes `session.persona`, `session.problemContext`, `session.analysis`, and `session.iterationCount`.

### Workshop Page Integration

`frontend/src/routes/workshop/+page.svelte` — the ExportPanel stub is **not** currently rendered. The ClipBoard component is rendered inside Stage 3's `hasExpandStarted` block at the bottom. ExportPanel would logically go after the ClipBoard, or as a new Stage 5 section.

The workshop page imports components individually. It already imports `ClipBoard`. It does **not** import `ExportPanel`.

### Existing Patterns

1. **Component props**: Svelte 5 `$props()` destructuring with typed interface.
2. **Styling**: Tailwind utility classes directly in markup. Consistent card pattern: `bg-white rounded-lg border border-gray-200 p-6`.
3. **Test IDs**: Every interactive/assertable element has `data-testid`.
4. **Move colors**: Shared `moveColors` record mapping MoveType to Tailwind bg/text classes (defined in both VariantCard and ClipBoard — not DRY but consistent).
5. **Move labels**: `moveLabel()` function converts snake_case to Title Case (also duplicated).
6. **No shared utility file** for move colors/labels — each component defines its own copy.

### Testing Patterns

`frontend/tests/workshop.spec.ts` — comprehensive Playwright E2E tests using mock API. Key patterns:

- Tests use `page.goto('/workshop')` then interact stage-by-stage
- Mock API via `VITE_MOCK_API=true` environment variable
- Fixture-driven streaming responses in `frontend/tests/fixtures/`
- Tests assert via `data-testid` selectors
- Helper pattern: complete stage 1 via refine, stage 2 via analyze, stage 3 via expand, then assert specific behaviors
- 70 tests currently, all passing

### Browser APIs Needed

1. **Clipboard API**: `navigator.clipboard.writeText(text)` — async, needs HTTPS or localhost. Playwright can grant clipboard permission.
2. **File download**: Create a Blob, generate an `objectURL`, create a temporary `<a>` element, click it programmatically. No server round-trip.

### Constraints

- ExportPanel is a frontend-only feature — no backend endpoints needed.
- The component needs access to `clippedCandidates` and `problemContext` (for structured markdown and JSON exports).
- The `HMWSession` type in the BAML spec includes `context`, `analysis`, `candidates`, `clippedIds`, `iterationCount` — the JSON export should match this shape.
- The specification says JSON export should be "parseable by other tools" — matching the `HMWSession` type is the natural choice.

### Files That Will Be Modified

1. `frontend/src/lib/components/ExportPanel.svelte` — replace stub with full implementation
2. `frontend/src/routes/workshop/+page.svelte` — import and render ExportPanel
3. `frontend/tests/workshop.spec.ts` — add ExportPanel test cases

### Files That Will NOT Be Modified

- Session store (no new state needed — export is derived from existing state)
- Other components (ClipBoard, VariantCard, etc.)
- Backend (no new endpoints)
- Mock fixtures (export is client-side only)
