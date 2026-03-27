# Structure — T-003-04: persona-constraint-components

## Files Modified

### 1. `frontend/src/lib/components/PersonaCard.svelte`
Replace stub with full implementation.

**Props** (via `$props()`):
- `persona: Partial<Persona>` — the persona data (partial during streaming, full after)
- `isStreaming: boolean` — controls pulsing animation on unfilled fields
- `onUpdate: (persona: Persona) => void` — callback when user edits a field

**Internal state**:
- `editingField: string | null` — tracks which field is currently being edited
- `editValue: string` — current value of the field being edited

**Sections rendered**:
- Header: persona label (editable) + role (editable)
- Goals list: each item clickable, "+" to add
- Frustrations list: same pattern as goals
- Context: single editable text block
- Influencers list: same pattern as goals

**Edit flow**: Click text → show input → blur/Enter → fire `onUpdate` with updated persona

**Streaming**: Fields that are `undefined` show a subtle pulsing placeholder. Once a field arrives, it animates in.

### 2. `frontend/src/lib/components/ConstraintList.svelte`
Replace stub with full implementation.

**Props**:
- `constraints: Constraint[]` — current constraint list
- `onUpdate: (constraints: Constraint[]) => void` — callback when constraints change

**Internal state**:
- `editingIndex: number | null` — which constraint is being edited
- `editStatement: string` — current edit value
- `isAdding: boolean` — whether the "add new" form is open
- `newStatement: string` — new constraint text
- `newType: Constraint['type']` — new constraint type selection

**Sections rendered**:
- List of constraints, each with:
  - Type badge (colored: red/yellow/blue)
  - Statement text (click to edit)
  - Delete button (X icon)
- "Add constraint" button at bottom
- Add form: text input + type selector (3 buttons/pills) + confirm

### 3. `frontend/src/routes/workshop/+page.svelte`
Replace placeholder with Stage 1 implementation.

**Structure**:
- Header (keep existing)
- Stage 1 section:
  - Input form (persona description textarea, domain text input)
  - Initial constraints entry area (inline ConstraintList for pre-refinement constraints)
  - "Refine Persona" button
  - Loading/streaming indicator
  - PersonaCard (shown after streaming starts)
  - ConstraintList (shown with user-entered constraints, editable)
  - "Continue to Analysis" or similar progression

**Data flow**:
1. User fills form fields
2. User optionally adds constraints
3. Click "Refine" → `streamFromAPI<Persona>('/api/persona', { rawInput }, onPartial)`
4. `onPartial` updates local `streamingPersona` state
5. On stream complete: `session.setPersona(finalPersona)`, build `ProblemContext`
6. PersonaCard displays with editable fields
7. User edits flow back to store

### 4. `frontend/src/lib/stores/session.svelte.ts`
Minimal addition: export the `Constraint` type (already exported). Add a convenience method for updating constraints within problemContext.

Actually, reviewing the store — `Persona` and `Constraint` types are already exported. No store changes are strictly necessary. The workshop page will call `session.setPersona()` and `session.setContext()` directly.

But we need to add `updatePersona(updates: Partial<Persona>)` for cleaner inline edits:

```ts
updatePersona(updates: Partial<Persona>): void {
    if (this.persona) {
        this.persona = { ...this.persona, ...updates };
    }
}
```

## Files Created

None. All components already exist as stubs.

## Files Not Modified

- `frontend/src/lib/api/stream.ts` — no changes needed
- `frontend/src/lib/api/client.ts` — no changes needed
- `frontend/src/lib/api/mock.ts` — no changes needed
- `frontend/tests/fixtures/*` — no changes needed
- Backend files — not in frontend track scope

## Component Boundaries

```
workshop/+page.svelte
├── Stage 1 Input Form (inline in page)
│   ├── textarea (persona description)
│   ├── input (domain)
│   └── ConstraintList (for initial manual constraints)
├── "Refine Persona" button
├── PersonaCard (appears after streaming starts)
│   └── Inline edit fields (self-contained)
└── ConstraintList (editable, post-refinement)
```

PersonaCard and ConstraintList are self-contained editing components. They receive data as props and fire callbacks on change. The workshop page orchestrates data flow between the store, API calls, and components.

## Public Interfaces

### PersonaCard
```ts
type PersonaCardProps = {
    persona: Partial<Persona>;
    isStreaming?: boolean;
    onUpdate?: (persona: Persona) => void;
};
```

### ConstraintList
```ts
type ConstraintListProps = {
    constraints: Constraint[];
    onUpdate?: (constraints: Constraint[]) => void;
};
```

## Testing Approach

New Playwright tests in `frontend/tests/workshop.spec.ts` (extend existing file):
- PersonaCard renders all fields from mock data
- PersonaCard inline edit: click field, type, blur, verify update
- ConstraintList shows constraints with correct type badges
- ConstraintList: add, edit, delete constraints
- Stage 1 form: fill inputs, click Refine, verify streaming persona appears
- Streaming: verify fields appear progressively using mock API
