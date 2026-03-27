# Design: T-001-03 verify-persona-endpoint

## Problem Statement

We need to verify that the persona endpoint works end-to-end: server starts, accepts a POST request, streams SSE events with partial Persona JSON, concludes with a complete Persona and `[DONE]` sentinel, and includes CORS headers. This is a verification ticket, not a feature ticket — but we should leave behind durable artifacts (tests, scripts) that provide ongoing value.

## Option A: Manual curl-only Verification

Run `doppler run -- go run main.go`, manually curl the endpoint, visually inspect output.

**Pros:** Fastest to execute. No code changes.
**Cons:** Not repeatable. No evidence for future regressions. Other developers can't re-run the verification. Doesn't satisfy "leave the build green" philosophy since it adds no test coverage for the streaming path.

## Option B: Integration Test with Live LLM

Write a Go integration test that starts the server, makes a real HTTP request, parses the SSE stream, and asserts structural properties of the response. Gate it behind a build tag (e.g., `//go:build integration`) so it doesn't run in CI without secrets.

**Pros:** Durable, repeatable. Catches regressions. Documents expected behavior in code. Exercises the full stack including BAML runtime.
**Cons:** Requires `ANTHROPIC_API_KEY`. Slow (~5-15s per run). Non-deterministic content (but structure is deterministic). Costs API credits.

## Option C: Unit Test with Synthetic Channel + Manual curl

Write a unit test that feeds a synthetic `StreamValue` channel into `streamSSE` using a custom `http.Flusher`-compatible writer. This tests the SSE formatting without LLM calls. Complement with a one-time manual curl for the full-stack smoke test.

**Pros:** Unit test is fast, free, deterministic. Tests the SSE serialization path that existing tests don't cover. Manual curl still validates the LLM integration.
**Cons:** Two separate verification steps. Synthetic test doesn't exercise BAML runtime.

## Decision: Option B + C (Integration test + SSE unit test)

We implement both:

1. **SSE unit test** — A test in `handlers_test.go` that creates a synthetic `StreamValue` channel, feeds it into `streamSSE` via an `httptest` server (which supports `http.Flusher` unlike `httptest.ResponseRecorder`), and asserts the SSE output format. This covers the streaming serialization path permanently with zero external dependencies.

2. **Integration test** — A test with `//go:build integration` tag that starts the real server, POSTs to `/api/persona`, reads the SSE stream, and validates:
   - Response has `Content-Type: text/event-stream`
   - CORS headers are present
   - At least one partial event with valid JSON
   - Final event before `[DONE]` has all Persona fields populated
   - Stream ends with `[DONE]`

3. **Manual curl verification** — Run the integration test with `doppler run -- go test -tags integration ./...` and also do a manual curl to visually confirm the output looks right. Record the curl output in progress.md.

### Why Both

The SSE unit test is the most valuable ongoing artifact — it catches serialization regressions cheaply. The integration test is the most thorough but expensive to run. Together they cover both the formatting layer and the full BAML-to-client pipeline. The manual curl is a one-time confidence check.

## Rejected: Mock BAML Runtime

We could mock the BAML client interface to test the handler without real LLM calls. Rejected because:
- The BAML generated client uses concrete types, not interfaces — mocking would require a wrapper layer that doesn't exist.
- The SSE unit test achieves the same goal by testing at the `streamSSE` boundary.
- Adding a mock layer just for this ticket violates "don't add abstractions for one-time operations."

## Key Design Decisions

1. **Build tag for integration tests:** `//go:build integration` keeps expensive tests out of default `go test` runs.
2. **httptest.Server for SSE tests:** Unlike `httptest.ResponseRecorder`, `httptest.Server` creates a real TCP connection where `http.Flusher` works correctly.
3. **Structural assertions only:** Integration tests check that fields exist and have reasonable types, not specific content values, since LLM output is non-deterministic.
4. **Single test file:** Both the SSE unit test and integration test go in the same package (`main`). The integration test lives in a separate file with a build tag.
