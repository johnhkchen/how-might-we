// API client that switches between real and mock fetch based on environment.
// Use this instead of raw fetch() for all API calls.

import { isMockEnabled, mockFetch } from './mock';

function getApiFetch(): typeof fetch {
	if (isMockEnabled()) {
		return mockFetch as typeof fetch;
	}
	return fetch;
}

export const apiFetch = getApiFetch();
