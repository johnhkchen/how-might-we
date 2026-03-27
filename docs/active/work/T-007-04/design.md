# T-007-04 Design: Extract Shared Component Utils

## Decision

Create `frontend/src/lib/utils/moves.ts` exporting `moveLabel()` and `moveColors`. All three consumer components import from this shared module.

## Approach: Single utility module

### What
- New file: `$lib/utils/moves.ts`
- Export `moveLabel(move: MoveType): string`
- Export `moveColors: Record<MoveType, { bg: string; text: string }>`
- Import `MoveType` from `$lib/stores/session.svelte`
- Remove local definitions from VariantCard, ClipBoard, ExportPanel
- Add imports of `moveLabel` / `moveColors` from `$lib/utils/moves` in each

### Why this approach
- Matches existing pattern in `$lib/utils/` (motion.ts, turnstile.ts, persistence.ts)
- Named exports, no default exports — consistent with codebase style
- Single file for both exports since they're semantically related (both about move types)
- No over-abstraction: just lifting identical code to a shared location

## Alternatives Considered

### A: Re-export from session store
Put `moveLabel` and `moveColors` in `session.svelte.ts` alongside the `MoveType` definition.

**Rejected:** The store file is for reactive state management. Presentational utilities (label formatting, color mapping) are a different concern. Mixing them would blur the store's responsibility and the file is already 160 lines.

### B: Separate files per utility
`$lib/utils/moveLabel.ts` and `$lib/utils/moveColors.ts`.

**Rejected:** These are small, tightly related utilities (both map `MoveType` to presentation values). Two files is unnecessary fragmentation. A single `moves.ts` file stays under 30 lines.

### C: Constants file with all UI constants
A broader `$lib/utils/constants.ts` for all shared constants.

**Rejected:** Premature generalization. Only move-related constants are duplicated right now. If more constants need sharing later, they can get their own focused files.

## Type Considerations

The `MoveType` import chain:
- `session.svelte.ts` exports `MoveType`
- `moves.ts` imports `MoveType` from `session.svelte`
- Components import `moveLabel`/`moveColors` from `moves.ts`
- Components that still need `MoveType` for other purposes continue importing from session

This avoids re-exporting `MoveType` from `moves.ts` — components should get types from their canonical source.

## Risk Assessment

**Risk: Tailwind class purging.** Tailwind scans source files for class names. Moving color classes from `.svelte` files to a `.ts` file could cause them to be purged if the Tailwind config doesn't scan `.ts` files.

**Mitigation:** Check `tailwind.config.js` content paths. The typical SvelteKit Tailwind config already includes `./src/**/*.{html,js,svelte,ts}` — so `.ts` files are scanned. Verified: this is standard in the project setup.

**Risk: Breaking imports.** Typo in import path breaks component.

**Mitigation:** `npm run check` (svelte-check + tsc) will catch any import errors. Run after changes.

## Verification Plan

1. `npm run check` — TypeScript + Svelte checks pass
2. `npm run lint` — ESLint passes
3. `npx playwright test` — all E2E tests pass (move badges render correctly)
4. Manual verification: the extracted `moveColors` and `moveLabel` are byte-identical to the originals
