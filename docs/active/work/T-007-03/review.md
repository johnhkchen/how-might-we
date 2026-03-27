# Review — T-007-03: session-localstorage-persistence

## Summary of Changes

### Files Created
| File | Purpose |
|---|---|
| `frontend/src/lib/utils/persistence.ts` | localStorage save/load/clear with 24h expiry and version stamping |
| `frontend/tests/persistence.spec.ts` | 10 Playwright E2E tests covering all persistence flows |

### Files Modified
| File | Change |
|---|---|
| `frontend/src/lib/stores/session.svelte.ts` | Added `restore()` method to SessionStore |
| `frontend/src/routes/workshop/+page.svelte` | Recovery banner, auto-save $effect, resume/startFresh handlers |

### Files NOT Modified
Backend, worker, components, landing page, API layer — all untouched.

## Acceptance Criteria Coverage

| Criterion | Status | Implementation |
|---|---|---|
| Auto-save on meaningful change (debounced) | Done | `$effect` with 500ms debounce in workshop page |
| Recovery prompt on page load | Done | Blue banner with "Resume" / "Start fresh" buttons |
| Resume restores full state | Done | `session.restore()` + page-level state + UI gate flags |
| Start fresh clears saved session | Done | `clearSession()` removes localStorage key |
| 24-hour auto-discard | Done | `loadSession()` checks `savedAt` vs `MAX_AGE_MS` |
| Set<string> serialization | Done | `clippedIds` is derived from `candidates` — no serialization needed |
| Works with mock mode | Done | Persistence is decoupled from API layer; tested under VITE_MOCK_API=true |

## Test Coverage

**10 new E2E tests** in `persistence.spec.ts`:

- **Recovery banner visibility**: 3 tests (fresh visit, saved session, expired session)
- **Resume flow**: 2 tests (persona restore, full state through expand with clipboard)
- **Start fresh flow**: 1 test
- **Auto-save**: 2 tests (text input debounced save, streaming completion save)
- **Corrupt data resilience**: 2 tests (invalid JSON, wrong version)

**Full suite**: 99 tests pass, 0 failures.

### Test gaps
- No test for multi-tab behavior (two tabs writing to the same key). Acceptable: the tool is designed for single-session use.
- No test for localStorage quota exhaustion. The `saveSession` try/catch handles this silently.
- No test for `beforeunload` (saves happen debounced, so there's a theoretical ~500ms window of data loss on hard close). This is an inherent limitation of debounced saves and is acceptable for this use case.

## Architecture Decisions

1. **Persistence is external to the store.** `SessionStore` doesn't know about localStorage. The workshop page orchestrates save/load via the persistence utility. This keeps the store testable and the persistence concern isolated.

2. **UI gate flags are derived, not persisted.** Instead of storing `hasStreamStarted`, `hasAnalysisStarted`, `hasExpandStarted`, they're set from restored store state: `!!persona`, `!!analysis`, `candidates.length > 0`. Eliminates a class of staleness bugs.

3. **`persistenceReady` flag prevents premature saves.** The auto-save effect is gated on `persistenceReady`, which is only set after the user makes a recovery decision (or immediately on fresh visit). This prevents the empty initial state from overwriting a valid saved session.

4. **Single localStorage key.** One session at a time. Multiple tabs share the same saved state. Acceptable for the tool's design.

## Open Concerns

1. **Session token not restored.** The rate-limit session token (`crypto.randomUUID()` in `client.ts`) is per-page-load by design. After resume, the user gets a fresh session token. This means rate limit counters reset on reload — which is the existing behavior and not worsened by this change.

2. **Streaming-in-progress state.** If the user refreshes mid-stream, the saved state will have whatever partial data was committed. For persona/analysis this means null (they're set atomically after streaming completes). For candidates, partially-streamed variants that passed the completeness gate will be saved. This is acceptable — the user sees whatever was committed before the refresh.

3. **No versioned migration path.** The `version: 1` field allows future migrations, but no migration logic exists yet. If the `SavedSession` shape changes, old sessions will be discarded (wrong version check). This is fine for now.
