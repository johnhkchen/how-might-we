# Review — T-002-04: backend-e2e-flow-test

## Summary of Changes

### Files Modified

| File | Change |
|------|--------|
| `backend/integration_test.go` | Major rewrite: extracted helpers, refactored existing tests, added pipeline + error tests |

### Files Created

| File | Purpose |
|------|---------|
| `docs/active/work/T-002-04/research.md` | Codebase mapping |
| `docs/active/work/T-002-04/design.md` | Design decisions |
| `docs/active/work/T-002-04/structure.md` | File-level blueprint |
| `docs/active/work/T-002-04/plan.md` | Implementation steps |
| `docs/active/work/T-002-04/progress.md` | Execution tracking |
| `docs/active/work/T-002-04/review.md` | This file |

No files deleted. No non-backend files touched.

## What Was Done

### 1. SSE Helper Extraction (DRY improvement)

Extracted five helper functions that eliminate the duplicated SSE parsing and server setup code:

- **`readSSEDataLines`** — replaces the identical `bufio.Scanner` loop that appeared in all 4 existing tests
- **`extractFinalJSON`** — replaces the repeated [DONE] assertion and final-line extraction
- **`postSSE`** — consolidates POST + status check + content-type check + CORS check + SSE read
- **`newTestServer`** — creates a full server with all 4 routes + CORS (was inlined in each test)
- **`skipIfNoAPIKey`** — one-line guard (was 3 lines in each test)

### 2. Full Pipeline Test (`TestFullPipeline_Integration`)

The core deliverable. Chains all four endpoints with real LLM outputs:

1. **Persona** — POSTs raw input, gets structured Persona
2. **Analyze** — Uses the real Persona to build ProblemContext, gets HMWAnalysis
3. **Expand** — Uses the real Analysis, gets HMWExpansion with 6-8 variants
4. **Refine** — Builds HMWSession from all prior outputs, assigns candidate statuses (SELECTED/EDITED/SKIPPED/GENERATED), gets HMWRefinement

Each stage validates its output before passing it forward. Uses `t.Fatalf` for chain-breaking failures.

### 3. Error Handling Tests (`TestErrorHandling_Integration`)

13 subtests covering the full middleware stack (CORS + handlers):

- Invalid JSON → 400 for all 4 endpoints
- Missing required fields → 400 with specific error message
- OPTIONS preflight → 204 with correct CORS headers
- Does NOT require API key — always runnable

## Test Coverage

| Test category | Count | Requires API key |
|--------------|-------|-----------------|
| Unit tests (handlers_test.go) | 26 | No |
| Error handling integration | 13 subtests | No |
| Per-endpoint integration | 4 | Yes |
| Full pipeline integration | 1 | Yes |
| **Total** | **44** | |

### Coverage by Acceptance Criteria

| Criterion | Covered by |
|-----------|-----------|
| Full flow tested: persona → analyze → expand → refine | `TestFullPipeline_Integration` |
| Each endpoint returns valid JSON matching BAML types | All per-endpoint integration tests + pipeline test validate field presence and types |
| SSE streaming works (partials build up, [DONE] terminates) | `postSSE` + `extractFinalJSON` verify SSE protocol; per-endpoint tests verify partial JSON validity |
| Error handling: invalid JSON returns 400, missing fields return meaningful errors | `TestErrorHandling_Integration` (13 subtests) |
| CORS preflight returns correct headers | `TestErrorHandling_Integration/cors/preflight` + unit test `TestCORS_Preflight` |

## Known Limitations

1. **Pipeline test requires LLM API access.** Without `ANTHROPIC_API_KEY`, the pipeline test skips. This is by design — it verifies real LLM output compatibility, not mocked behavior.

2. **No mid-stream disconnect test.** The `ctx.Done()` path in `streamSSE` remains untested. Testing this would require either a way to inject a slow BAML stream or a mock. Out of scope for this ticket.

3. **LLM output is non-deterministic.** The pipeline test validates structural completeness (non-empty fields, correct types) but cannot assert specific content. A flaky LLM response that returns empty arrays would fail the test.

4. **Test runtime.** The pipeline test calls the LLM 4 times sequentially. Expected runtime is 30-120 seconds depending on model latency. The per-endpoint tests add another 30-120 seconds each. Total integration suite: ~2-8 minutes.

## Open Concerns

- **Doppler configuration**: The `ANTHROPIC_API_KEY` is not currently configured in the Doppler `hmw-workshop/dev` project. The LLM-dependent tests skip cleanly, but they cannot be run until the key is added. This is a pre-existing infrastructure gap, not introduced by this ticket.

## Verification Results

```
go build ./...                          # Clean
go build -tags=integration ./...        # Clean
go test -v ./...                        # 26 pass
go test -tags=integration -v ./...      # 26 unit + 13 integration pass, 5 LLM tests skip
```
