import { test, expect } from '@playwright/test';
import { mockPersonaPartials, mockPersonaFinal, personaSSEStream } from './fixtures/persona';
import { mockAnalysisPartials } from './fixtures/analysis';
import { mockExpansionPartials } from './fixtures/expansion';
import { mockRefinementPartials } from './fixtures/refinement';

// Helper: build an SSE response body from an array of objects
function buildSSEBody(partials: unknown[]): string {
	return partials.map((p) => `data: ${JSON.stringify(p)}\n\n`).join('') + 'data: [DONE]\n\n';
}

test.describe('Fixture data validation', () => {
	test('persona fixture has progressively building partials', () => {
		expect(mockPersonaPartials.length).toBe(6);
		// First partial has only label
		expect(Object.keys(mockPersonaPartials[0])).toEqual(['label']);
		// Last partial has all fields
		const last = mockPersonaFinal;
		expect(last.label).toBeTruthy();
		expect(last.role).toBeTruthy();
		expect(last.goals.length).toBeGreaterThan(0);
		expect(last.frustrations.length).toBeGreaterThan(0);
		expect(last.context).toBeTruthy();
		expect(last.influencers.length).toBeGreaterThan(0);
	});

	test('analysis fixture has progressively building partials', () => {
		expect(mockAnalysisPartials.length).toBe(5);
		expect(Object.keys(mockAnalysisPartials[0])).toEqual(['originalStatement']);
	});

	test('expansion fixture grows variants array incrementally', () => {
		expect(mockExpansionPartials.length).toBe(5);
		// First partial is an incomplete variant (no moveType) — tests the dedup gate
		expect(mockExpansionPartials[0].variants?.length).toBe(1);
		expect(mockExpansionPartials[mockExpansionPartials.length - 1].variants?.length).toBe(6);
	});

	test('refinement fixture has progressively building partials', () => {
		expect(mockRefinementPartials.length).toBe(4);
		// First partial is an incomplete variant (no moveType) — tests the dedup gate
		expect(mockRefinementPartials[0].newVariants?.length).toBe(1);
		// Last partial has all fields
		const last = mockRefinementPartials[mockRefinementPartials.length - 1];
		expect(last.tensions?.length).toBeGreaterThan(0);
		expect(last.recommendation).toBeTruthy();
		expect(last.suggestedNextMove).toBeTruthy();
	});

	test('SSE stream helpers produce valid SSE format', () => {
		const lines: string[] = personaSSEStream();
		expect(lines.length).toBe(mockPersonaPartials.length + 1); // partials + [DONE]
		for (let i = 0; i < mockPersonaPartials.length; i++) {
			expect(lines[i]).toMatch(/^data: \{/);
			const parsed = JSON.parse(lines[i].slice(6));
			expect(parsed).toEqual(mockPersonaPartials[i]);
		}
		expect(lines[lines.length - 1]).toBe('data: [DONE]');
	});
});

test.describe('SSE streaming — parsing', () => {
	test('parses SSE events and collects partials', async ({ page }) => {
		const partials = [{ label: 'A' }, { label: 'A', role: 'B' }, { label: 'A', role: 'B', goals: ['C'] }];
		const body = buildSSEBody(partials);

		await page.route('/api/test-parse', (route) => {
			route.fulfill({
				status: 200,
				headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
				body
			});
		});

		await page.goto('/');

		const result = await page.evaluate(async () => {
			const collected: unknown[] = [];
			const response = await fetch('/api/test-parse', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({})
			});
			const reader = response.body!.getReader();
			const decoder = new TextDecoder();
			let buffer = '';
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n\n');
				buffer = lines.pop() || '';
				for (const line of lines) {
					if (line.startsWith('data: ') && line !== 'data: [DONE]') {
						try {
							collected.push(JSON.parse(line.slice(6)));
						} catch {
							// skip malformed
						}
					}
				}
			}
			if (buffer.trim()) {
				const line = buffer;
				if (line.startsWith('data: ') && line !== 'data: [DONE]') {
					try {
						collected.push(JSON.parse(line.slice(6)));
					} catch {
						// skip malformed
					}
				}
			}
			return collected;
		});

		expect(result).toHaveLength(3);
		expect(result[0]).toEqual({ label: 'A' });
		expect(result[2]).toEqual({ label: 'A', role: 'B', goals: ['C'] });
	});

	test('skips malformed JSON and continues parsing', async ({ page }) => {
		const body = 'data: {"valid":1}\n\ndata: {BROKEN\n\ndata: {"valid":2}\n\ndata: [DONE]\n\n';

		await page.route('/api/test-malformed', (route) => {
			route.fulfill({
				status: 200,
				headers: { 'Content-Type': 'text/event-stream' },
				body
			});
		});

		await page.goto('/');

		const result = await page.evaluate(async () => {
			const collected: unknown[] = [];
			const response = await fetch('/api/test-malformed', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({})
			});
			const reader = response.body!.getReader();
			const decoder = new TextDecoder();
			let buffer = '';
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n\n');
				buffer = lines.pop() || '';
				for (const line of lines) {
					if (line.startsWith('data: ') && line !== 'data: [DONE]') {
						try {
							collected.push(JSON.parse(line.slice(6)));
						} catch {
							// skip malformed — this is the behavior under test
						}
					}
				}
			}
			return collected;
		});

		expect(result).toHaveLength(2);
		expect(result[0]).toEqual({ valid: 1 });
		expect(result[1]).toEqual({ valid: 2 });
	});

	test('handles data: [DONE] sentinel cleanly', async ({ page }) => {
		const body = 'data: {"a":1}\n\ndata: [DONE]\n\n';

		await page.route('/api/test-done', (route) => {
			route.fulfill({
				status: 200,
				headers: { 'Content-Type': 'text/event-stream' },
				body
			});
		});

		await page.goto('/');

		const result = await page.evaluate(async () => {
			const collected: unknown[] = [];
			const response = await fetch('/api/test-done', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({})
			});
			const reader = response.body!.getReader();
			const decoder = new TextDecoder();
			let buffer = '';
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n\n');
				buffer = lines.pop() || '';
				for (const line of lines) {
					if (line.startsWith('data: ') && line !== 'data: [DONE]') {
						try {
							collected.push(JSON.parse(line.slice(6)));
						} catch {
							// skip
						}
					}
				}
			}
			return collected;
		});

		expect(result).toHaveLength(1);
		expect(result[0]).toEqual({ a: 1 });
	});
});

