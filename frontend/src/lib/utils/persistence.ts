// localStorage persistence for HMW workshop session state.
// Saves/loads session data with 24-hour expiry and version stamping.

import type {
	Persona,
	ProblemContext,
	HMWAnalysis,
	HMWCandidate,
	Constraint
} from '$lib/stores/session.svelte';

export const STORAGE_KEY = 'hmw-session';
export const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface SavedSessionStore {
	persona: Persona | null;
	problemContext: ProblemContext | null;
	analysis: HMWAnalysis | null;
	candidates: HMWCandidate[];
	iterationCount: number;
}

export interface SavedSessionPage {
	personaDescription: string;
	domain: string;
	constraints: Constraint[];
	hmwStatement: string;
	emergentTheme: string | null;
}

export interface SavedSession {
	version: 1;
	savedAt: number;
	store: SavedSessionStore;
	page: SavedSessionPage;
}

export function saveSession(store: SavedSessionStore, page: SavedSessionPage): void {
	if (typeof window === 'undefined') return;

	const data: SavedSession = {
		version: 1,
		savedAt: Date.now(),
		store,
		page
	};

	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
	} catch {
		// Storage full or blocked — fail silently
	}
}

export function loadSession(): SavedSession | null {
	if (typeof window === 'undefined') return null;

	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return null;

		const data = JSON.parse(raw) as SavedSession;

		if (data.version !== 1) {
			localStorage.removeItem(STORAGE_KEY);
			return null;
		}

		if (Date.now() - data.savedAt > MAX_AGE_MS) {
			localStorage.removeItem(STORAGE_KEY);
			return null;
		}

		// Basic shape validation — ensure store and page sections exist
		if (!data.store || !data.page) {
			localStorage.removeItem(STORAGE_KEY);
			return null;
		}

		return data;
	} catch {
		// Corrupt data — remove and return null
		localStorage.removeItem(STORAGE_KEY);
		return null;
	}
}

export function clearSession(): void {
	if (typeof window === 'undefined') return;

	try {
		localStorage.removeItem(STORAGE_KEY);
	} catch {
		// Blocked — fail silently
	}
}
