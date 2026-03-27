# Design — T-003-03: sse-client-mock-support

## Problem Statement

The SSE client (`stream.ts`) and mock layer (`mock.ts`, `client.ts`, fixtures) are scaffolded but have gaps: no error resilience in the parser, no error simulation in mocks, and no automated verification that streaming works end-to-end. The AC demands robust parsing, realistic mock timing, correct typing, and error handling.

---

## Decision 1: Hardening `streamFromAPI`

### Option A: Wrap JSON.parse in try/catch, skip malformed lines
- Minimal change — add try/catch inside the `for` loop
- Log malformed data to console.warn for debuggability
- Matches AC: "malformed JSON skipped"

### Option B: Use a streaming JSON parser library
- Overkill for SSE protocol where each event is a complete JSON object
- BAML sends complete JSON per `data:` line, not partial JSON fragments

### Option C: Add a validation layer with Zod/schema
- Type-safe runtime validation of partials
- Adds a dependency, over-engineered for partials that are `Partial<T>` by nature

**Decision: Option A.** Simple try/catch. SSE data lines are complete JSON objects by protocol design. Malformed lines should be skipped with a warning, not crash the stream.

---

## Decision 2: Error Handling in `streamFromAPI`

The AC requires: "non-200 response throws, missing body throws."

Current code already handles both:
- `if (!response.ok)` throws on non-200
- `if (!reader)` throws on missing body

**Decision: Keep existing error handling, add one improvement.** For non-200 responses, attempt to read the error body (it may contain a JSON error message from `writeJSONError` in the Go backend) and include it in the thrown error. This gives callers useful error context instead of just "API error: 500 Internal Server Error."

---

## Decision 3: Mock Error Simulation

### Option A: Add error-specific mock endpoints
- e.g., `/api/persona-error` returns 500
- Requires mock.ts changes and special test routes
- Awkward — doesn't test the real endpoint paths

### Option B: Add a `mockError` mode flag
- `VITE_MOCK_ERROR=true` makes mocks return errors
- Inflexible — all-or-nothing

### Option C: No mock error routes — test error handling via unit-style tests
- Write Playwright tests that intercept routes and return error responses
- Uses Playwright's `page.route()` to simulate errors on real paths
- Tests the actual `streamFromAPI` error paths without mock layer changes

**Decision: Option C.** Playwright route interception is the standard pattern for testing error scenarios. It tests the real code paths, doesn't pollute the mock layer, and is more flexible (can simulate any status code, missing body, etc.).

---

## Decision 4: Automated Verification Strategy

### Option A: Add Vitest for unit testing stream.ts
- Requires adding Vitest dependency, configuring it
- Good for isolated testing of `streamFromAPI` and `createSSEStream`
- Significant setup cost for this ticket alone

### Option B: Playwright E2E tests with mock API
- Already configured (`webServer` uses `VITE_MOCK_API=true`)
- Can verify streaming behavior via UI assertions
- Tests the full stack (mock → stream.ts → store → UI)
- Can use `page.route()` for error scenarios

### Option C: Both Vitest + Playwright
- Most thorough but highest cost

**Decision: Option B.** Playwright is already configured with mock mode. Write E2E tests that:
1. Verify mock streaming delivers data to the UI (proves the full mock→SSE→store pipeline)
2. Use `page.route()` to test error scenarios
3. Verify `onPartial` fires correctly by observing UI state changes

This defers Vitest setup to a future ticket while still satisfying all ACs.

---

## Decision 5: `move` vs `moveType` Field Name

Research found BAML defines `moveType` but frontend uses `move`. Options:

### Option A: Change fixtures to use `moveType`
- Would break frontend type compatibility
- The frontend `HMWVariant` interface uses `move`

### Option B: Keep `move` in fixtures and frontend
- Accept that the Go JSON serialization or a mapping layer handles the rename
- Fixtures should match what the frontend actually receives

### Option C: Investigate and align
- Check what the Go BAML client actually serializes

**Decision: Option B.** The fixtures serve the frontend. They should match the frontend's `HMWVariant` interface which uses `move`. If the BAML Go client serializes as `moveType`, the backend handler or a JSON tag will need to handle that — but that's a backend concern (T-001 track), not this ticket.

---

## Decision 6: `dev:mock` Console Demonstration

AC: "`npm run dev:mock` demonstrates streaming in browser console."

Options:
- Add `console.log` calls in `streamFromAPI` for mock mode
- Add a debug flag that logs partials as they arrive
- Rely on the Svelte DevTools / browser network tab showing SSE events

**Decision: Add lightweight console logging in `streamFromAPI` when data arrives.** A single `console.debug` per partial is enough. Browser DevTools already show fetch responses but won't show the SSE partial progression clearly. Console output makes mock streaming behavior observable during `dev:mock`.

---

## Design Summary

| Change | Approach |
|--------|----------|
| Malformed JSON resilience | try/catch in stream.ts, console.warn + skip |
| Error body extraction | Read response body on non-200 before throwing |
| Error testing | Playwright route interception, not mock layer changes |
| Streaming verification | Playwright E2E tests with mock mode |
| Field name alignment | Keep `move` in frontend/fixtures; backend's concern |
| Dev observability | console.debug in streamFromAPI for each partial |
