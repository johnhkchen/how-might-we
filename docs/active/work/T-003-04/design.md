# Design — T-003-04: persona-constraint-components

## Decision 1: Inline Edit Pattern

### Options

**A. Contenteditable divs** — Use `contenteditable` on field display elements. Click activates editing in place. Blur fires save.
- Pro: Very inline — no layout shift
- Con: Hard to control, paste formatting issues, inconsistent cross-browser

**B. Click-to-toggle `<input>` / `<textarea>`** — Display as text normally. On click, swap to an input element. On blur/Enter, save and swap back to text.
- Pro: Standard form controls, easy to style, predictable behavior
- Con: Minor layout shift on toggle, need to manage focus

**C. Always-visible inputs styled as text** — Render all fields as inputs but styled to look like plain text (no visible border until hover/focus).
- Pro: No toggle logic, always editable, no layout shift
- Con: Tab order issues with many inputs, may feel form-like rather than card-like

### Decision: Option B (click-to-toggle)

The specification says "click to edit, blur to save" — this maps directly to option B. It gives the clearest affordance (user clicks text, it becomes editable) and cleanest separation between view and edit states. The slight layout shift is acceptable and even desirable as visual feedback.

For array fields (goals, frustrations, influencers), each item in the list is independently clickable. Adding items uses a small "+" button that appends a new input in edit mode.

## Decision 2: Streaming Data Handling

### Options

**A. Component receives `Partial<Persona>` directly** — Parent passes streaming partial; component renders whatever fields exist, shows skeleton/placeholder for missing ones.
- Pro: Simple data flow, component handles its own partial state
- Con: Component must handle undefined checks everywhere

**B. Component receives full `Persona | null`** — Parent accumulates partials into a full object (filling missing with defaults); component always gets a complete object or null.
- Pro: Simpler component logic
- Con: Obscures streaming progress, defaults may be misleading

**C. Component receives `Persona | null` plus `isStreaming` flag** — Full persona (accumulated in store) plus a boolean to show streaming indicators.
- Pro: Clean separation — data shape is always Persona, streaming state controls UI affordance
- Con: Still need to handle the initial null case

### Decision: Option A — components receive `Partial<Persona>` during streaming

During streaming, the `onPartial` callback receives `Partial<Persona>` objects. The component should handle this directly. Once streaming completes, the store's `persona` field gets the final complete `Persona`. The component can show a pulsing animation on fields that haven't arrived yet.

The workshop page will maintain a local `streamingPersona` state that receives partials during streaming, then swaps to the store's `persona` once done. This gives the component a single `persona: Partial<Persona>` prop that works for both streaming and final states.

## Decision 3: Constraint Source

### Options

**A. User types raw constraints, AI classifies them** — Add a BAML function or backend logic to classify constraint types.
- Pro: Less manual work for user
- Con: Requires new backend endpoint, out of ticket scope

**B. User enters constraints manually with type selection** — User types statement, picks type from dropdown/buttons.
- Pro: Simple, no backend dependency, user stays in control
- Con: More manual effort

### Decision: Option B — manual constraint entry

The BAML functions have no constraint classification endpoint. The AC says "text inputs for persona description, domain, constraints" — the constraint input is user-authored. User types a constraint statement and selects a type badge (hard/soft/assumption). This keeps the ticket scoped to frontend-only work.

## Decision 4: Store Update Strategy

### Options

**A. Add granular update methods** — `updatePersonaField()`, `updateConstraint()`, `removeConstraint()`, `addConstraint()`.
- Pro: Explicit, each operation is a method
- Con: Many methods, store grows

**B. Use `setPersona()` / `setContext()` with spread** — Components build updated objects and call existing setters.
- Pro: No store changes needed, uses existing API
- Con: Components do more work

### Decision: Option B — use existing setters with spread

The store already has `setPersona()` and `setContext()`. Components will spread the current persona/context and override the changed field. This avoids unnecessary store method proliferation. Since Svelte 5 `$state` triggers reactivity on assignment, this works cleanly.

However, we need to add one method: `setConstraints(constraints: Constraint[])` — because constraints live inside `problemContext` and rebuilding the entire ProblemContext for each constraint edit is verbose. Actually, we can just update `problemContext` via `setContext()`. No new methods needed.

## Decision 5: Workshop Page Stage 1 Layout

The workshop page for Stage 1 needs:
1. **Input form**: persona description (textarea), domain (text input), initial constraints (add/type)
2. **"Refine" button**: calls `/api/persona` to stream the persona
3. **Output area**: PersonaCard + ConstraintList below the form

### Layout Decision

Single-column layout. Form at top, results below. The form collapses or becomes secondary after persona is generated. PersonaCard and ConstraintList stack vertically. This matches the "scrollable flow" described in the spec where new stages appear below.

## Decision 6: Constraint Badge Colors

From AC: `"hard" (red)`, `"soft" (yellow)`, `"assumption" (blue)`. Map to Tailwind:
- hard: `bg-red-100 text-red-800`
- soft: `bg-yellow-100 text-yellow-800`
- assumption: `bg-blue-100 text-blue-800`

## Rejected Approaches

- **Modal editing**: Would break the "inline editable" requirement
- **Separate edit page/mode**: Over-engineered for this use case
- **AI-generated constraints**: No backend support, would require new BAML function
- **Rich text editing**: Unnecessary complexity for short text fields
