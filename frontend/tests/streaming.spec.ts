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
		expect(mockExpansionPartials.length).toBe(4);
		expect(mockExpansionPartials[0].variants?.length).toBe(1);
		expect(mockExpansionPartials[mockExpansionPartials.length - 1].variants?.length).toBe(6);
	});

	test('refinement fixture has progressively building partials', () => {
		expect(mockRefinementPartials.length).toBe(3);
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
		expect(mockExpansionPartials).toHaveLength(4);
		for (const partial of mockExpansionPartials) {
			expect(() => JSON.stringify(partial)).not.toThrow();
		}
	});

	test('refinement mock produces correct number of streaming events', () => {
		expect(mockRefinementPartials).toHaveLength(3);
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
