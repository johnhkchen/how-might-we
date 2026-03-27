// Mock API server for frontend development without LLM costs.
// Activated by setting VITE_MOCK_API=true (npm run dev:mock).
//
// Returns realistic BAML-typed streaming responses from fixtures,
// delivering partials with realistic timing to simulate SSE streaming.

import {
	mockPersonaPartials,
	mockAnalysisPartials,
	mockExpansionPartials,
	mockRefinementPartials
} from '../../../tests/fixtures';

const STREAM_DELAY_MS = 150;

type MockPartials = Record<string, Partial<unknown>[]>;

const mockData: MockPartials = {
	'/api/persona': mockPersonaPartials,
	'/api/analyze': mockAnalysisPartials,
	'/api/expand': mockExpansionPartials,
	'/api/refine': mockRefinementPartials
};

function createSSEStream(partials: Partial<unknown>[]): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder();
	let index = 0;

	return new ReadableStream({
		async pull(controller) {
			if (index < partials.length) {
				await new Promise((resolve) => setTimeout(resolve, STREAM_DELAY_MS));
				const data = `data: ${JSON.stringify(partials[index])}\n\n`;
				controller.enqueue(encoder.encode(data));
				index++;
			} else {
				controller.enqueue(encoder.encode('data: [DONE]\n\n'));
				controller.close();
			}
		}
	});
}

// Allow tests to override mock responses for specific paths
interface MockOverride {
	status: number;
	headers: Record<string, string>;
	body: string;
}

declare global {
	interface Window {
		__mockApiOverride?: Record<string, MockOverride>;
	}
}

export function mockFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
	const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
	const path = new URL(url, 'http://localhost').pathname;

	// Test override takes priority
	const override = typeof window !== 'undefined' && window.__mockApiOverride?.[path];
	if (override) {
		return Promise.resolve(
			new Response(override.body, {
				status: override.status,
				headers: override.headers
			})
		);
	}

	const partials = mockData[path];

	if (partials) {
		return Promise.resolve(
			new Response(createSSEStream(partials), {
				status: 200,
				headers: {
					'Content-Type': 'text/event-stream',
					'Cache-Control': 'no-cache'
				}
			})
		);
	}

	// Fall through to real fetch for non-API routes
	return fetch(input, init);
}

export function isMockEnabled(): boolean {
	return import.meta.env.VITE_MOCK_API === 'true';
}
