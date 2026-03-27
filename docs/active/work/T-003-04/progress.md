# Progress — T-003-04: persona-constraint-components

## Completed Steps

### Step 1: Add `updatePersona` to session store
- Added `updatePersona(updates: Partial<Persona>)` method to `SessionStore`
- Verified: `npm run check` passes

### Step 2: Implement PersonaCard component
- Replaced stub with full implementation
- Props: `persona: Partial<Persona>`, `isStreaming?: boolean`, `onUpdate?: (persona: Persona) => void`
- Click-to-edit on label, role, context (string fields) and goals, frustrations, influencers (array fields)
- Used `use:focusOnMount` action instead of `autofocus` to avoid a11y lint errors
- Streaming placeholders: pulsing gray bars for undefined fields
- Verified: `npm run check` and `npm run lint` pass

### Step 3: Implement ConstraintList component
- Replaced stub with full implementation
- Props: `constraints: Constraint[]`, `onUpdate?: (constraints: Constraint[]) => void`
- Type badges with correct colors (hard=red, soft=yellow, assumption=blue)
- Inline edit, delete, add constraint with type selection
- Verified: `npm run check` and `npm run lint` pass

### Step 4: Implement Stage 1 in workshop page
- Replaced placeholder with full Stage 1 UI
- Input form: persona description textarea, domain text input
- Pre-refinement constraint entry via ConstraintList
- "Refine Persona" button calls mock/real API via `streamFromAPI`
- PersonaCard appears during streaming, editable after completion
- Post-refinement ConstraintList appears after streaming completes
- Error handling with error message display
- Verified: `npm run check` and `npm run lint` pass

### Step 5: Write Playwright E2E tests
- Extended `workshop.spec.ts` from 3 tests to 16 tests
- Tests cover: form rendering, button states, streaming, PersonaCard display, inline editing, ConstraintList CRUD, badge colors, post-refinement constraints
- Verified: all 32 tests pass (16 streaming + 16 workshop)

### Step 6: Final verification
- `npm run check`: 0 errors, 0 warnings
- `npm run lint`: clean
- `npx playwright test`: 32/32 passed

### ESLint config fix (discovered during implementation)
- ESLint config lacked Svelte TypeScript parser configuration
- Added `parserOptions.parser: tsParser` for `**/*.svelte` files
- Added `no-unused-vars: off` for Svelte files (false positives on `$props()` destructuring)
- This was a pre-existing issue that only surfaced because prior stubs had no real TypeScript syntax

## Deviations from Plan

1. **No error test**: The Playwright build uses `VITE_MOCK_API=true`, which means `apiFetch` is `mockFetch` — it creates Response objects in JS without going through the browser network stack. Playwright's `page.route()` cannot intercept these requests. Error path testing requires a different approach (e.g., Vitest unit tests or a mock that supports error injection).

2. **ESLint config fix**: Not in the original plan. Discovered during implementation that the ESLint config couldn't parse TypeScript in Svelte files. Fixed as part of "own all issues you encounter" rule.

3. **`use:focusOnMount` instead of `autofocus`**: The `autofocus` HTML attribute triggers `a11y_autofocus` warnings in Svelte, which ESLint's `svelte/valid-compile` rule treats as errors. Replaced with a Svelte action that programmatically focuses on mount.

4. **Enter key instead of blur for edit test**: The inline edit test uses `press('Enter')` instead of `blur()` for more reliable test behavior. Both paths are supported by the component.
