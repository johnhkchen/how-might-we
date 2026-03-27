# T-007-04 Review: Extract Shared Component Utils

## Summary

Extracted duplicate `moveLabel()` and `moveColors` utilities from three Svelte components into a shared module at `$lib/utils/moves.ts`. Pure refactor — no behavior changes.

## Files Changed

### Created
- `frontend/src/lib/utils/moves.ts` — 19 lines. Exports `moveColors` (Record mapping MoveType to Tailwind bg/text classes) and `moveLabel` (converts snake_case MoveType to Title Case string).

### Modified
- `frontend/src/lib/components/VariantCard.svelte` — Removed 17 lines (local `moveColors` + `moveLabel`). Added 1 import line. Removed `MoveType` from type import.
- `frontend/src/lib/components/ClipBoard.svelte` — Removed 17 lines (local `moveColors` + `moveLabel`). Added 1 import line. Removed `MoveType` from type import.
- `frontend/src/lib/components/ExportPanel.svelte` — Removed 6 lines (local `moveLabel`). Added 1 import line. Removed `MoveType` from type import.

### Not Modified
- `VariantGrid.svelte` — does not use either utility (delegates rendering to VariantCard). Ticket description mentioned it but research confirmed no duplication exists there.

## Net Impact

- ~40 lines of duplicated code removed across 3 files
- ~19 lines added in new shared utility
- Net reduction: ~21 lines
- 3 components now share a single source of truth for move type presentation

## Test Coverage

- **99/99 Playwright E2E tests pass** — no regressions
- Tests that exercise the extracted code:
  - Move badge rendering on variant cards (correct text labels = `moveLabel` works)
  - Move badge color classes (correct styling = `moveColors` works)
  - Clipboard move badges
  - Export panel markdown format includes move labels
- No new unit tests added — the utilities are simple, deterministic, and fully exercised by existing E2E tests

## Verification Results

| Check | Result |
|-------|--------|
| `npm run check` | 0 errors, 0 warnings |
| `npm run lint` | Clean |
| `npx playwright test` | 99/99 passed |
| Tailwind content scan | `.ts` files included in config |

## Acceptance Criteria Status

- [x] `moveLabel()` and `moveColors` extracted to `$lib/utils/moves.ts`
- [x] All components import from the shared utility instead of defining locally
- [x] No behavior change — same labels, same colors
- [x] All Playwright tests pass
- [x] `npm run check` and `npm run lint` pass

## Open Concerns

None. This is a straightforward deduplication with no edge cases or risks.
