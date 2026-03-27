# T-007-04 Research: Extract Shared Component Utils

## Scope

Extract `moveLabel()` and `moveColors` from three components into `$lib/utils/moves.ts`.

## Current Duplication Map

### `moveColors` — identical `Record<MoveType, { bg: string; text: string }>` object

| File | Lines | Notes |
|------|-------|-------|
| `VariantCard.svelte` | 15–24 | Used via `$derived(moveColors[candidate.variant.moveType])` |
| `ClipBoard.svelte` | 12–21 | Used inline in template: `moveColors[candidate.variant.moveType].bg` |
| `ExportPanel.svelte` | — | **Not present** — ExportPanel only uses `moveLabel`, not `moveColors` |

All three definitions are byte-identical: same keys, same bg/text class pairs, same ordering.

### `moveLabel()` — identical `(move: MoveType) => string` function

| File | Lines | Notes |
|------|-------|-------|
| `VariantCard.svelte` | 26–31 | Called in template for move badge text |
| `ClipBoard.svelte` | 23–28 | Called in template for move badge text |
| `ExportPanel.svelte` | 17–22 | Called in markdown export generation |

All three definitions are byte-identical: split on `_`, title-case each word, join with space.

### `VariantGrid.svelte`

Does **not** contain either `moveLabel` or `moveColors`. It delegates to `VariantCard` for rendering, so it never needs direct access to move utilities. The ticket description mentions VariantGrid but the code contradicts this — VariantGrid is not affected.

## Type Dependencies

Both utilities depend on `MoveType` from `$lib/stores/session.svelte`. The type is:

```ts
export type MoveType =
  | 'narrowed' | 'broadened' | 'shifted_user' | 'reframed_constraint'
  | 'elevated_abstraction' | 'inverted' | 'combined' | 'decomposed';
```

The new utility file will need to import `MoveType` from the store.

## Existing Utils Directory

`frontend/src/lib/utils/` already exists with three files:
- `motion.ts` — transition helpers (prefers-reduced-motion)
- `turnstile.ts` — Cloudflare Turnstile integration
- `persistence.ts` — session persistence

Pattern: simple exported functions/constants, no default exports, no classes.

## Consumer Usage Patterns

### VariantCard.svelte
- `moveColors` assigned to local `const`, consumed via `$derived(moveColors[...])` → `colors.bg`, `colors.text`
- `moveLabel(candidate.variant.moveType)` in template

### ClipBoard.svelte
- `moveColors` used inline in template: `{moveColors[candidate.variant.moveType].bg}`
- `moveLabel(candidate.variant.moveType)` in template

### ExportPanel.svelte
- Only `moveLabel` — used in markdown generation: `` `Move: ${moveLabel(c.variant.moveType)}` ``
- No `moveColors` usage at all

## Test Coverage

Playwright tests exist in `frontend/tests/`. The key tests that exercise move badges:
- `streaming.spec.ts` — tests variant card rendering including move badges
- Any test that checks `data-testid="move-badge"` or `data-testid="clipboard-move-badge"`

No unit tests exist for `moveLabel` or `moveColors` directly.

## Constraints

- Svelte 5 runes: the components use `$props()`, `$state()`, `$derived()`. The utility file is plain TS — no rune concerns.
- The `MoveType` import path uses the `.svelte` extension in the store filename but TypeScript resolves it fine.
- Two concurrent agents work on this repo. This ticket is frontend-only and touches only component files + new utils file.

## Summary

Three files have duplication. Two share both `moveColors` and `moveLabel` (VariantCard, ClipBoard). One shares only `moveLabel` (ExportPanel). VariantGrid has neither. The extraction is straightforward: create `$lib/utils/moves.ts`, export both, update three imports.
