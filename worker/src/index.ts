interface Env {
	LAMBDA_URL: string;
	ALLOWED_ORIGIN: string;
	TURNSTILE_SECRET_KEY?: string;
	RATE_LIMIT_IP_MAX?: string;
	RATE_LIMIT_SESSION_MAX?: string;
	RATE_LIMIT?: KVNamespace;
}

// --- Rate Limiting ---

interface RateLimitResult {
	allowed: boolean;
	remaining: number;
	/** Unix ms when the oldest entry in the window expires (0 if not applicable) */
	resetAt: number;
}

const RATE_LIMIT_WINDOW_MS = 60_000;

function getLimit(val: string | undefined, fallback: number): number {
	if (!val) return fallback;
	const n = parseInt(val, 10);
	return Number.isFinite(n) && n > 0 ? n : fallback;
}

// Per-IP sliding window
const ipTimestamps = new Map<string, number[]>();

function checkIpRateLimit(ip: string, max: number): RateLimitResult {
	const now = Date.now();
	const cutoff = now - RATE_LIMIT_WINDOW_MS;

	let timestamps = ipTimestamps.get(ip);
	if (!timestamps) {
		timestamps = [];
		ipTimestamps.set(ip, timestamps);
	}

	// Remove expired timestamps
	const valid = timestamps.filter((t) => t > cutoff);

	if (valid.length >= max) {
		ipTimestamps.set(ip, valid);
		const resetAt = valid[0] + RATE_LIMIT_WINDOW_MS;
		return { allowed: false, remaining: 0, resetAt };
	}

	valid.push(now);
	ipTimestamps.set(ip, valid);

	// Periodic cleanup: remove IPs with no recent requests
	if (ipTimestamps.size > 10_000) {
		for (const [key, ts] of ipTimestamps) {
			if (ts.every((t) => t <= cutoff)) {
				ipTimestamps.delete(key);
			}
		}
	}

	const resetAt = valid[0] + RATE_LIMIT_WINDOW_MS;
	return { allowed: true, remaining: max - valid.length, resetAt };
}

// Per-session lifetime counter
const sessionCounts = new Map<string, number>();

function checkSessionRateLimit(token: string, max: number): RateLimitResult {
	const count = (sessionCounts.get(token) ?? 0) + 1;
	sessionCounts.set(token, count);

	// Periodic cleanup: remove exhausted sessions
	if (sessionCounts.size > 10_000) {
		for (const [key, c] of sessionCounts) {
			if (c >= max) {
				sessionCounts.delete(key);
			}
		}
	}

	return {
		allowed: count <= max,
		remaining: Math.max(0, max - count),
		resetAt: 0,
	};
}

// --- KV-Backed Rate Limiting ---
// Uses Cloudflare KV for global rate limit state shared across all isolates
// and edge locations. Falls back to in-memory if KV is unavailable.
// KV free tier: 100k reads/day, 1k writes/day.
// Each request costs 2 reads + 2 writes (IP + session).

async function checkIpRateLimitKV(kv: KVNamespace, ip: string, max: number): Promise<RateLimitResult> {
	const now = Date.now();
	const bucket = Math.floor(now / RATE_LIMIT_WINDOW_MS);
	const key = `rl:ip:${ip}:${bucket}`;

	const val = await kv.get(key);
	const count = val ? parseInt(val, 10) : 0;

	// End of current bucket in Unix ms
	const resetAt = (bucket + 1) * RATE_LIMIT_WINDOW_MS;

	if (count >= max) {
		return { allowed: false, remaining: 0, resetAt };
	}

	const newCount = count + 1;
	// TTL of 2× window ensures the key lives through the full bucket plus buffer
	await kv.put(key, newCount.toString(), { expirationTtl: 120 });

	return { allowed: true, remaining: max - newCount, resetAt };
}

async function checkSessionRateLimitKV(kv: KVNamespace, token: string, max: number): Promise<RateLimitResult> {
	const key = `rl:session:${token}`;

	const val = await kv.get(key);
	const count = val ? parseInt(val, 10) : 0;
	const newCount = count + 1;

	// 24h TTL for session counters (cleanup only; session limits are lifetime)
	await kv.put(key, newCount.toString(), { expirationTtl: 86400 });

	return {
		allowed: newCount <= max,
		remaining: Math.max(0, max - newCount),
		resetAt: 0,
	};
}

// --- Headers ---

function rateLimitResponseHeaders(result: RateLimitResult, max: number): Record<string, string> {
	const headers: Record<string, string> = {
		'X-RateLimit-Limit': max.toString(),
		'X-RateLimit-Remaining': Math.max(0, result.remaining).toString(),
	};
	if (result.resetAt > 0) {
		headers['X-RateLimit-Reset'] = Math.ceil(result.resetAt / 1000).toString();
	}
	return headers;
}

function isOriginAllowed(env: Env, requestOrigin: string | null): boolean {
	const allowed = env.ALLOWED_ORIGIN || '*';
	if (allowed === '*') return true;
	return requestOrigin === allowed;
}

