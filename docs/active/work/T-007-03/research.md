# Research — T-007-03: session-localstorage-persistence

## Current Session State Architecture

The session store lives at `frontend/src/lib/stores/session.svelte.ts`. It's a Svelte 5 runes-based singleton class (`SessionStore`) exported as `export const session = new SessionStore()`.

### State Fields

| Field | Type | Default | Persistence Concern |
|---|---|---|---|
| `persona` | `Persona \| null` | `null` | Serializable as-is |
| `problemContext` | `ProblemContext \| null` | `null` | Serializable (contains Persona + Constraint[]) |
| `analysis` | `HMWAnalysis \| null` | `null` | Serializable as-is |
| `candidates` | `HMWCandidate[]` | `[]` | Serializable (objects with string/number/enum fields) |
| `iterationCount` | `number` | `0` | Serializable as-is |
| `isStreaming` | `boolean` | `false` | **Should NOT persist** — transient UI state |

### Derived Fields (not stored directly)

- `clippedIds`: `Set<string>` — derived from `candidates.filter(c => c.status === 'clipped')`. This is **computed**, not stored. The ticket mentions Set serialization but since `clippedIds` is derived from `candidates`, we only need to persist `candidates`.
- `clippedCandidates`: derived from `candidates` array.

### Key Insight: clippedIds Is Derived

The ticket's AC says "`Set<string>` (clippedIds) serialized/deserialized correctly". But `clippedIds` is a `$derived` field computed from `candidates`. We don't need to serialize/deserialize it at all — restoring `candidates` automatically restores `clippedIds`.

## Workshop Page State (Non-Store)

`frontend/src/routes/workshop/+page.svelte` has significant local component state:

| Variable | Type | Persistence Concern |
|---|---|---|
| `personaDescription` | `string` | User's raw text input — should persist |
| `domain` | `string` | User's domain input — should persist |
| `constraints` | `Constraint[]` | User's local constraints — should persist |
| `hmwStatement` | `string` | User's HMW statement — should persist |
| `hasStreamStarted` | `boolean` | UI gate — derives from whether persona exists |
| `hasAnalysisStarted` | `boolean` | UI gate — derives from whether analysis exists |
| `hasExpandStarted` | `boolean` | UI gate — derives from whether candidates exist |
| `emergentTheme` | `string \| null` | From expand — should persist |
| Streaming/error state | various | Transient — do NOT persist |

## Data Flow and Mutation Points

State changes happen through `SessionStore` methods:
- `setPersona()`, `setContext()`, `setAnalysis()` — set once after streaming completes
- `addCandidates()` — appends after expand/refine streaming
- `updateCandidateStatus()` / `clipCandidate()` — user interactions (frequent)
- `incrementIteration()` — once per refine cycle
- `reset()` — clears everything

"Meaningful change" (for debounced saves) = any of these method calls completing.

## localStorage Constraints

- **Storage limit**: ~5-10MB across all origins. Our data is small (<50KB even with many candidates).
- **Sync API**: `localStorage.getItem/setItem` are synchronous, blocking the main thread. Fine for our data size but debouncing prevents excessive writes.
- **SSR safety**: SvelteKit can run on server. Must guard with `typeof window !== 'undefined'` or use `onMount`.
- **JSON-only**: No native Set/Map support. Since `clippedIds` is derived, this isn't an issue.

## Mock Mode Compatibility

Mock mode is controlled by `VITE_MOCK_API=true` in the environment, affecting `apiFetch` in `client.ts`. It's transparent to the session store — data flows through the same `session.*` methods regardless of mock mode. Persistence is completely decoupled from API layer.

## Existing Recovery/Reset Patterns

The store has a `reset()` method that sets everything back to defaults. No existing persistence, no existing recovery UI, no existing localStorage usage in the frontend.

## Session Token

`frontend/src/lib/api/client.ts` generates a random `sessionToken = crypto.randomUUID()` for rate limiting. This is intentionally per-page-load and should NOT be restored from localStorage (would defeat rate limiting).

## Key Files That Will Be Touched

1. `frontend/src/lib/stores/session.svelte.ts` — add persistence logic
2. `frontend/src/routes/workshop/+page.svelte` — add recovery prompt UI, persist local state
3. Possibly a new utility: `frontend/src/lib/utils/persistence.ts` — debounce + localStorage helpers

## Constraints and Boundaries

- Backend is stateless. All persistence is frontend-only.
- No other tickets in S-007 depend on this one (it's the last in the chain).
- T-007-02 (Turnstile failure handling) is the dependency — already `done`.
- Two concurrent agents: this is a frontend-only ticket, no backend files touched.

## Open Questions for Design

1. Where to put the debounced save — inside the store class or as an external $effect?
2. How to handle the recovery prompt — modal dialog, inline banner, or page overlay?
3. What key to use in localStorage — fixed string or include some identifier?
4. How to restore page-level state (personaDescription, domain, hmwStatement) that lives outside the store?