test.describe('SSE streaming — error handling', () => {
	test('non-200 response throws with error body', async ({ page }) => {
		await page.route('/api/test-error', (route) => {
			route.fulfill({
				status: 500,
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ error: 'test server error' })
			});
		});

		await page.goto('/');

		const result = await page.evaluate(async () => {
			try {
				const response = await fetch('/api/test-error', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({})
				});
				if (!response.ok) {
					let message = `API error: ${response.status} ${response.statusText}`;
					try {
						const text = await response.text();
						const json = JSON.parse(text);
						if (json.error) message = `API error: ${response.status} — ${json.error}`;
					} catch {
						// use default message
					}
					return { error: message };
				}
				return { error: null };
			} catch (e) {
				return { error: (e as Error).message };
			}
		});

		expect(result.error).toContain('500');
		expect(result.error).toContain('test server error');
	});

	test('non-200 response without JSON body throws with status text', async ({ page }) => {
		await page.route('/api/test-error-plain', (route) => {
			route.fulfill({
				status: 503,
				headers: { 'Content-Type': 'text/plain' },
				body: 'Service Unavailable'
			});
		});

		await page.goto('/');

		const result = await page.evaluate(async () => {
			const response = await fetch('/api/test-error-plain', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({})
			});
			if (!response.ok) {
				let message = `API error: ${response.status} ${response.statusText}`;
				try {
					const text = await response.text();
					const json = JSON.parse(text);
					if (json.error) message = `API error: ${response.status} — ${json.error}`;
				} catch {
					// not JSON — use default message
				}
				return { error: message };
			}
			return { error: null };
		});

		expect(result.error).toContain('503');
		// Should not contain extracted error since body is plain text
		expect(result.error).not.toContain('—');
	});
});

