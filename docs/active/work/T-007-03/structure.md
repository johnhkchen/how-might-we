# Structure — T-007-03: session-localstorage-persistence

## Files Modified

### 1. `frontend/src/lib/utils/persistence.ts` (NEW)

Persistence utility — all localStorage interaction lives here.

```
Exports:
  STORAGE_KEY = 'hmw-session'
  MAX_AGE_MS = 24 * 60 * 60 * 1000  (24 hours)

  interface SavedSession {
    version: 1;
    savedAt: number;
    store: {
      persona: Persona | null;
      problemContext: ProblemContext | null;
      analysis: HMWAnalysis | null;
      candidates: HMWCandidate[];
      iterationCount: number;
    };
    page: {
      personaDescription: string;
      domain: string;
      constraints: Constraint[];
      hmwStatement: string;
      emergentTheme: string | null;
    };
  }

  saveSession(data: SavedSession['store'], page: SavedSession['page']): void
    - Writes JSON to localStorage under STORAGE_KEY
    - Stamps savedAt = Date.now(), version = 1

  loadSession(): SavedSession | null
    - Reads from localStorage
    - Returns null if: missing, parse error, wrong version, expired (>24h)
    - Removes stale entry from localStorage on expiry

  clearSession(): void
    - Removes STORAGE_KEY from localStorage
```

No dependencies beyond the type imports from `session.svelte.ts`.

### 2. `frontend/src/lib/stores/session.svelte.ts` (MODIFIED)

Add one method to SessionStore:

```
  restore(data: SavedSession['store']): void
    - Sets persona, problemContext, analysis, candidates, iterationCount
    - Does NOT touch isStreaming (remains false)
    - clippedIds auto-derives from restored candidates
```

Also export the inner types needed by `persistence.ts` (they already are — `Persona`, `ProblemContext`, `HMWAnalysis`, `HMWCandidate`, `Constraint` are all exported).

### 3. `frontend/src/routes/workshop/+page.svelte` (MODIFIED)

Changes within `<script>`:

1. **Import** `saveSession`, `loadSession`, `clearSession` from `$lib/utils/persistence`
2. **Recovery state**: new `$state` variables:
   - `savedSession: SavedSession | null = null` — holds loaded session for the prompt
   - `showRecovery: boolean = false` — controls banner visibility
3. **onMount addition**: call `loadSession()`, if non-null set `savedSession` and `showRecovery = true`
4. **resumeSession()**: restore store + page state from `savedSession`, set UI gate flags, clear recovery banner
5. **startFresh()**: call `clearSession()`, clear recovery banner
6. **Auto-save $effect**: reactive effect that reads all persistent store + page fields and debounced-writes to localStorage via `saveSession()`. Uses a `setTimeout`/`clearTimeout` pattern for 500ms debounce.

Changes within template:

7. **Recovery banner**: above Stage 1, conditionally rendered when `showRecovery === true`. Shows saved timestamp and two buttons: "Resume previous session" and "Start fresh". Styled like existing warning banners (amber/blue border, rounded, padding).

### 4. `frontend/tests/persistence.spec.ts` (NEW)

Playwright E2E tests for persistence:

- Save/load round-trip in localStorage
- 24-hour expiry discards old sessions
- "Resume" restores full state (persona, analysis, candidates visible)
- "Start fresh" clears localStorage and shows empty form
- Recovery banner not shown on fresh visit
- Works with mock mode (VITE_MOCK_API=true, which Playwright already uses)

## Files NOT Modified

- `backend/` — no backend changes
- `frontend/src/lib/api/` — persistence is decoupled from API layer
- `frontend/src/lib/components/` — no component changes needed
- `frontend/src/routes/+page.svelte` — landing page unaffected
- `frontend/src/app.html` — no HTML changes
- `worker/` — no worker changes

## Module Boundaries

```
persistence.ts  <-- pure functions, no Svelte dependency
     |
     v reads/writes types from
session.svelte.ts  <-- store class, gains restore() method
     |
     v consumed by
+page.svelte  <-- orchestrates save/load/recovery UI
```

## Change Ordering

1. Create `persistence.ts` (no dependencies to satisfy)
2. Add `restore()` to `session.svelte.ts` (depends on types only)
3. Update `+page.svelte` (depends on 1 + 2)
4. Add tests (depends on 3)

## Component Boundary: Recovery Banner

The recovery banner is simple enough (3-4 lines of HTML) to live inline in `+page.svelte`. No need for a separate component.
