# Research — T-003-01: frontend-dev-setup

## Objective

Map the current state of the frontend scaffolding and identify what must be fixed or configured for the dev environment to be fully operational.

## Environment

- **Node.js:** v23.3.0
- **npm:** 11.11.0
- **OS:** macOS (Darwin 25.3.0)
- `node_modules/` does not exist — dependencies have never been installed.

## Project scaffolding inventory

### Root config files (all present)

| File | Purpose | Status |
|---|---|---|
| `package.json` | Dependencies, scripts | Present, well-defined |
| `svelte.config.js` | SvelteKit + Cloudflare adapter | Present |
| `vite.config.ts` | Vite + API proxy to :8080 | Present |
| `tailwind.config.js` | Tailwind content paths | Present |
| `postcss.config.js` | PostCSS with Tailwind + Autoprefixer | Present |
| `tsconfig.json` | Extends `.svelte-kit/tsconfig.json` | Present |
| `eslint.config.js` | Flat config: JS recommended + Svelte + TS | Present |
| `.prettierrc` | Tabs, single quotes, svelte plugin | Present |
| `playwright.config.ts` | Tests dir, mock webServer, chromium only | Present |

### Dependencies (package.json devDependencies)

All dependencies use caret ranges:

- **Framework:** `svelte@^5.0.0`, `@sveltejs/kit@^2.0.0`, `@sveltejs/vite-plugin-svelte@^4.0.0`
- **Build:** `vite@^6.0.0`, `@sveltejs/adapter-cloudflare@^4.0.0`
- **Styling:** `tailwindcss@^3.4.0`, `postcss@^8.4.0`, `autoprefixer@^10.4.0`
- **Linting:** `eslint@^9.0.0`, `eslint-plugin-svelte@^2.0.0`, `@typescript-eslint/eslint-plugin@^8.0.0`, `@typescript-eslint/parser@^8.0.0`
- **Formatting:** `prettier@^3.0.0`, `prettier-plugin-svelte@^3.0.0`
- **Testing:** `@playwright/test@^1.48.0`
- **Types:** `typescript@^5.0.0`, `svelte-check@^4.0.0`

No production dependencies — expected for a SvelteKit app where everything is a devDependency.

### Source files (src/)

```
src/
├── app.html              # Root HTML template (favicon, sveltekit placeholders)
├── app.css               # @tailwind base/components/utilities
├── routes/
│   ├── +layout.svelte    # Root layout (imports app.css, Svelte 5 $props())
│   ├── +page.svelte      # Landing page (heading, CTA link to /workshop)
│   └── workshop/
│       └── +page.svelte  # Workshop skeleton (header + placeholder text)
└── lib/
    ├── api/
    │   ├── client.ts     # Real/mock fetch switch based on VITE_MOCK_API
    │   ├── mock.ts       # SSE stream simulator using test fixtures
    │   └── stream.ts     # Generic SSE consumer (streamFromAPI<T>)
    ├── stores/
    │   └── session.ts    # Type definitions only — no store implementation yet
    └── components/
        ├── PersonaCard.svelte
        ├── ConstraintList.svelte
        ├── AnalysisPanel.svelte
        ├── VariantCard.svelte
        ├── VariantGrid.svelte
        ├── ClipBoard.svelte
        └── ExportPanel.svelte   # All stubs/placeholders
```

### Tests

```
tests/
├── workshop.spec.ts      # 3 Playwright E2E tests (landing page + workshop navigation)
└── fixtures/
    ├── index.ts           # Re-exports all fixture data
    ├── persona.ts         # 6 progressive partials for persona streaming
    ├── analysis.ts        # 5 progressive partials for HMW analysis
    ├── expansion.ts       # 4 progressive partials for variant expansion
    └── refinement.ts      # 3 progressive partials for refinement loop
```

### Scripts (package.json)

| Script | Command | Notes |
|---|---|---|
| `dev` | `vite dev` | Standard SvelteKit dev |
| `dev:mock` | `VITE_MOCK_API=true vite dev` | Mock mode for frontend-only dev |
| `build` | `vite build` | Production build |
| `preview` | `vite preview` | Serve production build locally |
| `check` | `svelte-kit sync && svelte-check` | Type checking |
| `lint` | `eslint .` | Linting |
| `format:check` | `prettier --check .` | Formatting check |
| `test` | `npx playwright test` | E2E tests (uses mock webServer) |

## Potential issues to investigate during implementation

### 1. ESLint flat config compatibility

The ESLint config uses flat config format (`eslint.config.js`) with ESLint 9+. It imports `@typescript-eslint/eslint-plugin` directly as a flat config plugin. The Svelte plugin uses `svelte.configs['flat/recommended']`. This _should_ work, but ESLint plugin compatibility with flat config is a known area of friction — need to verify after install.

### 2. Svelte 5 + eslint-plugin-svelte version

`eslint-plugin-svelte@^2.0.0` — need to confirm this version supports Svelte 5 components with runes syntax (`$props()`, `{@render}`). Newer versions (2.35+) should work.

### 3. Playwright browser installation

`@playwright/test` installs the library but NOT the browser binaries. A separate `npx playwright install chromium` is needed. The acceptance criteria call this out explicitly.

### 4. Tailwind processing chain

`app.css` → PostCSS (tailwindcss + autoprefixer) → Vite. The content paths in `tailwind.config.js` match the source layout. This should work once dependencies are installed.

### 5. TypeScript path resolution

`tsconfig.json` extends `.svelte-kit/tsconfig.json` which won't exist until `svelte-kit sync` runs (part of `npm run check`). The `$lib` alias is configured there. First `npm run dev` or `npm run check` will generate it.

### 6. Cloudflare adapter

`@sveltejs/adapter-cloudflare@^4.0.0` — needed for `npm run build`. If this causes issues during dev, it's not blocking since `vite dev` doesn't use the adapter. But `npm run build` (used by Playwright's webServer) does.

### 7. apiFetch initialization timing

In `client.ts`, `apiFetch` is assigned eagerly at module level via `getApiFetch()`. The `import.meta.env.VITE_MOCK_API` check happens at import time. This is fine for Vite's static env replacement but worth noting.

## Constraints

- This is a dev-setup ticket — no new features, no new files. Fix configuration issues only.
- The ticket scope is "make it run", not "make it perfect". Stub components and TODO stores are out of scope.
- Two concurrent agents work on this repo — this ticket is frontend-only and should not touch backend files.

## Summary

The scaffolding is comprehensive and well-structured. The most likely failure modes are:
1. Dependency resolution conflicts between Svelte 5, SvelteKit 2, ESLint 9, and their respective plugins
2. ESLint flat config integration issues
3. Missing Playwright browsers
4. Possible Prettier/Svelte plugin version incompatibility

The path to success is: install → verify each tool in isolation → fix what breaks.
