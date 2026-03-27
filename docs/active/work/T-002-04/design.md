# Design — T-002-04: backend-e2e-flow-test

## Problem

We need to verify the full backend pipeline (persona → analyze → expand → refine) works end-to-end, with each stage's output feeding the next. The existing integration tests validate each endpoint independently but never chain them.

## Approaches Considered

### Option A: Shell script with curl

Chain four curl commands, piping jq-extracted outputs between stages.

**Pros:** Simple, no Go code, easy to run manually.
**Cons:** Fragile JSON extraction, SSE parsing in bash is painful, no assertion framework, hard to validate intermediate structures, not part of `go test` suite.

**Rejected:** Too brittle for reliable CI. SSE parsing in shell is error-prone.

### Option B: Separate Go test file with full pipeline test

Add a new `TestFullPipeline_Integration` test in `integration_test.go` that chains all four endpoints sequentially, passing real outputs between stages.

**Pros:** Lives with existing integration tests, uses Go's testing framework, full structural validation, runs with `go test -tags=integration`.
**Cons:** Depends on LLM API (cost/latency), ~1-2 minute runtime.

### Option C: New e2e_test.go file

Same as B but in a dedicated file for better organization.

**Pros:** Clear separation of pipeline tests from per-endpoint tests.
**Cons:** Marginal benefit over keeping it in `integration_test.go`.

### Option D: Both Go test + helper refactor

Add the pipeline test AND extract the duplicated SSE parsing into a shared helper, reducing the repeated `bufio.Scanner` code across all integration tests.

**Pros:** DRY, makes pipeline test cleaner, improves existing tests.
**Cons:** Slightly more work, touches existing test code.

## Decision: Option D — Pipeline test + SSE helper extraction

**Rationale:**

1. The full pipeline test is the core deliverable. It must chain persona → analyze → expand → refine with real LLM outputs.
2. The SSE parsing helper is justified: the same 15-line scanner pattern appears 4 times in integration_test.go and will be needed a 5th time in the pipeline test. This crosses the threshold from "similar code" to "should extract."
3. Keeping everything in `integration_test.go` (not a new file) is simpler — the existing per-endpoint tests and the pipeline test are both integration tests gated by the same build tag.
4. The `//go:build integration` tag keeps all of this out of normal `go test` runs.

## Error Handling Strategy

The pipeline test will also verify error scenarios against the full server stack (with CORS middleware), filling the gap identified in research:

- POST invalid JSON to each endpoint via `httptest.NewServer` → expect 400 + JSON error body
- POST with missing required fields → expect 400 + specific error message
- OPTIONS preflight → expect 204 + correct CORS headers

These can go in a separate test function in the same file.

## SSE Helper Design

```go
// readSSEDataLines reads all `data: ` lines from an SSE response body.
// Returns the data payloads (without prefix) and any scan error.
func readSSEDataLines(body io.Reader) ([]string, error)
```

This replaces the duplicated scanner loop in all existing integration tests and is reused by the pipeline test. Each test still does its own JSON unmarshalling — the helper just handles transport.

## Pipeline Test Design

```
TestFullPipeline_Integration:
  1. Start httptest.NewServer with all routes + CORS middleware
  2. POST /api/persona { rawInput: "junior designer at a SaaS company" }
     - Parse SSE, extract final Persona JSON
     - Validate all required fields non-empty
  3. POST /api/analyze { statement: "HMW make workshops more productive?", context: { domain, persona_from_step_2, constraints } }
     - Parse SSE, extract final HMWAnalysis JSON
     - Validate required fields
  4. POST /api/expand { analysis: analysis_from_step_3, context: same_context }
     - Parse SSE, extract final HMWExpansion JSON
     - Validate variants non-empty
  5. Build HMWSession from steps 2-4, set candidate statuses (SELECTED/SKIPPED/EDITED)
     POST /api/refine { session }
     - Parse SSE, extract final HMWRefinement JSON
     - Validate newVariants, tensions, suggestedNextMove
  6. Log summary of full pipeline execution
```

Each step fails fast (`t.Fatalf`) if the previous stage failed, since outputs chain.

## Scope

- **In scope:** Pipeline test, SSE helper, refactoring existing tests to use helper, error validation tests against full server.
- **Out of scope:** Mocking BAML client, adding interface layers, changing handler logic, frontend changes.
