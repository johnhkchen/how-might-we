# Design — T-007-03: session-localstorage-persistence

## Decision: Where to Put Persistence Logic

### Option A: Inside SessionStore class
Add `save()` and static `load()` methods directly on `SessionStore`. The store calls `save()` internally after each mutation.

**Pros**: Self-contained. No external wiring needed.
**Cons**: Couples persistence to the store. Makes testing harder. `$effect` can't run inside a plain class — would need manual debouncing.

### Option B: External $effect in the workshop page
Use a reactive `$effect` in `+page.svelte` that watches store fields and saves.

**Pros**: Svelte-idiomatic. Automatic dependency tracking.
**Cons**: Ties persistence to a specific page. If other pages use the store, they won't persist.

### Option C: Persistence utility with explicit save points (CHOSEN)
Create a `persistence.ts` utility with `saveSession()` and `loadSession()` functions. The store gains a `restore()` method for hydrating from saved data. Saving is triggered by a `$effect` in the workshop page that debounces writes.

**Why**: Clean separation. The store doesn't know about localStorage. The page controls when saves happen. The utility is testable independently. If we need persistence elsewhere later, we import the same utility.

## Decision: What to Persist

### Store State (via `session.*`)
- `persona`, `problemContext`, `analysis`, `candidates`, `iterationCount`
- NOT `isStreaming` (transient)
- NOT `clippedIds` (derived from candidates)

### Page-Level State
- `personaDescription`, `domain`, `constraints`, `hmwStatement`
- `emergentTheme`
- `hasStreamStarted`, `hasAnalysisStarted`, `hasExpandStarted` — these are UI gates. Instead of persisting them, we **derive** them from restored state: if persona exists, stream has started; if analysis exists, analysis has started; etc.

### Saved Shape
```typescript
interface SavedSession {
  version: 1;
  savedAt: number; // Date.now()
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
```

A `version` field allows future migrations. `savedAt` enables the 24-hour expiry check.

## Decision: Debounce Strategy

Save on every meaningful change, debounced at 500ms. "Meaningful change" = any mutation to the store or page-level inputs that affect workshop progress.

Using a simple trailing-edge debounce (not leading). 500ms is fast enough to not lose work, slow enough to not thrash localStorage on rapid interactions.

**Rejected**: Save on specific method calls only — brittle, easy to miss new mutations.
**Rejected**: Save on `beforeunload` only — doesn't protect against crashes, tab kills, or mobile browser eviction.

## Decision: Recovery UI

### Option A: Modal dialog
Block interaction until user decides.

**Rejected**: Modals are heavy for this use case. User might just want to glance at the page.

### Option B: Top banner with Resume/Start Fresh buttons (CHOSEN)
Non-blocking, visible, dismissible. Shows timestamp of saved session. Appears at the top of the workshop page, above Stage 1.

**Why**: Low friction. User sees the prompt immediately, can decide, and the page is still navigable. Consistent with the existing banner patterns (rate limit, turnstile warning).

### Option C: Toast notification
**Rejected**: Too easy to miss. Too transient for a decision that matters.

## Decision: localStorage Key

Use a single key: `hmw-session`. One session per browser. If the user opens two tabs, they share the same saved state. This is acceptable — the tool is designed for one workshop at a time.

## Decision: Expiry

Sessions older than 24 hours are auto-discarded on load. The `savedAt` timestamp is checked when `loadSession()` runs. Expired sessions are removed from localStorage immediately.

## Decision: Restore Flow

1. `onMount` in workshop page calls `loadSession()`
2. If a valid, non-expired session exists, show recovery banner
3. "Resume" calls `session.restore(saved.store)` and sets page-level state
4. "Start fresh" calls `clearSession()` and proceeds normally
5. After either choice, banner disappears and auto-save $effect activates

The $effect for auto-saving should activate regardless of whether the user resumed or started fresh — once the page is loaded, all changes are saved.

## Decision: Store restore() Method

Add a `restore(data)` method to `SessionStore` that hydrates all fields. This is like the inverse of `reset()` — it bulk-sets all persistent fields in one go.

## Decision: UI Gate Derivation on Restore

Instead of persisting `hasStreamStarted`, `hasAnalysisStarted`, `hasExpandStarted`:
- After restore, set `hasStreamStarted = !!session.persona`
- After restore, set `hasAnalysisStarted = !!session.analysis`
- After restore, set `hasExpandStarted = session.candidates.length > 0`

This avoids persisting derived flags and ensures correctness.

## Compatibility with Mock Mode

No special handling needed. Persistence operates on the same store fields regardless of whether data came from the real API or mock fixtures. The `VITE_MOCK_API` flag doesn't affect localStorage.
