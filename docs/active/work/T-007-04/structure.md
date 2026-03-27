# T-007-04 Structure: Extract Shared Component Utils

## File Changes

### New File: `frontend/src/lib/utils/moves.ts`

```
Import: MoveType from '$lib/stores/session.svelte'

Export: moveColors — Record<MoveType, { bg: string; text: string }>
  - Same 8-entry object currently in VariantCard and ClipBoard

Export: moveLabel — (move: MoveType) => string
  - Same split/titlecase/join logic currently in VariantCard, ClipBoard, ExportPanel
```

No default export. Two named exports. Approximately 25 lines.

### Modified: `frontend/src/lib/components/VariantCard.svelte`

Script block changes:
- Add import: `import { moveLabel, moveColors } from '$lib/utils/moves';`
- Remove: local `moveColors` const (lines 15–24)
- Remove: local `moveLabel` function (lines 26–31)
- Keep: `MoveType` import from session store (still needed for the type in moveColors generic)

Actually, VariantCard does NOT import MoveType directly — it imports `HMWCandidate`, `CandidateStatus`, and `MoveType`. After extraction, `MoveType` is no longer needed in VariantCard since it was only used to type the local `moveColors` and `moveLabel`. Remove `MoveType` from the import.

Template: No changes. `moveLabel(...)` and `moveColors[...]` calls remain identical.

### Modified: `frontend/src/lib/components/ClipBoard.svelte`

Script block changes:
- Add import: `import { moveLabel, moveColors } from '$lib/utils/moves';`
- Remove: local `moveColors` const (lines 12–21)
- Remove: local `moveLabel` function (lines 23–28)
- Remove `MoveType` from session import (no longer needed locally)

Template: No changes.

### Modified: `frontend/src/lib/components/ExportPanel.svelte`

Script block changes:
- Add import: `import { moveLabel } from '$lib/utils/moves';`
- Remove: local `moveLabel` function (lines 17–22)
- Remove `MoveType` from session import (no longer needed locally)

Template: No changes.

### NOT Modified: `frontend/src/lib/components/VariantGrid.svelte`

Research confirmed VariantGrid does not use either utility. No changes needed.

## Module Dependency Graph (after change)

```
session.svelte.ts (exports MoveType)
       │
       ▼
  moves.ts (imports MoveType, exports moveLabel + moveColors)
       │
       ▼
  VariantCard.svelte ── imports { moveLabel, moveColors }
  ClipBoard.svelte ──── imports { moveLabel, moveColors }
  ExportPanel.svelte ── imports { moveLabel }
```

## Interface Contracts

```ts
// moves.ts public API
export function moveLabel(move: MoveType): string;
export const moveColors: Record<MoveType, { bg: string; text: string }>;
```

No changes to any component's public interface (props, events). This is purely an internal refactor.

## Ordering

1. Create `moves.ts` first (so imports resolve)
2. Update components in any order (independent changes)
3. Verify with `npm run check`, `npm run lint`, `npx playwright test`
