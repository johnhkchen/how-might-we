# Plan — T-007-03: session-localstorage-persistence

## Step 1: Create persistence utility

**File**: `frontend/src/lib/utils/persistence.ts`

Create the module with:
- `SavedSession` interface with version, savedAt, store, and page sections
- `STORAGE_KEY` and `MAX_AGE_MS` constants
- `saveSession(store, page)` — serializes and writes to localStorage
- `loadSession()` — reads, validates, checks expiry, returns SavedSession or null
- `clearSession()` — removes the key

Guard all localStorage access with `typeof window !== 'undefined'` for SSR safety.

**Verify**: Import compiles with `npm run check`.

## Step 2: Add restore() to SessionStore

**File**: `frontend/src/lib/stores/session.svelte.ts`

Add method:
```typescript
restore(data: { persona, problemContext, analysis, candidates, iterationCount }): void
```

Sets all five persistent fields. Does not touch `isStreaming`.

**Verify**: `npm run check` passes.

## Step 3: Wire persistence into workshop page

**File**: `frontend/src/routes/workshop/+page.svelte`

### 3a: Recovery on load
- Import persistence functions
- Add `savedSession` and `showRecovery` state variables
- In `onMount`, call `loadSession()`. If result is non-null, set state to show recovery banner.
- Add `resumeSession()`: calls `session.restore()`, sets page-level state (`personaDescription`, `domain`, `constraints`, `hmwStatement`, `emergentTheme`), derives UI gate flags, hides banner.
- Add `startFresh()`: calls `clearSession()`, hides banner.

### 3b: Recovery banner UI
- Add conditional banner between the Turnstile/rate-limit banners and Stage 1
- Shows: "You have a saved session from [time]. Resume or start fresh?"
- Two buttons: "Resume previous session" (calls resumeSession) and "Start fresh" (calls startFresh)
- Styled with blue-50 bg, blue-200 border, matching existing banner patterns

### 3c: Auto-save effect
- Add a `$effect` that reads: `session.persona`, `session.problemContext`, `session.analysis`, `session.candidates`, `session.iterationCount`, `personaDescription`, `domain`, `constraints`, `hmwStatement`, `emergentTheme`
- On change, debounced 500ms, calls `saveSession()`
- Debounce via `setTimeout`/`clearTimeout` pattern inside the effect
- Skip saving while recovery banner is visible (don't overwrite saved session before user decides)

**Verify**: `npm run check` and `npm run lint` pass.

## Step 4: Manual smoke test

- Run `npm run dev:mock` in frontend
- Go through workshop flow (refine persona, analyze, expand)
- Refresh page — recovery banner should appear
- Click "Resume" — full state should be restored
- Refresh again, click "Start fresh" — empty form
- Verify no banner on completely fresh visit

## Step 5: Write E2E tests

**File**: `frontend/tests/persistence.spec.ts`

Tests:
1. **No recovery banner on fresh visit**: goto /workshop, assert banner not visible
2. **Save and recovery flow**: complete Stage 1 (persona streaming), reload page, verify recovery banner appears with timestamp
3. **Resume restores state**: click Resume, verify PersonaCard is visible, persona data matches
4. **Start fresh clears state**: with saved session, reload, click Start fresh, verify form is empty and no PersonaCard
5. **24h expiry**: inject expired session into localStorage via page.evaluate, reload, verify no recovery banner
6. **Set serialization round-trip**: complete through expand (generates candidates with statuses), clip a candidate, reload, resume, verify clipped candidate appears in ClipBoard

**Verify**: `npx playwright test tests/persistence.spec.ts` passes.

## Step 6: Final verification

- `npm run check` — TypeScript + Svelte checks
- `npm run lint` — ESLint
- `npx playwright test` — all E2E tests (existing + new)

## Testing Strategy Summary

| What | How | Where |
|---|---|---|
| Persistence utility logic | E2E via page.evaluate (localStorage manipulation) | persistence.spec.ts |
| Store restore() | Implicitly via recovery E2E flow | persistence.spec.ts |
| Recovery UI | Playwright interaction tests | persistence.spec.ts |
| Expiry logic | Inject expired timestamp, verify discard | persistence.spec.ts |
| Existing functionality | Run full test suite to catch regressions | workshop.spec.ts, streaming.spec.ts |
