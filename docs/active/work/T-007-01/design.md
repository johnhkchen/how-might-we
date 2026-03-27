# Design — T-007-01: Rate Limit User Feedback

## Problem

429 responses surface as "API error: 429" with no retry guidance, countdown, or explanation. Rate-limit headers (`Retry-After`, `X-RateLimit-Remaining`) are available in the response but discarded.

## Design Decision: Where to Parse Rate-Limit Info

### Option A: Custom error class thrown from `streamFromAPI`

Make `streamFromAPI` throw a `RateLimitError` (extends `Error`) that carries parsed headers. The workshop page catches it with `instanceof` and extracts structured data.

**Pros:** Minimal API surface change. Error flows through existing try/catch pattern. No new modules.
**Cons:** Mixing structured data into an Error subclass. Callers must remember to check instanceof.

### Option B: Return a result union from `streamFromAPI`

Change `streamFromAPI` to return `{ ok: true } | { ok: false, status, headers, message }`.

**Pros:** Type-safe. Forces callers to handle errors structurally.
**Cons:** Large refactor of all 4 call sites. Breaks the clean async/throw pattern.

### Option C: Callback/event for rate-limit state

Pass an `onRateLimited` callback or emit an event from `streamFromAPI`.

**Pros:** Decoupled. Could feed a global rate-limit store.
**Cons:** Over-engineered for 4 call sites. Adds indirection.

### Decision: Option A — Custom `RateLimitError`

Rationale:
- Smallest change footprint. The 4 catch blocks in `+page.svelte` add one `instanceof` check each.
- Keeps `streamFromAPI` signature unchanged (still `Promise<void>`).
- Naturally extends to future error types if needed without refactoring.
- The structured data (retryAfter, remaining, isSessionLimit) lives on the error object.

## Design Decision: Rate-Limit UI State

### Option A: Per-stage rate-limit error variables

Each stage gets its own `rateLimitError` alongside `error`, `analysisError`, etc.

**Pros:** Consistent with existing pattern.
**Cons:** A rate limit from one endpoint should block ALL endpoints (they share the same IP window). Duplicating state across 4 stages creates sync bugs.

### Option B: Shared rate-limit state in the page

A single `rateLimit` reactive object on the workshop page that all 4 stages read.

**Pros:** One source of truth. One countdown timer. All buttons check the same flag.
**Cons:** Slightly more coupling, but all 4 stages are already in one file.

### Option C: Separate rate-limit Svelte store

New file `frontend/src/lib/stores/rateLimit.svelte.ts` as a global singleton.

**Pros:** Reusable if rate-limit state is needed elsewhere.
**Cons:** Only one page uses API calls. Over-abstraction for a single consumer.

### Decision: Option B — Shared page-level state

Rationale:
- All 4 API calls are in `+page.svelte`. A shared reactive object is the natural scope.
- One `$effect` manages the countdown timer. All buttons derive their disabled state from it.
- No new files/modules for state. The `RateLimitError` class is the only new export (from `stream.ts`).

## Design Decision: Countdown Timer

Use `$effect` with `setInterval(1000)` that decrements a reactive `retryInSeconds` counter. When it hits 0, clear the rate-limit state. Buttons derive disabled from `retryInSeconds > 0`.

For session limits (`Retry-After: 0`), set a permanent flag with no countdown — display "Session limit reached" permanently.

## Design Decision: Remaining Requests Display

The ticket asks for subtle display of `X-RateLimit-Remaining`. This should update on every successful response too, not just 429s.

### Option A: Track remaining on every response

Modify `streamFromAPI` to extract `X-RateLimit-Remaining` from all responses (including 200s) and expose it.

**Pros:** Always up-to-date. User sees their quota declining.
**Cons:** Requires changing `streamFromAPI` return or adding a callback. In dev mode (no worker), headers won't exist.

### Option B: Only show remaining on 429

Show remaining (which is always 0) plus the limit from the error.

**Pros:** No changes to success path. Simple.
**Cons:** Doesn't fulfill "show remaining request count" AC — by the time you see it, it's always 0.

### Option C: Track remaining via optional callback

Add an optional `onHeaders?: (headers: Headers) => void` callback to `streamFromAPI`. The page uses it to pluck rate-limit headers on every response.

**Pros:** Non-breaking opt-in. Works for both 200 and 429 paths. Clean separation.
**Cons:** Slightly more complex `streamFromAPI` signature.

### Decision: Option C — Optional onHeaders callback

Rationale:
- The AC says "show remaining request count" which implies showing it before hitting the limit.
- The callback is optional so it doesn't affect callers that don't need it.
- On 200 responses, we pluck `X-RateLimit-Remaining` and update a page-level reactive.
- In dev/mock mode, the header is absent — we just don't show remaining (graceful no-op).

## UI Presentation

### Rate-limit banner (429)
- Replace the generic red error with an amber/yellow banner: "You've hit the rate limit. Try again in **Xs**." with a live countdown.
- For session limits: "Session request limit reached. Please start a new session."
- Show prominently above whichever stage triggered it, and disable all action buttons.

### Remaining requests indicator
- Small text below the header or near buttons: "N requests remaining"
- Only shown when the header is present (production/worker only)
- Uses gray/muted styling. Disappears in dev mode (no header).

### Button disable
- All 4 action buttons check `rateLimitActive` derived state
- Added to existing `disabled` conditions with `||`
- Buttons show countdown text when rate-limited: "Wait Xs..."

## Rejected Alternatives

- **Global store for rate-limit state**: Only one page consumes API calls. No need.
- **Auto-retry with backoff**: Not in the AC. Users should consciously retry.
- **Toast/notification system**: The existing error banner pattern is sufficient. Adding a toast system is scope creep.
