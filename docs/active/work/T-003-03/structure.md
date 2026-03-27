# Structure — T-003-03: sse-client-mock-support

## Files Modified

### `frontend/src/lib/api/stream.ts`
Current: 40 lines. Changes:

1. **Add try/catch around JSON.parse** in the SSE line processing loop
   - Catch block: `console.warn('Skipping malformed SSE data:', line)` and continue
   - Satisfies AC: "malformed JSON skipped"

2. **Improve error response handling** for non-200 responses
   - Before throwing, attempt to read response body as text
   - Parse as JSON if possible, extract `error` field
   - Throw with enriched message: `API error: 500 — failed to start persona stream`
   - Falls back to status text if body unreadable

3. **Add console.debug for each partial** (observability for dev:mock)
   - `console.debug('[SSE]', endpoint, partial)` after successful parse
   - Gated: only logs in development (`import.meta.env.DEV`)

4. **Handle remaining buffer after stream ends**
   - After the `while` loop, process any remaining data in `buffer`
   - Handles edge case where last event lacks trailing `\n\n`

Public interface unchanged: `streamFromAPI<T>(endpoint, body, onPartial): Promise<void>`

### `frontend/src/lib/api/mock.ts`
Current: 67 lines. Minimal changes:

1. **Tighten `MockPartials` type** — change from `Record<string, Partial<unknown>[]>` to use specific fixture types via a union or keep as-is (type safety is enforced at the fixture level, not here)

No structural changes needed. The mock layer works correctly.

### `frontend/src/lib/api/client.ts`
No changes. Works correctly as-is.

### `frontend/tests/fixtures/*.ts`
No changes to fixture data. The fixtures accurately model BAML streaming behavior and match frontend types.

---

## Files Created

### `frontend/tests/streaming.spec.ts`
New Playwright E2E test file. Sections:

1. **Mock streaming tests** (run against `VITE_MOCK_API=true` build, already configured in `playwright.config.ts`):
   - Test that persona streaming delivers data to the UI (requires a page that calls the persona API — may need to test via the workshop page or a minimal test harness)
   - Given that the workshop page isn't fully wired yet, tests will use `page.evaluate()` to call `streamFromAPI` directly from the browser context and verify callbacks fire

2. **SSE parsing tests** via `page.evaluate()`:
   - Set up a mock route via `page.route()` that sends raw SSE data
   - Call `streamFromAPI` from within the page context
   - Verify `onPartial` receives correct parsed objects
   - Test buffering: send a chunk that splits across a `\n\n` boundary
   - Test `data: [DONE]` terminates cleanly

3. **Error handling tests** via `page.route()`:
   - Non-200 response → verify error thrown with message
   - Missing body (null ReadableStream) → verify error thrown
   - Malformed JSON in SSE data → verify stream continues, partial skipped

**Test structure:**
```
test.describe('SSE streaming', () => {
  test.describe('streamFromAPI parsing', () => { ... })
  test.describe('mock API streaming', () => { ... })
  test.describe('error handling', () => { ... })
})
```

---

## Files Deleted

None.

---

## Module Boundaries

```
stream.ts  ←── pure SSE consumer, no UI coupling
   ↑ uses
client.ts  ←── fetch routing (mock vs real), no SSE knowledge
   ↑ uses
mock.ts    ←── generates fake SSE Response objects from fixtures
   ↑ uses
fixtures/  ←── static data arrays, no runtime behavior
```

No new modules or boundaries introduced. The changes are entirely within existing files + one new test file.

---

## Ordering

1. Harden `stream.ts` (the core utility — all other tests depend on it being correct)
2. Write `streaming.spec.ts` tests for parsing + error handling (verify the hardening works)
3. Write `streaming.spec.ts` tests for mock streaming (verify the full mock pipeline)
4. Run all tests, verify `npm run check` and `npm run lint` pass
