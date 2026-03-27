<script lang="ts">
	import type { HMWCandidate, CandidateStatus, MoveType } from '../stores/session.svelte';

	let {
		candidate,
		onStatusChange
	}: {
		candidate: HMWCandidate;
		onStatusChange: (id: string, status: CandidateStatus, userEdits?: string) => void;
	} = $props();

	let isEditing = $state(false);
	let editText = $state('');

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

	function startEdit() {
		editText = candidate.userEdits ?? candidate.variant.statement;
		isEditing = true;
	}

	function commitEdit() {
		if (!isEditing) return;
		isEditing = false;
		const text = editText.trim();
		if (text && text !== candidate.variant.statement) {
			onStatusChange(candidate.id, 'edited', text);
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			isEditing = false;
		}
	}

	function focusOnMount(node: HTMLElement) {
		node.focus();
	}

	const displayStatement = $derived(candidate.userEdits ?? candidate.variant.statement);
	const colors = $derived(moveColors[candidate.variant.move]);

	const borderClass = $derived(
		candidate.status === 'selected' || candidate.status === 'edited'
			? 'border-blue-400 ring-1 ring-blue-200'
			: candidate.status === 'clipped'
				? 'border-green-400 ring-1 ring-green-200'
				: 'border-gray-200'
	);

	const opacityClass = $derived(candidate.status === 'skipped' ? 'opacity-50' : '');
	const iterationBorderClass = $derived(candidate.iteration > 0 ? 'border-l-4 border-l-purple-300' : '');
</script>

<div
	class="bg-white rounded-lg border p-4 transition-all {borderClass} {opacityClass} {iterationBorderClass}"
	data-testid="variant-card"
	data-status={candidate.status}
	data-iteration={candidate.iteration}
>
	<!-- Move type badge -->
	<span
		class="inline-block text-xs font-medium px-2.5 py-0.5 rounded-full mb-3 {colors.bg} {colors.text}"
		data-testid="move-badge"
		data-move={candidate.variant.move}
	>
		{moveLabel(candidate.variant.move)}
	</span>
	{#if candidate.iteration > 0}
		<span
			class="inline-block text-xs font-medium px-2.5 py-0.5 rounded-full mb-3 ml-1 bg-purple-100 text-purple-700"
			data-testid="iteration-badge"
		>
			Iteration {candidate.iteration}
		</span>
	{/if}

	<!-- HMW Statement -->
	{#if isEditing}
		<textarea
			class="w-full text-sm text-gray-900 font-medium bg-blue-50 border border-blue-300 rounded px-3 py-2 outline-none resize-none mb-2"
			rows="3"
			bind:value={editText}
			onblur={commitEdit}
			onkeydown={handleKeydown}
			use:focusOnMount
			data-testid="variant-edit-input"
		></textarea>
	{:else}
		<p class="text-sm text-gray-900 font-medium mb-2" data-testid="variant-statement">
			{displayStatement}
		</p>
	{/if}

	{#if candidate.status === 'edited' && !isEditing}
		<span class="text-xs text-blue-500 mb-2 inline-block" data-testid="edited-indicator">Edited</span>
	{/if}

	<!-- Rationale -->
	<p class="text-xs text-gray-500 mb-3" data-testid="variant-rationale">
		{candidate.variant.rationale}
	</p>

	<!-- Actions -->
	<div class="flex gap-2 flex-wrap">
		{#if candidate.status === 'generated'}
			<button
				class="text-xs px-3 py-1 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
				onclick={() => onStatusChange(candidate.id, 'selected')}
				data-testid="action-select"
			>
				Select
			</button>
			<button
				class="text-xs px-3 py-1 rounded bg-gray-50 text-gray-600 hover:bg-gray-100 transition-colors"
				onclick={() => onStatusChange(candidate.id, 'skipped')}
				data-testid="action-skip"
			>
				Skip
			</button>
			<button
				class="text-xs px-3 py-1 rounded bg-gray-50 text-gray-600 hover:bg-gray-100 transition-colors"
				onclick={startEdit}
				data-testid="action-edit"
			>
				Edit
			</button>
			<button
				class="text-xs px-3 py-1 rounded bg-green-50 text-green-700 hover:bg-green-100 transition-colors"
				onclick={() => onStatusChange(candidate.id, 'clipped')}
				data-testid="action-clip"
			>
				Clip
			</button>
		{:else if candidate.status === 'selected' || candidate.status === 'edited'}
			<button
				class="text-xs px-3 py-1 rounded bg-green-50 text-green-700 hover:bg-green-100 transition-colors"
				onclick={() => onStatusChange(candidate.id, 'clipped')}
				data-testid="action-clip"
			>
				Clip
			</button>
			<button
				class="text-xs px-3 py-1 rounded bg-gray-50 text-gray-600 hover:bg-gray-100 transition-colors"
				onclick={() => onStatusChange(candidate.id, 'skipped')}
				data-testid="action-skip"
			>
				Skip
			</button>
			<button
				class="text-xs px-3 py-1 rounded bg-gray-50 text-gray-600 hover:bg-gray-100 transition-colors"
				onclick={startEdit}
				data-testid="action-edit"
			>
				Edit
			</button>
		{:else if candidate.status === 'clipped'}
			<button
				class="text-xs px-3 py-1 rounded bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
				onclick={() => onStatusChange(candidate.id, 'generated')}
				data-testid="action-unclip"
			>
				Unclip
			</button>
		{:else if candidate.status === 'skipped'}
			<button
				class="text-xs px-3 py-1 rounded bg-gray-50 text-gray-600 hover:bg-gray-100 transition-colors"
				onclick={() => onStatusChange(candidate.id, 'generated')}
				data-testid="action-undo"
			>
				Undo
			</button>
		{/if}
	</div>
</div>
