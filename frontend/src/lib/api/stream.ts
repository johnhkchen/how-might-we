// SSE client utility for streaming BAML responses

import { apiFetch, apiUrl } from './client';

export class TurnstileError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'TurnstileError';
	}
}

export class RateLimitError extends Error {
	readonly retryAfter: number;
	readonly remaining: number;
	readonly limit: number;
	readonly isSessionLimit: boolean;

	constructor(opts: {
		retryAfter: number;
		remaining: number;
		limit: number;
		isSessionLimit: boolean;
		message: string;
	}) {
		super(opts.message);
		this.name = 'RateLimitError';
		this.retryAfter = opts.retryAfter;
		this.remaining = opts.remaining;
		this.limit = opts.limit;
		this.isSessionLimit = opts.isSessionLimit;
	}
}

export interface StreamOptions {
	onHeaders?: (headers: Headers) => void;
}

export async function streamFromAPI<T>(
	endpoint: string,
	body: unknown,
	onPartial: (data: Partial<T>) => void,
	options?: StreamOptions
): Promise<void> {
	const response = await apiFetch(apiUrl(endpoint), {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});

	if (!response.ok) {
		if (response.status === 403) {
			let msg = 'Bot protection check failed — try refreshing';
			try {
				const text = await response.text();
				const json = JSON.parse(text);
				if (json.error) msg = json.error;
			} catch {
				// use default message
			}
			throw new TurnstileError(msg);
		}

		if (response.status === 429) {
			const retryAfter = parseInt(response.headers.get('Retry-After') || '0', 10);
			const remaining = parseInt(response.headers.get('X-RateLimit-Remaining') || '0', 10);
			const limit = parseInt(response.headers.get('X-RateLimit-Limit') || '0', 10);
			const isSessionLimit = retryAfter === 0;

			let errorMsg = 'Rate limit exceeded';
			try {
				const text = await response.text();
				const json = JSON.parse(text);
				if (json.error) errorMsg = json.error;
			} catch {
				// use default message
			}

			throw new RateLimitError({
				retryAfter,
				remaining,
				limit,
				isSessionLimit,
				message: errorMsg
			});
		}

		let message = `API error: ${response.status} ${response.statusText}`;
		try {
			const text = await response.text();
			const json = JSON.parse(text);
			if (json.error) message = `API error: ${response.status} — ${json.error}`;
		} catch {
			// response body unreadable or not JSON — use default message
		}
		throw new Error(message);
	}

	options?.onHeaders?.(response.headers);

	const reader = response.body?.getReader();
	if (!reader) throw new Error('No response body');

	const decoder = new TextDecoder();
	let buffer = '';

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });

		const lines = buffer.split('\n\n');
		buffer = lines.pop() || '';

		for (const line of lines) {
			processSSELine(line, endpoint, onPartial);
		}
	}

	// Process any remaining data in the buffer after stream ends
	if (buffer.trim()) {
		processSSELine(buffer, endpoint, onPartial);
	}
}

function processSSELine<T>(
	line: string,
	endpoint: string,
	onPartial: (data: Partial<T>) => void
): void {
	if (line.startsWith('data: ') && line !== 'data: [DONE]') {
		try {
			const parsed = JSON.parse(line.slice(6)) as Partial<T>;
			if (import.meta.env.DEV) {
				console.debug('[SSE]', endpoint, parsed);
			}
			onPartial(parsed);
		} catch {
			console.warn('[SSE] Skipping malformed data:', line);
		}
	}
}
