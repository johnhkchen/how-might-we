# Plan — T-003-01: frontend-dev-setup

## Steps

### Step 1: Install dependencies

```bash
cd frontend && npm install
```

- **Verify:** Exit code 0, `node_modules/` exists, `package-lock.json` created.
- **Fix if needed:** Resolve peer dependency conflicts by adjusting version ranges or adding missing packages.
- **Commit:** "Install frontend dependencies" (includes package-lock.json)

### Step 2: Verify dev server starts

```bash
cd frontend && npm run dev
```

- **Verify:** Server starts on :5173, responds to HTTP requests. Landing page HTML includes Tailwind-generated classes (e.g., `min-h-screen`).
- **Fix if needed:** Address any Vite/SvelteKit startup errors. Common issues: missing `.svelte-kit/` (should auto-generate), adapter config issues.
- **Note:** Kill the server after verification — it's blocking.

### Step 3: Verify TypeScript / svelte-check

```bash
cd frontend && npm run check
```

- **Verify:** Exit code 0, no type errors.
- **Fix if needed:** Adjust tsconfig or type annotations.

### Step 4: Verify ESLint

```bash
cd frontend && npm run lint
```

- **Verify:** Exit code 0, no config errors. Linting warnings are acceptable.
- **Fix if needed:** Adjust `eslint.config.js` — common issues are flat config plugin wiring, missing parser for Svelte files, or rule conflicts.

### Step 5: Verify Prettier

```bash
cd frontend && npm run format:check
```

- **Verify:** Exit code 0.
- **Fix if needed:** Create `.prettierignore` to exclude generated directories. Run `npm run format` if source files need reformatting (unlikely since they were hand-written with the same config).

### Step 6: Install Playwright browser

```bash
cd frontend && npx playwright install chromium
```

- **Verify:** Exit code 0, chromium binary available.
- **Fix if needed:** This is usually straightforward. May need system dependencies on some OSes.

### Step 7: Run Playwright tests

```bash
cd frontend && npm test
```

- **Verify:** All 3 tests pass (landing page title, navigation, workshop header).
- **Fix if needed:** The webServer command (`VITE_MOCK_API=true npm run build && npm run preview`) must succeed. If build fails, fix build issues first. If tests fail, investigate specific assertions.

### Step 8: Verify mock dev mode

```bash
cd frontend && npm run dev:mock
```

- **Verify:** Server starts on :5173 with `VITE_MOCK_API=true` visible in env.
- **Fix if needed:** Address env variable propagation or mock module issues.

### Step 9: Final verification pass

Re-run all acceptance criteria in sequence to confirm everything still works:
```bash
cd frontend && npm run lint && npm run format:check && npm run check && npm test
```

- **Verify:** All commands exit 0.

## Testing strategy

This ticket IS the testing — we're verifying each tool works. The "tests" are the acceptance criteria themselves:

| Tool | Test method |
|---|---|
| npm install | Exit code |
| Dev server | HTTP response on :5173 |
| Tailwind | Inspect CSS output for utility classes |
| ESLint | Exit code of `npm run lint` |
| Prettier | Exit code of `npm run format:check` |
| Playwright install | Exit code |
| Playwright tests | 3/3 tests pass |
| Mock mode | Server starts with mock env |

## Commit strategy

- **Commit 1:** After Step 1 — `npm install` with lock file
- **Commit 2:** After all fixes are applied and all tools verified — bundle config fixes into one commit since they're interdependent
- If fixes are substantial and independent, they get separate commits. Judgment call during implementation.
