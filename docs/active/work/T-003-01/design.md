# Design — T-003-01: frontend-dev-setup

## Problem

The frontend has complete scaffolding (config files, source files, tests, fixtures) but `node_modules/` doesn't exist and nothing has been verified to actually run. The task is to install dependencies and fix whatever breaks until all acceptance criteria pass.

## Approach options

### Option A: Install and fix incrementally

1. Run `npm install`
2. Run each tool (dev server, lint, format, check, test) one at a time
3. Fix issues as they surface
4. Re-run everything at the end

**Pros:** Low risk, easy to isolate problems, natural commit points.
**Cons:** Slightly slower if there are cascading issues.

### Option B: Install, run everything, batch-fix

1. Run `npm install`
2. Run all tools at once to collect all errors
3. Fix everything in one pass

**Pros:** Faster if things mostly work.
**Cons:** Harder to attribute errors to root causes. Cascading failures (e.g., missing `.svelte-kit/` dir) can produce misleading errors.

### Option C: Pin exact dependency versions first

1. Replace caret ranges with exact versions
2. Install
3. Verify

**Pros:** Fully reproducible.
**Cons:** Over-engineering for a dev-setup ticket. Lock file handles reproducibility. Upstream updates are valuable at this stage.

## Decision: Option A — incremental install and fix

**Rationale:** This is a setup ticket where the scaffolding was written without being tested. Issues will surface at each layer (install → build → lint → format → test), and each layer depends on the previous one. Incremental approach gives clear signal about what's broken and why. The commit history will be cleaner too.

## Execution order

The dependency chain dictates the verification order:

```
npm install
  → npm run dev             (verifies Vite + SvelteKit + Tailwind)
  → npm run check           (verifies TypeScript + Svelte types)
  → npm run lint            (verifies ESLint + plugins)
  → npm run format:check    (verifies Prettier + svelte plugin)
  → npx playwright install chromium
  → npm test                (verifies Playwright + mock webServer)
  → npm run dev:mock        (verifies mock API mode)
```

Each step either passes or reveals a specific config issue to fix.

## Anticipated fixes

Based on research, likely fixes by category:

### Dependency resolution

- Svelte 5 ecosystem is relatively new. If peer dependency conflicts arise, the fix is to align versions (e.g., ensure `eslint-plugin-svelte` is recent enough for Svelte 5).
- `@sveltejs/adapter-cloudflare@^4.0.0` may need `wrangler` as a peer dep — if so, add it.

### ESLint configuration

The flat config in `eslint.config.js` manually wires `@typescript-eslint/eslint-plugin` and `@typescript-eslint/parser`. This pattern works but may need adjustments:
- The `files: ['**/*.ts']` block doesn't cover `.svelte` files — Svelte files with `<script lang="ts">` need the TS parser too. The svelte plugin's flat config may handle this, but if not, we'll need to extend the TS config to `['**/*.ts', '**/*.svelte']`.
- May need `typescript-eslint` (the unified package) instead of the separate plugin+parser packages, depending on resolved versions.

### Prettier

Should work out of the box with the svelte plugin. If `format:check` fails on generated files (`.svelte-kit/`), ensure `.prettierignore` exists with appropriate entries.

### Playwright

- Browser install is a separate step (`npx playwright install chromium`)
- The webServer config runs `npm run build` first — any build failure blocks tests
- Tests are basic navigation tests, should pass once the server starts

### Build (vite build)

- Requires `svelte-kit sync` to generate `.svelte-kit/` directory
- The Cloudflare adapter needs the build to work — if it causes issues, we may need to add `wrangler` as a devDependency

## What we will NOT do

- Modify component stubs or implement features
- Implement the Svelte 5 runes store (that's a separate ticket)
- Add new tests
- Change the project structure
- Upgrade or downgrade framework versions unless required to fix a broken tool

## Success criteria mapping

Each acceptance criterion maps to a specific verification step:

| Criterion | Verification |
|---|---|
| `npm install` completes | Run it, check exit code |
| `npm run dev` starts on :5173 | Start server, check it responds |
| Landing page renders with Tailwind | Curl/visit localhost:5173, inspect styles |
| `npm run lint` runs | Run it, check exit code |
| `npm run format:check` runs | Run it, check exit code |
| `npx playwright install chromium` | Run it, check exit code |
| `npm test` passes | Run it, all 3 tests green |
| `npm run dev:mock` starts | Start it, check it responds |
