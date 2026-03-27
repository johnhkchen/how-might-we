<script lang="ts">
	import { fly } from 'svelte/transition';
	import { motionParams } from '$lib/utils/motion';
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
			{#each candidates as candidate, index (candidate.id)}
				<div in:fly={{ y: 20, ...motionParams(300, index * 50) }}>
					<VariantCard {candidate} {onStatusChange} />
				</div>
			{/each}
		</div>
	{:else if isStreaming}
		<div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
			{#each Array(3) as _}
				<div class="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
					<div class="h-5 w-20 rounded-full shimmer"></div>
					<div class="h-4 w-full rounded shimmer"></div>
					<div class="h-4 w-3/4 rounded shimmer"></div>
					<div class="h-3 w-full rounded shimmer"></div>
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
