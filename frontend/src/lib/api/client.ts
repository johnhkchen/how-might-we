// API client that switches between real and mock fetch based on environment.
// Use this instead of raw fetch() for all API calls.

import { PUBLIC_API_URL } from '$env/static/public';
import { isMockEnabled, mockFetch } from './mock';
import { getToken, TOKEN_HEADER } from '$lib/utils/turnstile';

const SESSION_TOKEN_HEADER = 'X-Session-Token';
const sessionToken = crypto.randomUUID();

function getBaseFetch(): typeof fetch {
	if (isMockEnabled()) {
		return mockFetch as typeof fetch;
	}
	return fetch;
}

const baseFetch = getBaseFetch();

export async function apiFetch(
	input: RequestInfo | URL,
	init?: RequestInit
): Promise<Response> {
	const headers = new Headers(init?.headers);
	headers.set(SESSION_TOKEN_HEADER, sessionToken);

	const turnstileToken = getToken();
	if (turnstileToken) {
		headers.set(TOKEN_HEADER, turnstileToken);
	}

	return baseFetch(input, { ...init, headers });
}

// Base URL for API calls. In dev, Vite proxies /api to localhost:8080.
// In production, this points to the Lambda Function URL.
export function apiUrl(path: string): string {
	const base = PUBLIC_API_URL || '';
	return `${base}${path}`;
}
