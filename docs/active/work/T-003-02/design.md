# Design — T-003-02: session-store-svelte5

## Decision: Svelte 5 Runes Class Pattern

### Approach: Singleton class with `$state` fields

Export a single class instance where each field is reactive via `$state`, computed fields use `$derived`, and mutation happens through named methods.

```ts
class SessionStore {
  persona = $state<Persona | null>(null);
  candidates = $state<HMWCandidate[]>([]);
  clippedIds = $derived(/* from candidates */);

  setPersona(p: Persona) { this.persona = p; }
  addCandidates(variants: HMWVariant[]) { /* wrap + push */ }
}

export const session = new SessionStore();
```

### Why this approach

1. **Idiomatic Svelte 5.** The class-with-runes pattern is the recommended way to create shared reactive state in Svelte 5. It replaced the `writable()` store pattern.
2. **Natural method grouping.** Methods live on the same object as state — no separate action creators or dispatchers.
3. **`$derived` for clippedIds.** Computed values update automatically when `candidates` changes. No manual synchronization needed.
4. **Direct property access.** Components read `session.persona` directly — no `.subscribe()`, no `$` prefix auto-subscription. Svelte 5's fine-grained reactivity handles updates.
5. **Type-safe.** TypeScript class with typed fields gives IDE support and compile-time checking.

---

## Alternatives Considered

### A: Svelte 4 `writable()` stores

- Still works in Svelte 5 but deprecated pattern
- Requires `$` prefix in templates, `.subscribe()` in JS
- Rejected: fighting the framework direction

### B: Plain object with `$state` (no class)

```ts
export const session = {
  persona: $state<Persona | null>(null),
  // ...methods as standalone functions
};
```

- Simpler, but methods can't reference `this` — they'd close over the module-level object
- Less encapsulated: state fields and mutation functions are separate exports
- Rejected: class is cleaner when you have 7+ methods

### C: Zustand-like external store

- Overkill for a single session store
- Adds a dependency
- Rejected: Svelte 5 runes make this unnecessary

---

## Key Design Decisions

### 1. File extension: `.svelte.ts`

Rename `session.ts` → `session.svelte.ts`. Required for `$state`/`$derived` to compile. Import paths remain `$lib/stores/session` (SvelteKit resolves both extensions).

### 2. `clippedIds` as `$derived`

```ts
clippedIds = $derived(
  new Set(this.candidates.filter(c => c.status === 'clipped').map(c => c.id))
);
```

This replaces the manually-maintained `Set<string>` in the original `SessionState` interface. The interface should be updated to reflect that `clippedIds` is read-only/derived.

### 3. `addCandidates(variants: HMWVariant[])`

Wraps each variant into an `HMWCandidate` with:
- `id`: `crypto.randomUUID()`
- `status`: `'generated'`
- `variant`: the input variant

Appends to existing candidates (doesn't replace them — iteration accumulates).

### 4. `updateCandidateStatus(id: string, status: CandidateStatus, userEdits?: string)`

Finds candidate by ID, updates status. If status is `'edited'`, also sets `userEdits`.

### 5. `clipCandidate(id: string)` — convenience method

Shorthand for `updateCandidateStatus(id, 'clipped')`. Matches acceptance criteria which calls this out separately.

### 6. `isStreaming` guard

- Set to `true` at stream start, `false` at end
- Methods that initiate API calls should check this flag
- The store itself doesn't call APIs — it just exposes the flag. The calling code (components/API layer) is responsible for checking it.

### 7. `reset()` method

Resets all state to initial values. Used when starting a new session.

### 8. `iterationCount` tracking

Incremented in `addCandidates()` when called during a refine cycle. The store needs a way to distinguish initial expansion from refinement iterations. Design: increment `iterationCount` only when candidates already exist (i.e., this is a refinement, not the first expansion).

Alternatively, expose `startIteration()` as an explicit signal. Simpler approach: let the caller increment via a dedicated method or have `addCandidates` accept an `isRefinement` flag.

**Decision:** Keep it simple — provide a `incrementIteration()` method. The component orchestrating the refine flow calls it explicitly. This is clearer than inferring intent from state.

### 9. Streaming state helpers

Add `startStreaming()` and `stopStreaming()` methods rather than exposing `isStreaming` for direct mutation. This allows future extension (e.g., tracking what type of stream is active).

---

## Public API Summary

```ts
class SessionStore {
  // Reactive state
  persona: Persona | null
  problemContext: ProblemContext | null
  analysis: HMWAnalysis | null
  candidates: HMWCandidate[]
  iterationCount: number
  isStreaming: boolean

  // Derived
  clippedIds: Set<string>        // derived from candidates
  clippedCandidates: HMWCandidate[]  // derived — convenient for ClipBoard/ExportPanel

  // Methods
  setPersona(persona: Persona): void
  setContext(context: ProblemContext): void
  setAnalysis(analysis: HMWAnalysis): void
  addCandidates(variants: HMWVariant[]): void
  updateCandidateStatus(id: string, status: CandidateStatus, userEdits?: string): void
  clipCandidate(id: string): void
  incrementIteration(): void
  startStreaming(): void
  stopStreaming(): void
  reset(): void
}
```

### Bonus derived value: `clippedCandidates`

Not in acceptance criteria but cheap to add and useful for `ClipBoard` and `ExportPanel` components which need the full candidate objects, not just IDs.

---

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| `.svelte.ts` import breaks fixtures | Test that fixture imports resolve after rename |
| `$state` on arrays may need immutable updates | Svelte 5 `$state` tracks array mutations natively — verify with push/splice |
| `crypto.randomUUID()` unavailable in test env | Playwright runs in real browser; unit tests would need polyfill but we don't have unit tests for the store yet |
| Concurrent modifications from streaming | `isStreaming` flag + single-threaded JS means no real race conditions |