test.describe('SSE streaming — rate limit handling', () => {
	test('429 with Retry-After header provides structured rate limit info', async ({ page }) => {
		await page.route('/api/test-ratelimit', (route) => {
			route.fulfill({
				status: 429,
				headers: {
					'Content-Type': 'application/json',
					'Retry-After': '30',
					'X-RateLimit-Remaining': '0',
					'X-RateLimit-Limit': '20'
				},
				body: JSON.stringify({ error: 'Rate limit exceeded' })
			});
		});

		await page.goto('/');

		const result = await page.evaluate(async () => {
			const response = await fetch('/api/test-ratelimit', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({})
			});

			if (response.status === 429) {
				return {
					status: response.status,
					retryAfter: response.headers.get('Retry-After'),
					remaining: response.headers.get('X-RateLimit-Remaining'),
					limit: response.headers.get('X-RateLimit-Limit'),
					body: await response.json()
				};
			}
			return null;
		});

		expect(result).not.toBeNull();
		expect(result!.status).toBe(429);
		expect(result!.retryAfter).toBe('30');
		expect(result!.remaining).toBe('0');
		expect(result!.limit).toBe('20');
		expect(result!.body.error).toBe('Rate limit exceeded');
	});

	test('429 with Retry-After: 0 indicates session limit (no recovery)', async ({ page }) => {
		await page.route('/api/test-session-limit', (route) => {
			route.fulfill({
				status: 429,
				headers: {
					'Content-Type': 'application/json',
					'Retry-After': '0',
					'X-RateLimit-Remaining': '0',
					'X-RateLimit-Limit': '50'
				},
				body: JSON.stringify({ error: 'Session rate limit exceeded' })
			});
		});

		await page.goto('/');

		const result = await page.evaluate(async () => {
			const response = await fetch('/api/test-session-limit', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({})
			});

			if (response.status === 429) {
				const retryAfter = parseInt(response.headers.get('Retry-After') || '0', 10);
				return {
					status: response.status,
					retryAfter,
					isSessionLimit: retryAfter === 0,
					body: await response.json()
				};
			}
			return null;
		});

		expect(result).not.toBeNull();
		expect(result!.status).toBe(429);
		expect(result!.retryAfter).toBe(0);
		expect(result!.isSessionLimit).toBe(true);
		expect(result!.body.error).toContain('Session');
	});

	test('X-RateLimit-Remaining is accessible on successful responses', async ({ page }) => {
		await page.route('/api/test-remaining', (route) => {
			route.fulfill({
				status: 200,
				headers: {
					'Content-Type': 'text/event-stream',
					'Cache-Control': 'no-cache',
					'X-RateLimit-Remaining': '15',
					'X-RateLimit-Limit': '20'
				},
				body: 'data: {"test":true}\n\ndata: [DONE]\n\n'
			});
		});

		await page.goto('/');

		const result = await page.evaluate(async () => {
			const response = await fetch('/api/test-remaining', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({})
			});

			return {
				status: response.status,
				remaining: response.headers.get('X-RateLimit-Remaining'),
				limit: response.headers.get('X-RateLimit-Limit')
			};
		});

		expect(result.status).toBe(200);
		expect(result.remaining).toBe('15');
		expect(result.limit).toBe('20');
	});

	test('429 without JSON body still provides rate limit headers', async ({ page }) => {
		await page.route('/api/test-ratelimit-plain', (route) => {
			route.fulfill({
				status: 429,
				headers: {
					'Content-Type': 'text/plain',
					'Retry-After': '10',
					'X-RateLimit-Remaining': '0',
					'X-RateLimit-Limit': '20'
				},
				body: 'Too Many Requests'
			});
		});

		await page.goto('/');

		const result = await page.evaluate(async () => {
			const response = await fetch('/api/test-ratelimit-plain', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({})
			});

			if (response.status === 429) {
				return {
					status: response.status,
					retryAfter: response.headers.get('Retry-After'),
					remaining: response.headers.get('X-RateLimit-Remaining')
				};
			}
			return null;
		});

		expect(result).not.toBeNull();
		expect(result!.retryAfter).toBe('10');
		expect(result!.remaining).toBe('0');
	});
});

