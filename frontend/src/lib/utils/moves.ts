import type { MoveType } from '$lib/stores/session.svelte';

export const moveColors: Record<MoveType, { bg: string; text: string }> = {
	narrowed: { bg: 'bg-green-100', text: 'text-green-800' },
	broadened: { bg: 'bg-purple-100', text: 'text-purple-800' },
	shifted_user: { bg: 'bg-orange-100', text: 'text-orange-800' },
	reframed_constraint: { bg: 'bg-teal-100', text: 'text-teal-800' },
	elevated_abstraction: { bg: 'bg-indigo-100', text: 'text-indigo-800' },
	inverted: { bg: 'bg-red-100', text: 'text-red-800' },
	combined: { bg: 'bg-amber-100', text: 'text-amber-800' },
	decomposed: { bg: 'bg-sky-100', text: 'text-sky-800' }
};

export function moveLabel(move: MoveType): string {
	return move
		.split('_')
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join(' ');
}
