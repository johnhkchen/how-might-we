// SSE client utility for streaming BAML responses

import { apiFetch } from './client';

export async function streamFromAPI<T>(
	endpoint: string,
	body: unknown,
	onPartial: (data: Partial<T>) => void
): Promise<void> {
	const response = await apiFetch(endpoint, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});

	if (!response.ok) {
		throw new Error(`API error: ${response.status} ${response.statusText}`);
	}

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
			if (line.startsWith('data: ') && line !== 'data: [DONE]') {
				onPartial(JSON.parse(line.slice(6)));
			}
		}
	}
}
