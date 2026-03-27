# T-007-04 Plan: Extract Shared Component Utils

## Steps

### Step 1: Create `$lib/utils/moves.ts`

Create `frontend/src/lib/utils/moves.ts` with:
- Import `MoveType` from `$lib/stores/session.svelte`
- Export `moveColors` const (copy from VariantCard.svelte lines 15–24)
- Export `moveLabel` function (copy from VariantCard.svelte lines 26–31)

Verify: `npm run check` passes (new file compiles).

### Step 2: Update VariantCard.svelte

- Add `import { moveLabel, moveColors } from '$lib/utils/moves';`
- Remove local `moveColors` definition (lines 15–24)
- Remove local `moveLabel` function (lines 26–31)
- Remove `MoveType` from the session import (only `HMWCandidate` and `CandidateStatus` remain)

Verify: `npm run check` passes.

### Step 3: Update ClipBoard.svelte

- Add `import { moveLabel, moveColors } from '$lib/utils/moves';`
- Remove local `moveColors` definition (lines 12–21)
- Remove local `moveLabel` function (lines 23–28)
- Remove `MoveType` from the session import (only `HMWCandidate` remains)

Verify: `npm run check` passes.

### Step 4: Update ExportPanel.svelte

- Add `import { moveLabel } from '$lib/utils/moves';`
- Remove local `moveLabel` function (lines 17–22)
- Remove `MoveType` from the session import (only `HMWCandidate` and `ProblemContext` remain)

Verify: `npm run check` passes.

### Step 5: Verify Tailwind class scanning

Check `tailwind.config.js` to confirm `.ts` files under `src/` are in the content paths, ensuring `moveColors` class strings aren't purged.

### Step 6: Full verification

- `npm run check` — TypeScript + Svelte checks
- `npm run lint` — ESLint
- `npx playwright test` — E2E tests (move badges render, clipboard works, export works)

## Testing Strategy

No new unit tests needed — `moveLabel` and `moveColors` are simple, deterministic, and fully exercised by existing Playwright tests that verify:
- Move badges render with correct text (covers `moveLabel`)
- Move badges have correct styling classes (covers `moveColors`)
- Clipboard items display move badges
- Export includes move type labels

If any Playwright test fails after the extraction, it indicates a regression.

## Rollback

If something breaks unexpectedly: revert component changes (restore local definitions) and delete `moves.ts`. Each step is independently revertible.