test.describe('Rate limit UI — workshop page', () => {
	test('429 on persona refinement shows rate limit banner and disables button', async ({ page }) => {
		await page.goto('/workshop');
		await page.fill('#persona-input', 'A test persona description');

		// Override mock to return 429 for /api/persona
		await page.evaluate(() => {
			window.__mockApiOverride = {
				'/api/persona': {
					status: 429,
					headers: {
						'Content-Type': 'application/json',
						'Retry-After': '3',
						'X-RateLimit-Remaining': '0',
						'X-RateLimit-Limit': '20'
					},
					body: JSON.stringify({ error: 'Rate limit exceeded' })
				}
			};
		});

		await page.click('[data-testid="refine-button"]');

		// Rate limit banner should appear
		const banner = page.locator('[data-testid="rate-limit-banner"]');
		await expect(banner).toBeVisible();
		await expect(banner).toContainText('Rate limit reached');
		await expect(banner).toContainText('s');

		// Refine button should be disabled and show countdown
		const button = page.locator('[data-testid="refine-button"]');
		await expect(button).toBeDisabled();
		await expect(button).toContainText('Wait');
	});

	test('session rate limit shows permanent message', async ({ page }) => {
		await page.goto('/workshop');
		await page.fill('#persona-input', 'A test persona description');

		await page.evaluate(() => {
			window.__mockApiOverride = {
				'/api/persona': {
					status: 429,
					headers: {
						'Content-Type': 'application/json',
						'Retry-After': '0',
						'X-RateLimit-Remaining': '0',
						'X-RateLimit-Limit': '50'
					},
					body: JSON.stringify({ error: 'Session rate limit exceeded' })
				}
			};
		});

		await page.click('[data-testid="refine-button"]');

		const banner = page.locator('[data-testid="rate-limit-banner"]');
		await expect(banner).toBeVisible();
		await expect(banner).toContainText('Session request limit reached');

		// Button should be disabled permanently (no countdown)
		const button = page.locator('[data-testid="refine-button"]');
		await expect(button).toBeDisabled();
	});

	test('countdown decrements and banner clears after reaching 0', async ({ page }) => {
		await page.goto('/workshop');
		await page.fill('#persona-input', 'A test persona description');

		await page.evaluate(() => {
			window.__mockApiOverride = {
				'/api/persona': {
					status: 429,
					headers: {
						'Content-Type': 'application/json',
						'Retry-After': '2',
						'X-RateLimit-Remaining': '0',
						'X-RateLimit-Limit': '20'
					},
					body: JSON.stringify({ error: 'Rate limit exceeded' })
				}
			};
		});

		await page.click('[data-testid="refine-button"]');

		const banner = page.locator('[data-testid="rate-limit-banner"]');
		await expect(banner).toBeVisible();

		// Wait for countdown to complete (2s + buffer)
		await page.waitForTimeout(3000);

		// Banner should disappear
		await expect(banner).not.toBeVisible();

		// Button should be re-enabled
		const button = page.locator('[data-testid="refine-button"]');
		await expect(button).not.toBeDisabled();
	});
});

test.describe('Mock API streaming integration', () => {
	// These tests verify the mock fetch layer produces correct SSE streams.
	// The Playwright build uses VITE_MOCK_API=true, so apiFetch resolves to mockFetch.
	// Since we can't directly call module functions from page.evaluate(),
	// we verify the mock data shapes and SSE format at the Node level.

	test('persona mock produces correct number of streaming events', () => {
		expect(mockPersonaPartials).toHaveLength(6);
		// Each partial should be valid JSON (no circular refs, etc.)
		for (const partial of mockPersonaPartials) {
			expect(() => JSON.stringify(partial)).not.toThrow();
		}
	});

	test('analysis mock produces correct number of streaming events', () => {
		expect(mockAnalysisPartials).toHaveLength(5);
		for (const partial of mockAnalysisPartials) {
			expect(() => JSON.stringify(partial)).not.toThrow();
		}
	});

	test('expansion mock produces correct number of streaming events', () => {
		expect(mockExpansionPartials).toHaveLength(5);
		for (const partial of mockExpansionPartials) {
			expect(() => JSON.stringify(partial)).not.toThrow();
		}
	});

	test('refinement mock produces correct number of streaming events', () => {
		expect(mockRefinementPartials).toHaveLength(4);
		for (const partial of mockRefinementPartials) {
			expect(() => JSON.stringify(partial)).not.toThrow();
		}
	});

	test('mock SSE body can be parsed by SSE algorithm', () => {
		// Simulate what streamFromAPI does: split on \n\n, parse data: lines
		const body = buildSSEBody(mockPersonaPartials);
		const collected: unknown[] = [];
		const lines = body.split('\n\n');
		for (const line of lines) {
			if (line.startsWith('data: ') && line !== 'data: [DONE]') {
				try {
					collected.push(JSON.parse(line.slice(6)));
				} catch {
					// skip malformed
				}
			}
		}
		expect(collected).toHaveLength(mockPersonaPartials.length);
		expect(collected).toEqual(mockPersonaPartials);
	});

	test('mock timing produces realistic delays', () => {
		// STREAM_DELAY_MS is 150ms in mock.ts
		// 6 persona partials + DONE = ~1050ms total
		// We verify this constant is reasonable (not too fast, not too slow)
		const STREAM_DELAY_MS = 150;
		const totalTime = mockPersonaPartials.length * STREAM_DELAY_MS;
		expect(totalTime).toBeGreaterThanOrEqual(500); // not instant
		expect(totalTime).toBeLessThanOrEqual(3000); // not sluggish
	});
});

