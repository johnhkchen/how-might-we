# Structure — T-003-02: session-store-svelte5

## File Changes

### 1. RENAME: `frontend/src/lib/stores/session.ts` → `frontend/src/lib/stores/session.svelte.ts`

Required for Svelte 5 runes (`$state`, `$derived`) to compile outside `.svelte` components.

**Before:** Types + TODO comment
**After:** Types + SessionStore class + singleton export

### 2. MODIFY: `frontend/tests/fixtures/persona.ts`

Update import path: `../../src/lib/stores/session` → `../../src/lib/stores/session.svelte`

### 3. MODIFY: `frontend/tests/fixtures/analysis.ts`

Same import path update.

### 4. MODIFY: `frontend/tests/fixtures/expansion.ts`

Same import path update.

### 5. MODIFY: `frontend/tests/fixtures/refinement.ts`

Same import path update.

---

## Module Structure: `session.svelte.ts`

```
┌─────────────────────────────────────────────────────┐
│  session.svelte.ts                                   │
│                                                       │
│  ── Type Exports (unchanged) ──────────────────────  │
│  export interface Persona { ... }                     │
│  export interface Constraint { ... }                  │
│  export interface ProblemContext { ... }               │
│  export interface HMWAnalysis { ... }                 │
│  export type MoveType = ...                           │
│  export interface HMWVariant { ... }                  │
│  export type CandidateStatus = ...                    │
│  export interface HMWCandidate { ... }                │
│  export interface SessionState { ... }                │
│                                                       │
│  ── SessionStore Class ────────────────────────────  │
│  class SessionStore {                                 │
│    // $state fields                                   │
│    persona = $state<Persona | null>(null)              │
│    problemContext = $state<ProblemContext | null>(null) │
│    analysis = $state<HMWAnalysis | null>(null)        │
│    candidates = $state<HMWCandidate[]>([])            │
│    iterationCount = $state(0)                         │
│    isStreaming = $state(false)                         │
│                                                       │
│    // $derived fields                                 │
│    clippedIds = $derived(...)                          │
│    clippedCandidates = $derived(...)                   │
│                                                       │
│    // Methods                                         │
│    setPersona(persona: Persona): void                 │
│    setContext(context: ProblemContext): void            │
│    setAnalysis(analysis: HMWAnalysis): void           │
│    addCandidates(variants: HMWVariant[]): void        │
│    updateCandidateStatus(id, status, userEdits?): void│
│    clipCandidate(id: string): void                    │
│    incrementIteration(): void                         │
│    startStreaming(): void                              │
│    stopStreaming(): void                               │
│    reset(): void                                      │
│  }                                                    │
│                                                       │
│  ── Singleton Export ──────────────────────────────  │
│  export const session = new SessionStore()             │
│                                                       │
└─────────────────────────────────────────────────────┘
```

---

## Public Interface

### Types (re-exported, unchanged)

All existing interfaces and types remain exported exactly as they are. No breaking changes for consumers.

### Store Singleton

```ts
import { session } from '$lib/stores/session';

// Read state (reactive in .svelte files)
session.persona
session.candidates
session.clippedIds
session.clippedCandidates
session.isStreaming
session.iterationCount

// Mutate state
session.setPersona(persona)
session.setContext(context)
session.setAnalysis(analysis)
session.addCandidates(variants)
session.updateCandidateStatus(id, status, userEdits?)
session.clipCandidate(id)
session.incrementIteration()
session.startStreaming()
session.stopStreaming()
session.reset()
```

---

## Internal Details

### `addCandidates(variants: HMWVariant[])`

Creates `HMWCandidate` objects:
```ts
const newCandidates = variants.map(variant => ({
  id: crypto.randomUUID(),
  variant,
  status: 'generated' as CandidateStatus,
}));
this.candidates = [...this.candidates, ...newCandidates];
```

Uses spread to create a new array reference, ensuring Svelte 5 reactivity triggers for array consumers.

### `updateCandidateStatus(id, status, userEdits?)`

```ts
this.candidates = this.candidates.map(c =>
  c.id === id ? { ...c, status, ...(userEdits !== undefined ? { userEdits } : {}) } : c
);
```

Immutable update pattern — creates new array and new candidate object. This is the safest approach for Svelte 5 reactivity with nested objects.

### `reset()`

Sets all `$state` fields back to initial values:
```ts
this.persona = null;
this.problemContext = null;
this.analysis = null;
this.candidates = [];
this.iterationCount = 0;
this.isStreaming = false;
```

---

## Ordering

1. Rename file (session.ts → session.svelte.ts)
2. Implement store class in renamed file
3. Update fixture import paths
4. Verify: `npm run check`, `npm run lint`

Changes are confined to the frontend track. No backend files touched.
