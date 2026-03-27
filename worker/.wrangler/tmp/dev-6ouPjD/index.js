var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index.ts
var RATE_LIMIT_WINDOW_MS = 6e4;
function getLimit(val, fallback) {
  if (!val) return fallback;
  const n = parseInt(val, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
__name(getLimit, "getLimit");
var ipTimestamps = /* @__PURE__ */ new Map();
function checkIpRateLimit(ip, max) {
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  let timestamps = ipTimestamps.get(ip);
  if (!timestamps) {
    timestamps = [];
    ipTimestamps.set(ip, timestamps);
  }
  const valid = timestamps.filter((t) => t > cutoff);
  if (valid.length >= max) {
    ipTimestamps.set(ip, valid);
    const resetAt2 = valid[0] + RATE_LIMIT_WINDOW_MS;
    return { allowed: false, remaining: 0, resetAt: resetAt2 };
  }
  valid.push(now);
  ipTimestamps.set(ip, valid);
  if (ipTimestamps.size > 1e4) {
    for (const [key, ts] of ipTimestamps) {
      if (ts.every((t) => t <= cutoff)) {
        ipTimestamps.delete(key);
      }
    }
  }
  const resetAt = valid[0] + RATE_LIMIT_WINDOW_MS;
  return { allowed: true, remaining: max - valid.length, resetAt };
}
__name(checkIpRateLimit, "checkIpRateLimit");
var sessionCounts = /* @__PURE__ */ new Map();
function checkSessionRateLimit(token, max) {
  const count = (sessionCounts.get(token) ?? 0) + 1;
  sessionCounts.set(token, count);
  if (sessionCounts.size > 1e4) {
    for (const [key, c] of sessionCounts) {
      if (c >= max) {
        sessionCounts.delete(key);
      }
    }
  }
  return {
    allowed: count <= max,
    remaining: Math.max(0, max - count),
    resetAt: 0
  };
}
__name(checkSessionRateLimit, "checkSessionRateLimit");
async function checkIpRateLimitKV(kv, ip, max) {
  const now = Date.now();
  const bucket = Math.floor(now / RATE_LIMIT_WINDOW_MS);
  const key = `rl:ip:${ip}:${bucket}`;
  const val = await kv.get(key);
  const count = val ? parseInt(val, 10) : 0;
  const resetAt = (bucket + 1) * RATE_LIMIT_WINDOW_MS;
  if (count >= max) {
    return { allowed: false, remaining: 0, resetAt };
  }
  const newCount = count + 1;
  await kv.put(key, newCount.toString(), { expirationTtl: 120 });
  return { allowed: true, remaining: max - newCount, resetAt };
}
__name(checkIpRateLimitKV, "checkIpRateLimitKV");
async function checkSessionRateLimitKV(kv, token, max) {
  const key = `rl:session:${token}`;
  const val = await kv.get(key);
  const count = val ? parseInt(val, 10) : 0;
  const newCount = count + 1;
  await kv.put(key, newCount.toString(), { expirationTtl: 86400 });
  return {
    allowed: newCount <= max,
    remaining: Math.max(0, max - newCount),
    resetAt: 0
  };
}
__name(checkSessionRateLimitKV, "checkSessionRateLimitKV");
function rateLimitResponseHeaders(result, max) {
  const headers = {
    "X-RateLimit-Limit": max.toString(),
    "X-RateLimit-Remaining": Math.max(0, result.remaining).toString()
  };
  if (result.resetAt > 0) {
    headers["X-RateLimit-Reset"] = Math.ceil(result.resetAt / 1e3).toString();
  }
  return headers;
}
__name(rateLimitResponseHeaders, "rateLimitResponseHeaders");
function isOriginAllowed(env, requestOrigin) {
  const allowed = env.ALLOWED_ORIGIN || "*";
  if (allowed === "*") return true;
  return requestOrigin === allowed;
}
__name(isOriginAllowed, "isOriginAllowed");
function corsHeaders(env, requestOrigin) {
  if (!isOriginAllowed(env, requestOrigin)) {
    return {};
  }
  const allowed = env.ALLOWED_ORIGIN || "*";
  return {
    "Access-Control-Allow-Origin": allowed === "*" ? "*" : requestOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Turnstile-Token, X-Session-Token",
    "Access-Control-Expose-Headers": "X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, Retry-After",
    "Access-Control-Max-Age": "86400"
  };
}
__name(corsHeaders, "corsHeaders");
function jsonError(message, status, env, requestOrigin, extra) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(env, requestOrigin),
      ...extra
    }
  });
}
__name(jsonError, "jsonError");
async function verifyTurnstile(token, secret) {
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret, response: token })
  });
  const result = await response.json();
  return result.success;
}
__name(verifyTurnstile, "verifyTurnstile");
async function proxyToLambda(request, env, requestOrigin, extraHeaders) {
  const url = new URL(request.url);
  const targetUrl = env.LAMBDA_URL.replace(/\/+$/, "") + url.pathname;
  const forwardHeaders = new Headers();
  const contentType = request.headers.get("Content-Type");
  if (contentType) {
    forwardHeaders.set("Content-Type", contentType);
  }
  let lambdaResponse;
  try {
    lambdaResponse = await fetch(targetUrl, {
      method: request.method,
      headers: forwardHeaders,
      body: request.body
    });
  } catch {
    return jsonError("Backend unavailable", 502, env, requestOrigin);
  }
  const responseHeaders = new Headers(lambdaResponse.headers);
  for (const [key, value] of Object.entries(corsHeaders(env, requestOrigin))) {
    responseHeaders.set(key, value);
  }
  for (const [key, value] of Object.entries(extraHeaders)) {
    responseHeaders.set(key, value);
  }
  return new Response(lambdaResponse.body, {
    status: lambdaResponse.status,
    headers: responseHeaders
  });
}
__name(proxyToLambda, "proxyToLambda");
var src_default = {
  async fetch(request, env) {
    const requestOrigin = request.headers.get("Origin");
    if (request.method === "OPTIONS") {
      if (!isOriginAllowed(env, requestOrigin)) {
        return new Response(null, { status: 403 });
      }
      return new Response(null, {
        status: 204,
        headers: corsHeaders(env, requestOrigin)
      });
    }
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) {
      return jsonError("Not found", 404, env, requestOrigin);
    }
    if (request.method !== "POST") {
      return jsonError("Method not allowed", 405, env, requestOrigin);
    }
    const ipMax = getLimit(env.RATE_LIMIT_IP_MAX, 20);
    const sessionMax = getLimit(env.RATE_LIMIT_SESSION_MAX, 50);
    const ip = request.headers.get("cf-connecting-ip") || "unknown";
    let ipResult;
    if (env.RATE_LIMIT) {
      try {
        ipResult = await checkIpRateLimitKV(env.RATE_LIMIT, ip, ipMax);
      } catch {
        ipResult = checkIpRateLimit(ip, ipMax);
      }
    } else {
      ipResult = checkIpRateLimit(ip, ipMax);
    }
    const rlHeaders = rateLimitResponseHeaders(ipResult, ipMax);
    if (!ipResult.allowed) {
      const retryAfter = Math.max(1, Math.ceil((ipResult.resetAt - Date.now()) / 1e3));
      return jsonError("Rate limit exceeded", 429, env, requestOrigin, {
        ...rlHeaders,
        "Retry-After": retryAfter.toString()
      });
    }
    const sessionToken = request.headers.get("X-Session-Token");
    if (sessionToken) {
      let sessionResult;
      if (env.RATE_LIMIT) {
        try {
          sessionResult = await checkSessionRateLimitKV(env.RATE_LIMIT, sessionToken, sessionMax);
        } catch {
          sessionResult = checkSessionRateLimit(sessionToken, sessionMax);
        }
      } else {
        sessionResult = checkSessionRateLimit(sessionToken, sessionMax);
      }
      if (!sessionResult.allowed) {
        return jsonError("Session rate limit exceeded", 429, env, requestOrigin, {
          ...rlHeaders,
          "Retry-After": "0"
        });
      }
    }
    if (env.TURNSTILE_SECRET_KEY) {
      const token = request.headers.get("X-Turnstile-Token") || "";
      if (!token || !await verifyTurnstile(token, env.TURNSTILE_SECRET_KEY)) {
        return jsonError("Verification failed", 403, env, requestOrigin);
      }
    }
    if (!env.LAMBDA_URL) {
      return jsonError("Backend not configured", 502, env, requestOrigin);
    }
    return proxyToLambda(request, env, requestOrigin, rlHeaders);
  }
};

// node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError2 = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError2;

// .wrangler/tmp/bundle-z0UZ5y/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = src_default;

// node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-z0UZ5y/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
