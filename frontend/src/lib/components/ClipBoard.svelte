<script lang="ts">
	import type { HMWCandidate, MoveType } from '../stores/session.svelte';

	let {
		clippedCandidates,
		onRemove
	}: {
		clippedCandidates: HMWCandidate[];
		onRemove: (id: string) => void;
	} = $props();

	const moveColors: Record<MoveType, { bg: string; text: string }> = {
		narrowed: { bg: 'bg-green-100', text: 'text-green-800' },
		broadened: { bg: 'bg-purple-100', text: 'text-purple-800' },
		shifted_user: { bg: 'bg-orange-100', text: 'text-orange-800' },
		reframed_constraint: { bg: 'bg-teal-100', text: 'text-teal-800' },
		elevated_abstraction: { bg: 'bg-indigo-100', text: 'text-indigo-800' },
		inverted: { bg: 'bg-red-100', text: 'text-red-800' },
		combined: { bg: 'bg-amber-100', text: 'text-amber-800' },
		decomposed: { bg: 'bg-sky-100', text: 'text-sky-800' }
	};

	function moveLabel(move: MoveType): string {
		return move
			.split('_')
			.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
			.join(' ');
	}
</script>

<div class="bg-white rounded-lg border border-gray-200 p-6" data-testid="clipboard">
	<div class="flex items-center gap-2 mb-4">
		<h3 class="text-sm font-medium text-gray-700">Clipped HMWs</h3>
		<span
			class="inline-flex items-center justify-center text-xs font-medium bg-green-100 text-green-800 rounded-full px-2 py-0.5 min-w-[1.5rem]"
			data-testid="clipboard-count"
		>
			{clippedCandidates.length}
		</span>
	</div>

	{#if clippedCandidates.length > 0}
		<ul class="space-y-3">
			{#each clippedCandidates as candidate (candidate.id)}
				<li class="flex items-start gap-2 group" data-testid="clipboard-item">
					<div class="flex-1 min-w-0">
						<span
							class="inline-block text-xs font-medium px-2 py-0.5 rounded-full mb-1 {moveColors[candidate.variant.move].bg} {moveColors[candidate.variant.move].text}"
							data-testid="clipboard-move-badge"
						>
							{moveLabel(candidate.variant.move)}
						</span>
						<p class="text-sm text-gray-900" data-testid="clipboard-statement">
							{candidate.userEdits ?? candidate.variant.statement}
						</p>
					</div>
					<button
						class="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity text-sm px-1 mt-1 shrink-0"
						onclick={() => onRemove(candidate.id)}
						aria-label="Remove from clipboard"
						data-testid="clipboard-remove"
					>
						&times;
					</button>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="text-sm text-gray-400" data-testid="clipboard-empty">
			No HMWs clipped yet. Click "Clip" on a variant card to save it here.
		</p>
	{/if}
</div>