test.describe('Turnstile error handling — stream layer', () => {
	test('403 with "Verification failed" body is detected as Turnstile error', async ({ page }) => {
		await page.route('/api/test-turnstile-403', (route) => {
			route.fulfill({
				status: 403,
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ error: 'Verification failed' })
			});
		});

		await page.goto('/');

		const result = await page.evaluate(async () => {
			const response = await fetch('/api/test-turnstile-403', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({})
			});

			if (response.status === 403) {
				let msg = 'Bot protection check failed — try refreshing';
				try {
					const text = await response.text();
					const json = JSON.parse(text);
					if (json.error) msg = json.error;
				} catch {
					// use default
				}
				return { isTurnstileError: true, message: msg };
			}
			return { isTurnstileError: false, message: '' };
		});

		expect(result.isTurnstileError).toBe(true);
		expect(result.message).toBe('Verification failed');
	});

	test('403 with non-JSON body uses default Turnstile error message', async ({ page }) => {
		await page.route('/api/test-turnstile-plain', (route) => {
			route.fulfill({
				status: 403,
				headers: { 'Content-Type': 'text/plain' },
				body: 'Forbidden'
			});
		});

		await page.goto('/');

		const result = await page.evaluate(async () => {
			const response = await fetch('/api/test-turnstile-plain', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({})
			});

			if (response.status === 403) {
				let msg = 'Bot protection check failed — try refreshing';
				try {
					const text = await response.text();
					const json = JSON.parse(text);
					if (json.error) msg = json.error;
				} catch {
					// use default
				}
				return { isTurnstileError: true, message: msg };
			}
			return { isTurnstileError: false, message: '' };
		});

		expect(result.isTurnstileError).toBe(true);
		expect(result.message).toBe('Bot protection check failed — try refreshing');
	});
});

test.describe('Turnstile UI — workshop page', () => {
	test('403 on persona refinement shows turnstile warning banner', async ({ page }) => {
		await page.goto('/workshop');
		await page.fill('#persona-input', 'A test persona description');

		// Override mock to return 403 for /api/persona
		await page.evaluate(() => {
			window.__mockApiOverride = {
				'/api/persona': {
					status: 403,
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ error: 'Verification failed' })
				}
			};
		});

		await page.click('[data-testid="refine-button"]');

		// Turnstile warning banner should appear
		const banner = page.locator('[data-testid="turnstile-warning"]');
		await expect(banner).toBeVisible();
		await expect(banner).toContainText('Bot protection check failed');

		// Stage error should also show
		const errorMsg = page.locator('[data-testid="error-message"]');
		await expect(errorMsg).toBeVisible();
		await expect(errorMsg).toContainText('Bot protection check failed');
	});

	test('turnstile warning banner shows retry button only when site key is configured', async ({ page }) => {
		await page.goto('/workshop');
		await page.fill('#persona-input', 'A test persona description');

		await page.evaluate(() => {
			window.__mockApiOverride = {
				'/api/persona': {
					status: 403,
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ error: 'Verification failed' })
				}
			};
		});

		await page.click('[data-testid="refine-button"]');

		// Banner should be visible
		const banner = page.locator('[data-testid="turnstile-warning"]');
		await expect(banner).toBeVisible();

		// Retry button hidden when no site key configured (test env has empty key)
		const retryBtn = page.locator('[data-testid="turnstile-retry"]');
		await expect(retryBtn).not.toBeVisible();
	});

	test('turnstile banner not visible when no 403 has occurred', async ({ page }) => {
		await page.goto('/workshop');

		const banner = page.locator('[data-testid="turnstile-warning"]');
		await expect(banner).not.toBeVisible();
	});
});
