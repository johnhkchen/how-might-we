<script lang="ts">
	import type { HMWCandidate } from '../stores/session.svelte';
	import { moveLabel, moveColors } from '$lib/utils/moves';

	let {
		clippedCandidates,
		onRemove
	}: {
		clippedCandidates: HMWCandidate[];
		onRemove: (id: string) => void;
	} = $props();
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
							class="inline-block text-xs font-medium px-2 py-0.5 rounded-full mb-1 {moveColors[candidate.variant.moveType].bg} {moveColors[candidate.variant.moveType].text}"
							data-testid="clipboard-move-badge"
						>
							{moveLabel(candidate.variant.moveType)}
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
