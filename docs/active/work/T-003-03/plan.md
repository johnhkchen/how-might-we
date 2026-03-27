# Plan — T-003-03: sse-client-mock-support

## Step 1: Harden `stream.ts` — error resilience + observability

**Changes to `frontend/src/lib/api/stream.ts`:**

1. Wrap `JSON.parse(line.slice(6))` in try/catch. On catch: `console.warn` the error and the raw line, then `continue` to next line.

2. Improve non-200 error: before throwing, read `response.text()`, attempt `JSON.parse` to extract `.error`, include in thrown error message.

3. After the while loop, process remaining `buffer` content (same logic as inside the loop — split remaining buffer into lines, parse any valid `data:` lines).

4. Add `console.debug('[SSE]', endpoint, parsed)` after successful parse, gated behind `import.meta.env.DEV`.

**Verification:** `npm run check` passes (TypeScript compiles). `npm run lint` passes.

---

## Step 2: Write Playwright tests for SSE parsing

**Create `frontend/tests/streaming.spec.ts`:**

Tests use `page.route()` to intercept requests and return controlled SSE responses, then use `page.evaluate()` to call `streamFromAPI` and collect results.

Test cases:
- **Basic parsing:** Route returns 3 SSE events + `[DONE]`. Verify `onPartial` fires 3 times with correct data.
- **Buffering:** Route sends data in chunks that split across `\n\n` boundaries. Verify all events parsed correctly.
- **Malformed JSON:** Route sends one valid event, one malformed event, one valid event. Verify 2 partials received (malformed skipped).
- **`[DONE]` handling:** Verify stream completes without error after `[DONE]`.

**Verification:** `npx playwright test streaming.spec.ts` passes.

---

## Step 3: Write Playwright tests for error handling

**Add to `frontend/tests/streaming.spec.ts`:**

Test cases:
- **Non-200 response:** Route returns 500 with JSON body `{"error":"test error"}`. Verify `streamFromAPI` throws with error message containing "test error".
- **Non-200 without body:** Route returns 500 with empty body. Verify throws with status text.
- **Missing response body:** (Harder to simulate — may skip if Playwright can't produce a Response with null body.)

**Verification:** `npx playwright test streaming.spec.ts` passes.

---

## Step 4: Write Playwright tests for mock API streaming

**Add to `frontend/tests/streaming.spec.ts`:**

Since the Playwright webServer already builds with `VITE_MOCK_API=true`:
- **Mock persona streaming:** Navigate to a page, call `streamFromAPI('/api/persona', ...)` via `page.evaluate()`, verify partials match fixture data count (6 partials).
- **Mock analysis streaming:** Same pattern, verify 5 partials.
- **Mock expansion streaming:** Verify 4 partials.
- **Mock refinement streaming:** Verify 3 partials.
- **Timing:** Verify mock stream takes roughly `count * 150ms` (with tolerance).

**Verification:** `npx playwright test streaming.spec.ts` passes.

---

## Step 5: Full verification

1. `npm run check` — TypeScript compiles
2. `npm run lint` — ESLint passes
3. `npx playwright test` — All tests pass (existing + new)
4. `npm run dev:mock` — Start dev server, open browser console, verify `[SSE]` debug logs appear when triggering API calls (manual verification, documented in progress.md)

---

## Testing Strategy

| Test Type | What | How |
|-----------|------|-----|
| E2E — parsing | SSE event parsing with buffering | Playwright `page.route()` + `page.evaluate()` |
| E2E — errors | Non-200, malformed JSON | Playwright `page.route()` returning error responses |
| E2E — mock pipeline | Full mock → stream → callback | Playwright with `VITE_MOCK_API=true` build |
| Static analysis | Type safety | `npm run check` |
| Lint | Code style | `npm run lint` |
| Manual | Dev observability | `npm run dev:mock` + browser console |

---

## Risk Notes

- Playwright `page.evaluate()` runs in the browser context. We need the `streamFromAPI` function available in the page. Since it's a library module (not mounted on `window`), we may need to test it via a page that imports it, or inline the SSE parsing logic in `page.evaluate()`. The pragmatic approach: test via `page.route()` interception of mock API calls and observe side effects (store state changes or collected results).
- If the workshop page isn't wired to call APIs yet, we'll test by having `page.evaluate()` dynamically import the module.
