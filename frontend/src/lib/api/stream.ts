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
