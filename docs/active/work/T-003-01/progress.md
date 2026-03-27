# Progress — T-003-01: frontend-dev-setup

## Completed steps

### Step 1: Install dependencies ✅

- **Problem:** `npm install` failed with `ERESOLVE` — `@sveltejs/vite-plugin-svelte@^4.0.0` requires Vite 5 but `vite@^6.0.0` was specified.
- **Fix:** Updated `@sveltejs/vite-plugin-svelte` from `^4.0.0` to `^5.0.0` (supports Vite 6 + Svelte 5).
- **Also added:** `"type": "module"` to `package.json` — required because `@sveltejs/kit` is ESM-only and Vite's config loader was falling back to `require()`.
- **Result:** `npm install` succeeds. 305 packages installed.

### Step 2: Dev server ✅

- Server starts on :5173 after the ESM fix.
- Landing page renders with full Tailwind CSS (utility classes in style tag confirmed via curl).
- No startup errors.

### Step 3: TypeScript / svelte-check ✅

- **Problem:** `tests/fixtures/analysis.ts:38` had `solutionBias: null` but `HMWAnalysis.solutionBias` is typed as `string | undefined`.
- **Fix:** Changed `null` to `undefined`.
- **Result:** 0 errors, 0 warnings across 173 files.

### Step 4: ESLint ✅

- **Problem:** 20 `no-undef` errors — flat config lacked browser/node globals, and `no-undef` fires on TS files where TypeScript handles undefined variable checks natively.
- **Fix:**
  - Added `globals` package as devDependency.
  - Added browser globals to base ESLint config.
  - Added node globals for config files (`*.config.ts`, `*.config.js`).
  - Disabled `no-undef` rule for TypeScript files (standard practice with TS).
- **Result:** Clean lint pass.

### Step 5: Prettier ✅

- **Problem:** `format:check` failed on generated directories (`.svelte-kit/`, `playwright-report/`, `test-results/`) and reformatted fixture files.
- **Fix:**
  - Created `.prettierignore` excluding `.svelte-kit`, `build`, `node_modules`, `package-lock.json`, `playwright-report`, `test-results`.
  - Ran `npm run format` to format source files.
- **Result:** All files pass format check.

### Step 6: Playwright browser ✅

- `npx playwright install chromium` completed successfully.

### Step 7: Playwright tests ✅

- All 3 tests pass (5.4s):
  - Landing page: shows title and start button
  - Landing page: navigates to workshop page
  - Workshop page: shows workshop header

### Step 8: Mock dev mode ✅

- `npm run dev:mock` starts successfully with `VITE_MOCK_API=true`.
- Server responds on :5173 (or next available port).

### Step 9: Final verification ✅

- `npm run lint` — clean
- `npm run format:check` — clean
- `npm run check` — 0 errors, 0 warnings
- `npm test` — 3/3 tests pass

## Deviations from plan

1. **Added `globals` package** — not anticipated in the plan. Required for ESLint flat config to know about browser/node globals.
2. **Added `"type": "module"` to package.json** — not anticipated. Required for ESM-only SvelteKit to load via Vite.
3. **Created `.prettierignore`** — anticipated as "likely" in structure.md. Required to exclude generated directories.
4. **Prettier reformatted fixture files** — the 4 fixture files under `tests/fixtures/` were reformatted by Prettier (mostly trailing commas and line wrapping). This is a cosmetic-only change.

## Files changed

| File | Change type | Description |
|---|---|---|
| `package.json` | Modified | Added `"type": "module"`, bumped `@sveltejs/vite-plugin-svelte` to `^5.0.0`, added `globals` devDep |
| `package-lock.json` | Generated | Created by npm install |
| `eslint.config.js` | Modified | Added globals import, browser/node globals, disabled `no-undef` for TS |
| `.prettierignore` | Created | Exclude generated directories from formatting |
| `tests/fixtures/analysis.ts` | Modified | `null` → `undefined` for `solutionBias`, Prettier reformatting |
| `tests/fixtures/expansion.ts` | Modified | Prettier reformatting only |
| `tests/fixtures/persona.ts` | Modified | Prettier reformatting only |
| `tests/fixtures/refinement.ts` | Modified | Prettier reformatting only |

## Remaining work

None. All acceptance criteria met.
