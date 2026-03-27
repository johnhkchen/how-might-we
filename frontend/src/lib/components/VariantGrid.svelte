<script lang="ts">
	import type { HMWCandidate, CandidateStatus } from '../stores/session.svelte';
	import VariantCard from './VariantCard.svelte';

	let {
		candidates,
		onStatusChange,
		isStreaming = false
	}: {
		candidates: HMWCandidate[];
		onStatusChange: (id: string, status: CandidateStatus, userEdits?: string) => void;
		isStreaming?: boolean;
	} = $props();
</script>

<div data-testid="variant-grid">
	{#if candidates.length > 0}
		<div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
			{#each candidates as candidate (candidate.id)}
				<VariantCard {candidate} {onStatusChange} />
			{/each}
		</div>
	{:else if isStreaming}
		<div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
			{#each Array(3) as _}
				<div class="bg-white rounded-lg border border-gray-200 p-4 space-y-3 animate-pulse">
					<div class="h-5 w-20 bg-gray-200 rounded-full"></div>
					<div class="h-4 w-full bg-gray-200 rounded"></div>
					<div class="h-4 w-3/4 bg-gray-200 rounded"></div>
					<div class="h-3 w-full bg-gray-100 rounded"></div>
				</div>
			{/each}
		</div>
	{/if}

	{#if isStreaming && candidates.length > 0}
		<div class="mt-4 flex items-center gap-2 text-sm text-gray-400">
			<div class="h-2 w-2 bg-blue-400 rounded-full animate-pulse"></div>
			Generating more variants...
		</div>
	{/if}
</div>
