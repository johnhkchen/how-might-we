# Design — T-003-06: variant-grid-clipboard-components

## Decision Summary

Build VariantCard, VariantGrid, and ClipBoard as Svelte 5 components following the existing PersonaCard/AnalysisPanel patterns. ClipBoard sits below the variant grid in the same column (not a sidebar). Inline editing targets the HMW statement only. All candidates are displayed; status visually distinguishes them.

## Design Decisions

### 1. VariantCard — Actions & State Machine

**Options considered:**
- (A) Four separate buttons always visible (select, skip, edit, clip)
- (B) Primary action button + overflow menu for secondary actions
- (C) Contextual buttons based on current status

**Decision: (C) Contextual buttons.** A card in `generated` status shows all four actions. A `selected` card shows clip/skip/edit. A `clipped` card shows unclip. A `skipped` card shows a muted state with an undo button. This keeps the UI clean and reduces cognitive load.

**Why not (A):** Four buttons per card creates visual noise when you have 6-8 cards. The user needs to scan quickly.
**Why not (B):** The actions are all primary-level — hiding them in a menu defeats the "sculpting" metaphor.

### 2. VariantCard — Inline Editing

**Decision:** Edit mode replaces the HMW statement text with a textarea. The user edits the statement, commits with Enter/blur. The `userEdits` field on the candidate stores the edited text. Status changes to `edited`. Rationale remains read-only.

**Rationale:** The store's `HMWCandidate.userEdits` is a single string, matching the spec's description of "lightly editing wording."

### 3. VariantGrid — Layout

**Options considered:**
- (A) CSS Grid with fixed columns
- (B) Single column list
- (C) Responsive: single column on narrow, 2-column on wide

**Decision: (C) Responsive grid.** `grid-cols-1 lg:grid-cols-2` gives a clean list on mobile and a scannable grid on desktop. Cards are uniform height via content-based sizing.

### 4. VariantGrid — Streaming Display

**Approach:** The workshop page tracks which candidate IDs have been added. On each SSE partial, it diffs the incoming `variants` array against already-added candidates (by statement text, since IDs aren't in the SSE response) and calls `session.addCandidates()` only for new variants. VariantGrid simply renders `session.candidates` filtered to the current iteration or all.

New cards get a brief entrance animation (opacity + translate) via CSS transition to create the "appearing one at a time" effect.

### 5. VariantGrid — Showing All Candidates

**Decision:** Show all candidates across all iterations. Current iteration's `generated` cards appear at the top. Previously acted-on cards (selected, edited, clipped, skipped) appear below in a "Previous" section with dimmed styling. This matches the spec: "new variants stream in alongside existing selected ones, visually distinct as new."

### 6. ClipBoard — Position & Layout

**Options considered:**
- (A) Sidebar layout (changes page from centered to sidebar+content)
- (B) Sticky bottom panel
- (C) Inline section below variant grid
- (D) Collapsible drawer

**Decision: (C) Inline section below variant grid**, with a sticky count badge at the top of the section. The current layout is `max-w-4xl mx-auto` and changing to a sidebar would be a larger layout refactor touching the page shell. An inline panel keeps it simple and scrollable. The count badge in the section header provides the "persistent" feel.

**Why not (A):** Would require restructuring the entire page layout, which is beyond this ticket's scope.
**Why not (B):** Sticky bottom panels are problematic on mobile and fight with the scrollable flow design.

### 7. Move Type Color Palette

Map from the ticket's AC, using Tailwind classes:

| Move | BG | Text | Ring |
|------|-----|------|------|
| narrowed | bg-green-100 | text-green-800 | ring-green-300 |
| broadened | bg-purple-100 | text-purple-800 | ring-purple-300 |
| shifted_user | bg-orange-100 | text-orange-800 | ring-orange-300 |
| reframed_constraint | bg-teal-100 | text-teal-800 | ring-teal-300 |
| elevated_abstraction | bg-indigo-100 | text-indigo-800 | ring-indigo-300 |
| inverted | bg-red-100 | text-red-800 | ring-red-300 |
| combined | bg-amber-100 | text-amber-800 | ring-amber-300 |
| decomposed | bg-sky-100 | text-sky-800 | ring-sky-300 |

### 8. Move Type Display Labels

Convert snake_case to human-readable: `shifted_user` → "Shifted User", `reframed_constraint` → "Reframed Constraint", etc. Simple string transformation.

### 9. Workshop Page Integration

Stage 3 (Expand) appears after Stage 2 (Analysis) completes. It has an "Expand" button that triggers the `/api/expand` call. Stage 4 (Refine / "Go Deeper") is gated behind having at least one selected or edited candidate.

Both stages share the same VariantGrid and ClipBoard instances. The ClipBoard section appears once any candidates exist.

### 10. Candidate Deduplication During Streaming

BAML streaming sends cumulative arrays. If partial 1 has [A] and partial 2 has [A, B], we only add B. Dedup by comparing variant statement text against existing candidates' statements.

## Rejected Approaches

- **Drag-and-drop for clipping:** Over-engineered for a text-heavy workflow. Click-to-clip is faster.
- **Card flip animation for status changes:** Adds complexity without aiding comprehension. Simple state-based styling is clearer.
- **Separate pages for expand vs refine:** The spec explicitly calls for a single scrollable flow.
- **Virtual scrolling for large candidate lists:** Premature optimization. Even 3 iterations of 8 variants = 24 cards, well within normal DOM capacity.
