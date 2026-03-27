<script lang="ts">
	import { fade, fly } from 'svelte/transition';
	import { motionParams } from '$lib/utils/motion';
	import type { Persona } from '../stores/session.svelte';

	let {
		persona,
		isStreaming = false,
		onUpdate
	}: {
		persona: Partial<Persona>;
		isStreaming?: boolean;
		onUpdate?: (persona: Persona) => void;
	} = $props();

	let editingField: string | null = $state(null);
	let editValue: string = $state('');

	function focusOnMount(node: HTMLElement) {
		node.focus();
	}

	function startEdit(field: string, value: string) {
		editingField = field;
		editValue = value;
	}

	type StringField = 'label' | 'role' | 'context';
	type ArrayField = 'goals' | 'frustrations' | 'influencers';

	function commitEdit(field: StringField) {
		if (editingField !== field) return;
		editingField = null;
		if (!onUpdate || !persona) return;

		onUpdate({ ...persona, [field]: editValue } as Persona);
	}

	function commitArrayEdit(field: ArrayField, index: number) {
		editingField = null;
		if (!onUpdate || !persona) return;

		const arr = [...(persona[field] || [])];
		arr[index] = editValue;
		onUpdate({ ...persona, [field]: arr } as Persona);
	}

	function addArrayItem(field: ArrayField) {
		if (!onUpdate || !persona) return;

		const arr = [...(persona[field] || []), ''];
		onUpdate({ ...persona, [field]: arr } as Persona);

		editingField = `${field}-${arr.length - 1}`;
		editValue = '';
	}

	function removeArrayItem(field: ArrayField, index: number) {
		if (!onUpdate || !persona) return;

		const arr = [...(persona[field] || [])];
		arr.splice(index, 1);
		onUpdate({ ...persona, [field]: arr } as Persona);
	}

	function handleKeydown(e: KeyboardEvent, commitFn: () => void) {
		if (e.key === 'Enter') {
			e.preventDefault();
			commitFn();
		} else if (e.key === 'Escape') {
			editingField = null;
		}
	}
</script>

<div class="bg-white rounded-lg border border-gray-200 p-6" data-testid="persona-card">
	{#if isStreaming}
		<div class="flex items-center gap-2 text-xs text-blue-500 mb-3">
			<span class="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
			Streaming...
		</div>
	{/if}

	<div class="flex items-baseline gap-3 mb-4">
		{#if editingField === 'label'}
			<input
				type="text"
				class="text-xl font-semibold text-gray-900 bg-blue-50 border border-blue-300 rounded px-2 py-1 outline-none"
				bind:value={editValue}
				onblur={() => commitEdit('label')}
				onkeydown={(e) => handleKeydown(e, () => commitEdit('label'))}
				use:focusOnMount
			/>
		{:else if persona.label !== undefined}
			<button
				in:fade={motionParams(200)}
				class="text-xl font-semibold text-gray-900 hover:bg-gray-50 rounded px-1 -mx-1 cursor-text text-left"
				onclick={() => startEdit('label', persona.label || '')}
				data-testid="persona-label"
			>
				{persona.label}
			</button>
		{:else if isStreaming}
			<div class="h-7 w-40 rounded shimmer"></div>
		{/if}

		{#if editingField === 'role'}
			<input
				type="text"
				class="text-sm text-gray-500 bg-blue-50 border border-blue-300 rounded px-2 py-1 outline-none"
				bind:value={editValue}
				onblur={() => commitEdit('role')}
				onkeydown={(e) => handleKeydown(e, () => commitEdit('role'))}
				use:focusOnMount
			/>
		{:else if persona.role !== undefined}
			<button
				in:fade={motionParams(200)}
				class="text-sm text-gray-500 hover:bg-gray-50 rounded px-1 -mx-1 cursor-text text-left"
				onclick={() => startEdit('role', persona.role || '')}
				data-testid="persona-role"
			>
				{persona.role}
			</button>
		{:else if isStreaming}
			<div class="h-5 w-32 rounded shimmer"></div>
		{/if}
	</div>

	{#snippet arraySection(label: string, field: ArrayField, items: string[] | undefined)}
		<div class="mb-3">
			<h4 class="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">{label}</h4>
			{#if items !== undefined && items.length > 0}
				<ul class="space-y-1">
					{#each items as item, i}
						<li class="flex items-center gap-1 group" in:fly={{ y: 10, ...motionParams(250, i * 60) }}>
							{#if editingField === `${field}-${i}`}
								<input
									type="text"
									class="flex-1 text-sm text-gray-700 bg-blue-50 border border-blue-300 rounded px-2 py-0.5 outline-none"
									bind:value={editValue}
									onblur={() => commitArrayEdit(field, i)}
									onkeydown={(e) => handleKeydown(e, () => commitArrayEdit(field, i))}
									use:focusOnMount
								/>
							{:else}
								<button
									class="flex-1 text-sm text-gray-700 hover:bg-gray-50 rounded px-1 -mx-1 cursor-text text-left"
									onclick={() => {
										editingField = `${field}-${i}`;
										editValue = item;
									}}
								>
									{item}
								</button>
								<button
									class="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity text-xs px-1"
									onclick={() => removeArrayItem(field, i)}
									aria-label="Remove {label.toLowerCase()} item"
								>
									&times;
								</button>
							{/if}
						</li>
					{/each}
				</ul>
			{:else if isStreaming}
				<div class="space-y-1">
					<div class="h-4 w-48 rounded shimmer"></div>
					<div class="h-4 w-36 rounded shimmer"></div>
				</div>
			{/if}
			{#if items !== undefined && onUpdate}
				<button
					class="text-xs text-blue-500 hover:text-blue-700 mt-1"
					onclick={() => addArrayItem(field)}
				>
					+ Add {label.toLowerCase().replace(/s$/, '')}
				</button>
			{/if}
		</div>
	{/snippet}

	{@render arraySection('Goals', 'goals', persona.goals)}
	{@render arraySection('Frustrations', 'frustrations', persona.frustrations)}

	<div class="mb-3">
		<h4 class="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Context</h4>
		{#if editingField === 'context'}
			<textarea
				class="w-full text-sm text-gray-700 bg-blue-50 border border-blue-300 rounded px-2 py-1 outline-none resize-none"
				rows="3"
				bind:value={editValue}
				onblur={() => commitEdit('context')}
				onkeydown={(e) => {
					if (e.key === 'Escape') editingField = null;
				}}
				use:focusOnMount
			></textarea>
		{:else if persona.context !== undefined}
			<button
				in:fade={motionParams(200)}
				class="text-sm text-gray-700 hover:bg-gray-50 rounded px-1 -mx-1 cursor-text text-left w-full"
				onclick={() => startEdit('context', persona.context || '')}
				data-testid="persona-context"
			>
				{persona.context}
			</button>
		{:else if isStreaming}
			<div class="h-12 w-full rounded shimmer"></div>
		{/if}
	</div>

	{@render arraySection('Influencers', 'influencers', persona.influencers)}
</div>
