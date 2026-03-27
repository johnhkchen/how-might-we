# Plan — T-003-02: session-store-svelte5

## Steps

### Step 1: Rename `session.ts` → `session.svelte.ts`

- Git-move `frontend/src/lib/stores/session.ts` to `frontend/src/lib/stores/session.svelte.ts`
- Verify: file exists at new path, old path gone

### Step 2: Implement the SessionStore class

In `session.svelte.ts`, after the existing type definitions:

1. Remove the `// TODO` comment
2. Add `SessionStore` class with:
   - `$state` fields: persona, problemContext, analysis, candidates, iterationCount, isStreaming
   - `$derived` fields: clippedIds, clippedCandidates
   - Methods: setPersona, setContext, setAnalysis, addCandidates, updateCandidateStatus, clipCandidate, incrementIteration, startStreaming, stopStreaming, reset
3. Export singleton: `export const session = new SessionStore()`

### Step 3: Update fixture import paths

Update all four fixture files to import from the new path:

- `frontend/tests/fixtures/persona.ts` — change import path
- `frontend/tests/fixtures/analysis.ts` — change import path
- `frontend/tests/fixtures/expansion.ts` — change import path
- `frontend/tests/fixtures/refinement.ts` — change import path

Import changes from `../../src/lib/stores/session` to `../../src/lib/stores/session.svelte` (TypeScript resolves `.svelte.ts` from `.svelte`).

Note: If TypeScript can resolve the old path to the new `.svelte.ts` file without changing imports, skip this step. Test first.

### Step 4: Verify build and lint

- Run `npm run check` — TypeScript + Svelte checks pass
- Run `npm run lint` — ESLint passes
- Fix any issues found

### Step 5: Run Playwright tests

- Run `npx playwright test` to ensure no regressions
- Fix any failures

---

## Testing Strategy

### Current test coverage

The project has Playwright E2E tests. There are no unit tests for the store specifically. The acceptance criteria can be verified by:

1. **Type checking** (`npm run check`) — verifies the class compiles, types are correct, runes are valid
2. **Lint** (`npm run lint`) — code quality
3. **Import resolution** — if fixtures and components can import types from the renamed file, imports work
4. **E2E tests** — verify no regressions from the rename

### Future test surface

The store implementation enables testing in later tickets when components wire up to it. The store's methods are pure state mutations — easy to unit test if needed later.

---

## Verification Criteria

- [ ] `session.svelte.ts` exists with all types exported
- [ ] `SessionStore` class uses `$state` for reactive fields
- [ ] `clippedIds` and `clippedCandidates` use `$derived`
- [ ] All 10 methods implemented (setPersona, setContext, setAnalysis, addCandidates, updateCandidateStatus, clipCandidate, incrementIteration, startStreaming, stopStreaming, reset)
- [ ] `addCandidates` generates UUIDs via `crypto.randomUUID()`
- [ ] `npm run check` passes
- [ ] `npm run lint` passes
- [ ] Playwright tests pass (no regressions)
