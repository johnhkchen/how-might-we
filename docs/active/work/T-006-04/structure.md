# T-006-04 Structure: KV-Backed Rate Limiting

## Files Modified

### 1. `worker/src/index.ts`

**Env interface** — add optional KV binding:
```typescript
interface Env {
    // ... existing fields ...
    RATE_LIMIT?: KVNamespace;  // optional for graceful degradation
}
```

**New KV rate limit functions** (replace/augment existing in-memory functions):

```
checkIpRateLimitKV(kv: KVNamespace, ip: string, max: number): Promise<RateLimitResult>
checkSessionRateLimitKV(kv: KVNamespace, token: string, max: number): Promise<RateLimitResult>
```

These are async (KV operations return Promises). The existing sync in-memory functions remain unchanged for fallback.

**Main handler changes** — conditional dispatch:
```
if env.RATE_LIMIT is defined:
    try await checkIpRateLimitKV(...)
    catch → checkIpRateLimit(...)  // fallback
else:
    checkIpRateLimit(...)          // current behavior
```

Same pattern for session rate limiting.

**In-memory functions** — kept as-is. They serve as:
1. Fallback when KV is unavailable
2. Default for local development (wrangler dev without --kv)

### 2. `worker/wrangler.toml`

Add KV namespace binding. The actual namespace IDs are created via `wrangler kv namespace create` and filled in after creation.

```toml
[[kv_namespaces]]
binding = "RATE_LIMIT"
id = "<production-namespace-id>"
preview_id = "<preview-namespace-id>"
```

## No New Files

All changes fit within the existing `worker/src/index.ts`. The worker is a single-file module and should stay that way — it's only ~260 lines and the KV functions add ~60 lines.

## No Files Deleted

## Module Boundaries

### Public Interface (unchanged)
- HTTP handler: `export default { fetch(request, env) }`
- Same request/response contract
- Same rate limit headers

### Internal Organization

The file is organized in sections (already marked with `// ---` comments):

1. **Types** (`Env`, `RateLimitResult`) — extend `Env` here
2. **Rate Limiting** — add KV functions after existing in-memory functions
3. **Headers** — unchanged
4. **Turnstile** — unchanged
5. **Proxy** — unchanged
6. **Main Handler** — modify to dispatch to KV or in-memory

### Key Naming Convention
- IP keys: `rl:ip:{ip}:{minuteBucket}` — prefix `rl:` for namespacing within the KV store
- Session keys: `rl:session:{token}` — no window suffix (lifetime counter)

### Error Handling

KV failures are caught per-check and fall back to in-memory. The try/catch wraps only the KV read/write, not the entire request flow. This means:
- If IP KV check fails → in-memory IP check runs
- If session KV check fails → in-memory session check runs
- These are independent — one can use KV while the other falls back

## Ordering of Changes

1. Add KV binding to `wrangler.toml` (needed before worker can access `env.RATE_LIMIT`)
2. Add `RATE_LIMIT?: KVNamespace` to `Env` interface
3. Add `checkIpRateLimitKV` function
4. Add `checkSessionRateLimitKV` function
5. Update main handler to dispatch to KV or in-memory
6. Create KV namespaces via CLI (manual step, documented)

## TypeScript Considerations

- `KVNamespace` type comes from `@cloudflare/workers-types` (already installed)
- KV functions are `async` — the main handler is already `async`, so this is seamless
- `KVNamespace.get()` returns `Promise<string | null>` — parse with `parseInt`
- `KVNamespace.put()` accepts string value and options object with `expirationTtl`
