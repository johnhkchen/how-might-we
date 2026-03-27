# Structure — T-003-01: frontend-dev-setup

## Scope

This is a configuration-fix ticket, not a feature ticket. The file changes will be limited to existing config files in `frontend/`. No new source files will be created.

## Files to modify (anticipated)

Changes are speculative until we actually run the tools and see what breaks. This is the most likely set based on research.

### Certain changes

| File | Change | Reason |
|---|---|---|
| `frontend/node_modules/` | Generated | `npm install` creates this |
| `frontend/package-lock.json` | Generated | `npm install` creates this |
| `frontend/.svelte-kit/` | Generated | `svelte-kit sync` creates this (auto on `dev` or `check`) |

### Likely changes

| File | Change | Reason |
|---|---|---|
| `frontend/eslint.config.js` | Modify | Flat config wiring for TS + Svelte may need adjustment |
| `frontend/.prettierignore` | Create if needed | Exclude `.svelte-kit/`, `build/`, `node_modules/` from format checks |
| `frontend/package.json` | Modify | Add missing peer deps if install warns, or adjust version ranges |

### Possible changes

| File | Change | Reason |
|---|---|---|
| `frontend/svelte.config.js` | Modify | Only if adapter-cloudflare has breaking config |
| `frontend/vite.config.ts` | Modify | Only if dev server proxy needs fixing |
| `frontend/tailwind.config.js` | Modify | Only if Tailwind processing fails |
| `frontend/postcss.config.js` | Modify | Only if PostCSS chain is broken |
| `frontend/tsconfig.json` | Modify | Only if type checking fails due to config |
| `frontend/playwright.config.ts` | Modify | Only if webServer startup command needs adjustment |

### Files NOT modified

- `frontend/src/**` — Source files are out of scope. Component stubs stay as-is.
- `frontend/tests/**` — Test files are out of scope. Existing tests should pass as-is.
- `backend/**` — Different track entirely.
- `docs/**` — Only work artifacts in `docs/active/work/T-003-01/`.

## Module boundaries

No new modules. This ticket operates within the existing `frontend/` boundary:

```
frontend/
├── Config layer (package.json, eslint, prettier, vite, svelte, tailwind, postcss, playwright)
├── Generated layer (.svelte-kit/, node_modules/, package-lock.json)
└── Source layer (src/, tests/) — READ ONLY for this ticket
```

## Change ordering

The order matters because later steps depend on earlier ones:

1. **Install** — `npm install` must succeed before anything else
2. **Build system** — `vite dev` / `svelte-kit sync` must work before lint/check
3. **Linting** — ESLint config must be valid
4. **Formatting** — Prettier config must be valid
5. **Testing** — Playwright needs browsers + working build

Each fix at step N may unblock step N+1. We do not proceed to step N+1 until step N passes.

## Artifact tracking

All work artifacts go to `docs/active/work/T-003-01/`:
- `research.md` (done)
- `design.md` (done)
- `structure.md` (this file)
- `plan.md`
- `progress.md`
- `review.md`
