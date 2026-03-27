# Plan — T-003-04: persona-constraint-components

## Step 1: Add `updatePersona` to session store

**File**: `frontend/src/lib/stores/session.svelte.ts`

Add:
```ts
updatePersona(updates: Partial<Persona>): void {
    if (this.persona) {
        this.persona = { ...this.persona, ...updates };
    }
}
```

**Verify**: `npm run check` passes.

## Step 2: Implement PersonaCard component

**File**: `frontend/src/lib/components/PersonaCard.svelte`

Replace stub with full implementation:
- Props: `persona: Partial<Persona>`, `isStreaming?: boolean`, `onUpdate?: (persona: Persona) => void`
- Display all 6 fields: label, role, goals, frustrations, context, influencers
- Click-to-edit on each field (text fields: click text → input, array fields: click item → input)
- Array fields: "+" button to add items, each item individually editable
- Streaming placeholders: pulsing gray bars for undefined fields
- On edit complete (blur/Enter): call `onUpdate` with updated full persona

**Verify**: `npm run check` and `npm run lint` pass.

## Step 3: Implement ConstraintList component

**File**: `frontend/src/lib/components/ConstraintList.svelte`

Replace stub with full implementation:
- Props: `constraints: Constraint[]`, `onUpdate?: (constraints: Constraint[]) => void`
- Display each constraint: colored type badge + statement text + delete button
- Badge colors: hard=red, soft=yellow, assumption=blue
- Click statement to edit inline
- Delete button removes constraint and fires `onUpdate`
- "Add constraint" button at bottom opens inline form
- Add form: text input + type selector (3 pill buttons) + add/cancel

**Verify**: `npm run check` and `npm run lint` pass.

## Step 4: Implement Stage 1 in workshop page

**File**: `frontend/src/routes/workshop/+page.svelte`

Replace placeholder with Stage 1 UI:
- Import session store, streamFromAPI, PersonaCard, ConstraintList
- Form section: textarea for persona description, text input for domain
- Constraint input section using ConstraintList (pre-refinement)
- "Refine Persona" button: calls streamFromAPI, updates streaming state
- PersonaCard appears once streaming data arrives
- ConstraintList shown below for editing
- Edits in PersonaCard → `session.updatePersona()` / `session.setPersona()`
- Edits in ConstraintList → update constraints in local state, then `session.setContext()`

**Verify**: `npm run check` and `npm run lint` pass. Manual: `npm run dev:mock`, navigate to /workshop, fill form, click Refine, see streaming persona.

## Step 5: Write Playwright E2E tests

**File**: `frontend/tests/workshop.spec.ts` (extend existing)

Add tests:
1. Stage 1 form renders with expected inputs
2. Clicking "Refine Persona" with mock API shows PersonaCard with streamed data
3. PersonaCard displays all persona fields from mock fixture
4. PersonaCard inline edit: click label, type new value, blur, verify text updated
5. ConstraintList displays constraints with colored type badges
6. ConstraintList: add a new constraint
7. ConstraintList: delete a constraint
8. ConstraintList: edit a constraint inline
9. Streaming: fields appear progressively (first partial has only label)

**Verify**: `npx playwright test` — all tests pass.

## Step 6: Final verification

- `npm run check` — zero errors
- `npm run lint` — clean
- `npx playwright test` — all tests pass (existing + new)
- Manual walkthrough with `npm run dev:mock`

## Testing Strategy

| What | How | Type |
|------|-----|------|
| PersonaCard field display | Playwright: check text content matches fixture | E2E |
| PersonaCard inline edit | Playwright: click, type, blur, assert updated text | E2E |
| PersonaCard streaming placeholders | Playwright: verify progressive field appearance | E2E |
| ConstraintList badges | Playwright: check badge colors/classes by constraint type | E2E |
| ConstraintList CRUD | Playwright: add/edit/delete constraints, verify list | E2E |
| Stage 1 flow | Playwright: fill form → click Refine → verify output | E2E |
| Type safety | `npm run check` (svelte-check + tsc) | Static |
| Lint | `npm run lint` (ESLint) | Static |

## Commit Plan

1. After Step 1: store update
2. After Step 3: both components
3. After Step 5: workshop page + tests

Or one atomic commit after all steps pass verification.
