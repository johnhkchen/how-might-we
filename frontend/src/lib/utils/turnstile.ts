// Turnstile token lifecycle manager.
// Wraps the Cloudflare Turnstile JS API for explicit rendering and token management.
// When no site key is configured, all functions are safe no-ops.

export const TOKEN_HEADER = 'X-Turnstile-Token';

export type TurnstileStatus = 'loading' | 'ready' | 'failed' | 'error';

interface TurnstileRenderOptions {
	sitekey: string;
	callback: (token: string) => void;
	'expired-callback'?: () => void;
	'error-callback'?: () => void;
	size?: 'invisible' | 'normal' | 'compact';
}

interface TurnstileAPI {
	render(container: string | HTMLElement, options: TurnstileRenderOptions): string;
	reset(widgetId: string): void;
	remove(widgetId: string): void;
}

declare global {
	interface Window {
		turnstile?: TurnstileAPI;
		__turnstileScriptLoaded?: boolean;
		__turnstileScriptFailed?: boolean;
	}
}

let currentToken: string | null = null;
let widgetId: string | null = null;
let resolveWaiter: ((token: string) => void) | null = null;
let statusCallback: ((status: TurnstileStatus) => void) | null = null;
let currentStatus: TurnstileStatus = 'loading';

function setStatus(status: TurnstileStatus): void {
	currentStatus = status;
	statusCallback?.(status);
}

export function notifyScriptLoaded(): void {
	setStatus('ready');
}

export function notifyScriptFailed(): void {
	setStatus('failed');
}

export function getTurnstileStatus(): TurnstileStatus {
	return currentStatus;
}

export function onTurnstileStatus(cb: (status: TurnstileStatus) => void): void {
	statusCallback = cb;
	// Immediately notify with current status (skip 'loading' — only notify meaningful states)
	if (currentStatus !== 'loading') {
		cb(currentStatus);
	}
}

export function initTurnstile(siteKey: string, container: HTMLElement): void {
	// Script already available — render immediately
	if (window.turnstile) {
		renderWidget(siteKey, container);
		return;
	}

	// Script already known to have failed
	if (window.__turnstileScriptFailed) {
		setStatus('failed');
		return;
	}

	// Script still loading — poll for availability
	let attempts = 0;
	const maxAttempts = 6; // 6 x 500ms = 3s
	const interval = setInterval(() => {
		attempts++;
		if (window.turnstile) {
			clearInterval(interval);
			renderWidget(siteKey, container);
		} else if (window.__turnstileScriptFailed || attempts >= maxAttempts) {
			clearInterval(interval);
			setStatus('failed');
		}
	}, 500);
}

function renderWidget(siteKey: string, container: HTMLElement): void {
	if (!window.turnstile) return;

	widgetId = window.turnstile.render(container, {
		sitekey: siteKey,
		size: 'invisible',
		callback: (token: string) => {
			currentToken = token;
			setStatus('ready');
			if (resolveWaiter) {
				resolveWaiter(token);
				resolveWaiter = null;
			}
		},
		'expired-callback': () => {
			currentToken = null;
			// Auto-refresh: reset the widget to get a new token
			if (widgetId && window.turnstile) {
				window.turnstile.reset(widgetId);
			}
		},
		'error-callback': () => {
			currentToken = null;
			setStatus('error');
		}
	});
}

export function getToken(): string | null {
	return currentToken;
}

export function waitForToken(timeoutMs = 3000): Promise<string | null> {
	if (currentToken) return Promise.resolve(currentToken);

	return new Promise((resolve) => {
		const timer = setTimeout(() => {
			resolveWaiter = null;
			resolve(null);
		}, timeoutMs);

		resolveWaiter = (token: string) => {
			clearTimeout(timer);
			resolve(token);
		};
	});
}

export function resetTurnstile(): void {
	currentToken = null;
	if (widgetId && window.turnstile) {
		window.turnstile.reset(widgetId);
	}
}

export function retryTurnstile(siteKey: string, container: HTMLElement): void {
	destroy();
	// Reset failure flags
	if (typeof window !== 'undefined') {
		window.__turnstileScriptFailed = false;
	}
	currentStatus = 'loading';

	if (window.turnstile) {
		renderWidget(siteKey, container);
	} else {
		setStatus('failed');
	}
}

export function destroy(): void {
	if (widgetId && window.turnstile) {
		window.turnstile.remove(widgetId);
	}
	widgetId = null;
	currentToken = null;
	resolveWaiter = null;
}
