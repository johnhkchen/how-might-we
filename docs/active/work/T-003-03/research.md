# Research — T-003-03: sse-client-mock-support

## Scope

Verify and refine the SSE client utility (`stream.ts`), mock API layer (`mock.ts`, `client.ts`), and fixture data so that:
1. `streamFromAPI` handles SSE parsing robustly (buffering, errors, edge cases)
2. Mock mode produces realistic BAML-style streaming behavior
3. Fixtures match actual BAML types and streaming patterns

---

## Existing Files

### `frontend/src/lib/api/stream.ts` (40 lines)

The SSE client. Key behavior:
- Delegates to `apiFetch` (which routes to real or mock fetch)
- Reads response body via `ReadableStream` + `TextDecoder`
- Buffers incomplete SSE frames by splitting on `\n\n`
- Parses `data: {json}` lines, skips `data: [DONE]`
- Calls `onPartial(parsed)` for each valid data event

**Issues found:**
1. **No try/catch around `JSON.parse`** — if the backend sends malformed JSON (or a partial JSON chunk lands exactly on a `\n\n` boundary), this throws and kills the stream. AC requires "malformed JSON skipped."
2. **No handling of `data: [DONE]` sentinel after buffer flush** — the final buffer remainder is never processed. If the last chunk is `data: [DONE]\n\n`, it's correctly split. But if the stream ends with `data: [DONE]` without trailing `\n\n`, it sits in `buffer` and is never processed. This is benign (no crash) but worth understanding.
3. **`Partial<T>` typing is correct** — BAML streams progressively-building objects, so partial typing is the right model.
4. **No `AbortController` support** — the function has no way to cancel a stream. Not in AC but worth noting.

### `frontend/src/lib/api/client.ts` (14 lines)

Switches between real `fetch` and `mockFetch` based on `VITE_MOCK_API` env var.

**Issue found:**
- `apiFetch` is computed once at module load: `export const apiFetch = getApiFetch()`. This means the mock/real decision is made at import time, which is correct for Vite (env vars are static at build time). No issue.

### `frontend/src/lib/api/mock.ts` (67 lines)

Creates a fake `Response` with a `ReadableStream` that emits SSE-formatted fixture data.

**Key behavior:**
- Maps endpoints (`/api/persona`, etc.) to fixture partial arrays
- `createSSEStream` emits one `data: {json}\n\n` per partial with 150ms delay
- Sends `data: [DONE]\n\n` after all partials
- Falls through to real `fetch` for unrecognized paths

**Issues found:**
1. **`mockFetch` URL parsing** — uses `new URL(url, 'http://localhost').pathname`. For relative URLs like `/api/persona`, this works. For full URLs, it also works. Correct.
2. **No error simulation** — AC requires error cases tested (non-200, missing body). The mock always returns 200. To test errors, we'd need to either add error routes or test `streamFromAPI` directly.
3. **Type safety** — `MockPartials` is `Record<string, Partial<unknown>[]>`, losing all type info. Functional but could be tighter.

### Fixture Files

Four fixture files in `frontend/tests/fixtures/`, re-exported via `index.ts`:

| File | Export | Partials Count | Final Type |
|------|--------|---------------|------------|
| `persona.ts` | `mockPersonaPartials` | 6 | `Persona` |
| `analysis.ts` | `mockAnalysisPartials` | 5 | `HMWAnalysis` |
| `expansion.ts` | `mockExpansionPartials` | 4 | `HMWExpansion` |
| `refinement.ts` | `mockRefinementPartials` | 3 | `HMWRefinement` |

Each file also exports:
- `mock*Final` — the last partial cast to the full type
- `*SSEStream()` — helper producing string array of SSE lines (used in tests, not in mock.ts)

**Key discrepancy found:**
- BAML `types.baml` defines `HMWVariant.moveType` (field name: `moveType`)
- Frontend `session.svelte.ts` defines `HMWVariant.move` (field name: `move`)
- Fixtures use `move` (matching frontend, not BAML)
- This is likely intentional — the Go handler may map `moveType` → `move` in serialization, or the BAML Go client may use `move` in JSON tags. Need to verify, but for mock purposes the fixtures should match what the frontend expects, which is `move`.

**Streaming realism:**
- Persona: 6 partials, fields accumulate (label → role → goals → ... → all)
- Analysis: 5 partials, fields accumulate similarly
- Expansion: 4 partials, `variants` array grows from 1→2→3→6 items
- Refinement: 3 partials, `newVariants` grows 1→3→3, `tensions`/`recommendation` fill in

This accurately mirrors BAML structured streaming behavior where fields fill progressively and arrays grow incrementally.

---

## Backend SSE Protocol (for reference)

`backend/sse.go` defines `streamSSE[TStream, TFinal]`:
- Sets `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`
- Iterates BAML stream channel, marshals each value to JSON
- Emits `data: {json}\n\n` for each partial/final
- Emits `data: [DONE]\n\n` as sentinel
- Uses `http.Flusher` to push each event immediately

The frontend SSE client mirrors this protocol: split on `\n\n`, parse `data: ` prefix, stop on `[DONE]`.

---

## Playwright Config

- `webServer` uses `VITE_MOCK_API=true npm run build && npm run preview` on port 4173
- E2E tests already run against mock mode
- Current tests only verify landing page + navigation, not streaming

---

## Testing Infrastructure

- **No unit test framework** — only Playwright for E2E. No Vitest configured.
- **No `dev:mock` verification** — the script exists in `package.json` but there's no automated check that mock streaming works.
- Fixtures export `*SSEStream()` helpers that return `string[]` — these exist for potential use in Playwright route interception but aren't currently used.

---

## Constraints & Dependencies

- T-003-02 (session store) is complete — types are stable in `session.svelte.ts`
- T-003-01 (session store types) provides the TypeScript interfaces used by fixtures
- This ticket focuses on the plumbing (stream.ts, mock.ts, client.ts) and fixture quality, not on UI components

---

## Summary of Issues to Address

1. **`stream.ts` — no try/catch on JSON.parse** → malformed data kills stream
2. **`stream.ts` — no error handling for `data: [DONE]` edge case** (benign, low priority)
3. **Mock layer has no error simulation** → can't test AC error cases via mock alone
4. **Fixtures use `move` vs BAML `moveType`** → need to verify this is intentional and consistent
5. **No automated test for streaming behavior** → need Playwright tests or unit tests
6. **`*SSEStream()` helpers exist but are unused** → potential for Playwright route mocking
