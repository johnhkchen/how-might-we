# Design — T-003-05: analysis-panel-component

## Problem

Build the AnalysisPanel component and wire it into the workshop page. The panel must: accept a raw HMW statement, call `/api/analyze` with the statement + ProblemContext, stream the analysis section by section, display each field with appropriate visual treatment, and store the final result in the session store.

## Design Options

### Option A: All-in-one AnalysisPanel

AnalysisPanel owns the text input, button, streaming logic, and display. The workshop page just drops `<AnalysisPanel />` in.

**Pros:** Self-contained, easy to test in isolation, mirrors how PersonaCard works.
**Cons:** PersonaCard doesn't own input/button — the workshop page does. Mixing concerns (input form + display) in one component breaks the pattern.

### Option B: Split input from display (follow Stage 1 pattern)

Workshop page owns the HMW input field, Analyze button, and streaming orchestration (like it does for persona). AnalysisPanel is a pure display component that receives `Partial<HMWAnalysis>` and `isStreaming` as props — like PersonaCard.

**Pros:** Consistent with Stage 1 pattern. Workshop page controls the flow and session state. AnalysisPanel focuses on display logic (scope indicator, solution bias highlight, etc.). Easier to test each concern independently.
**Cons:** Slightly more code in workshop page.

### Option C: Hybrid — AnalysisPanel owns input + display

AnalysisPanel includes the input textarea and button at the top, and the streaming analysis below. Receives `problemContext` as a prop and handles streaming internally.

**Pros:** Encapsulates the full Stage 2 experience. Workshop page stays cleaner.
**Cons:** Breaks consistency with Stage 1. Harder to share `isStreaming` state with other stages.

## Decision: Option B — Split input from display

**Rationale:** This follows the established pattern from Stage 1. The workshop page is the orchestrator — it owns inputs, triggers API calls, manages streaming state, and delegates display to components. AnalysisPanel becomes a display-focused component like PersonaCard.

The workshop page will have:
- A text input for the HMW statement
- An "Analyze" button
- Streaming orchestration via `streamFromAPI`
- Error handling

AnalysisPanel will receive:
- `analysis: Partial<HMWAnalysis>` — the current partial or final analysis
- `isStreaming: boolean` — whether streaming is in progress

## Visual Design Decisions

### Scope Level Indicator

Use colored badges similar to constraint type badges:
- `too_narrow` → amber/yellow badge ("Too Narrow")
- `too_broad` → amber/yellow badge ("Too Broad")
- `well_scoped` → green badge ("Well Scoped")

This is a traffic-light pattern: green = good, amber = needs attention.

### Solution Bias

Display only when present (field is optional). Use a warning-styled callout (amber background, similar to error display but softer). The ticket says "highlighted if present" — a distinct visual block with a warning icon/label.

### Underlying Tension

The ticket says "visually emphasized (this is the key insight)." Use a distinct visual treatment — bordered block with slightly heavier typography or a left accent bar. This is the most important piece of the analysis.

### Initial Reframing

The ticket says "shown as a preview of what expansion will produce." Use an italicized or quoted style to convey "preview" rather than "final answer." A subtle background with an arrow or "→" prefix.

### Streaming Skeleton

Follow PersonaCard's pattern: skeleton pulse (`animate-pulse` gray bars) for fields that haven't arrived yet. Fields build progressively as partials come in.

### Section Ordering

Match the streaming order (which matches the BAML output order):
1. Original Statement (echo back)
2. Implicit User
3. Embedded Assumptions (list)
4. Scope Level (badge)
5. Solution Bias (conditional callout)
6. Underlying Tension (emphasized block)
7. Initial Reframing (preview block)

## Rejected Alternatives

- **Accordion/collapsible sections:** Over-engineered for this amount of content. All sections are short and should be visible at once.
- **Separate sub-components per analysis section:** Too granular. The analysis is a single logical unit displayed in one card.
- **Editable analysis fields:** Not in acceptance criteria. Analysis is read-only — the user's action is to proceed to Expand, not edit the critique.