function corsHeaders(env: Env, requestOrigin: string | null): Record<string, string> {
	if (!isOriginAllowed(env, requestOrigin)) {
		return {};
	}
	const allowed = env.ALLOWED_ORIGIN || '*';
	return {
		'Access-Control-Allow-Origin': allowed === '*' ? '*' : requestOrigin!,
		'Access-Control-Allow-Methods': 'POST, OPTIONS',
		'Access-Control-Allow-Headers': 'Content-Type, X-Turnstile-Token, X-Session-Token',
		'Access-Control-Expose-Headers': 'X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, Retry-After',
		'Access-Control-Max-Age': '86400',
	};
}

function jsonError(message: string, status: number, env: Env, requestOrigin: string | null, extra?: Record<string, string>): Response {
	return new Response(JSON.stringify({ error: message }), {
		status,
		headers: {
			'Content-Type': 'application/json',
			...corsHeaders(env, requestOrigin),
			...extra,
		},
	});
}

// --- Turnstile ---

async function verifyTurnstile(token: string, secret: string): Promise<boolean> {
	const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ secret, response: token }),
	});
	const result = (await response.json()) as { success: boolean };
	return result.success;
}

// --- Proxy ---

async function proxyToLambda(request: Request, env: Env, requestOrigin: string | null, extraHeaders: Record<string, string>): Promise<Response> {
	const url = new URL(request.url);
	const targetUrl = env.LAMBDA_URL.replace(/\/+$/, '') + url.pathname;

	// Forward only safe headers to Lambda
	const forwardHeaders = new Headers();
	const contentType = request.headers.get('Content-Type');
	if (contentType) {
		forwardHeaders.set('Content-Type', contentType);
	}

	let lambdaResponse: Response;
	try {
		lambdaResponse = await fetch(targetUrl, {
			method: request.method,
			headers: forwardHeaders,
			body: request.body,
		});
	} catch {
		return jsonError('Backend unavailable', 502, env, requestOrigin);
	}

	// Build response headers: Lambda headers + CORS + rate limit
	const responseHeaders = new Headers(lambdaResponse.headers);
	for (const [key, value] of Object.entries(corsHeaders(env, requestOrigin))) {
		responseHeaders.set(key, value);
	}
	for (const [key, value] of Object.entries(extraHeaders)) {
		responseHeaders.set(key, value);
	}

	// Pass through the response body as a stream (no buffering)
	return new Response(lambdaResponse.body, {
		status: lambdaResponse.status,
		headers: responseHeaders,
	});
}

// --- Main Handler ---

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const requestOrigin = request.headers.get('Origin');

		// CORS preflight
		if (request.method === 'OPTIONS') {
			if (!isOriginAllowed(env, requestOrigin)) {
				return new Response(null, { status: 403 });
			}
			return new Response(null, {
				status: 204,
				headers: corsHeaders(env, requestOrigin),
			});
		}

		const url = new URL(request.url);

		// Only proxy /api/* paths
		if (!url.pathname.startsWith('/api/')) {
			return jsonError('Not found', 404, env, requestOrigin);
		}

		// Only allow POST
		if (request.method !== 'POST') {
			return jsonError('Method not allowed', 405, env, requestOrigin);
		}

		// Parse configurable limits
		const ipMax = getLimit(env.RATE_LIMIT_IP_MAX, 20);
		const sessionMax = getLimit(env.RATE_LIMIT_SESSION_MAX, 50);

		// Rate limiting by IP — use KV when available, fall back to in-memory
		const ip = request.headers.get('cf-connecting-ip') || 'unknown';
		let ipResult: RateLimitResult;
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
			const retryAfter = Math.max(1, Math.ceil((ipResult.resetAt - Date.now()) / 1000));
			return jsonError('Rate limit exceeded', 429, env, requestOrigin, {
				...rlHeaders,
				'Retry-After': retryAfter.toString(),
			});
		}

		// Rate limiting by session — use KV when available, fall back to in-memory
		const sessionToken = request.headers.get('X-Session-Token');
		if (sessionToken) {
			let sessionResult: RateLimitResult;
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
				return jsonError('Session rate limit exceeded', 429, env, requestOrigin, {
					...rlHeaders,
					'Retry-After': '0',
				});
			}
		}

		// Turnstile verification (placeholder — active when secret is configured)
		if (env.TURNSTILE_SECRET_KEY) {
			const token = request.headers.get('X-Turnstile-Token') || '';
			if (!token || !(await verifyTurnstile(token, env.TURNSTILE_SECRET_KEY))) {
				return jsonError('Verification failed', 403, env, requestOrigin);
			}
		}

		// Check backend is configured
		if (!env.LAMBDA_URL) {
			return jsonError('Backend not configured', 502, env, requestOrigin);
		}

		// Proxy to Lambda with rate limit headers
		return proxyToLambda(request, env, requestOrigin, rlHeaders);
	},
} satisfies ExportedHandler<Env>;
