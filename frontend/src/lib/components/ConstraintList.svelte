<script lang="ts">
	import type { Constraint } from '../stores/session.svelte';

	let {
		constraints,
		onUpdate
	}: {
		constraints: Constraint[];
		onUpdate?: (constraints: Constraint[]) => void;
	} = $props();

	let editingIndex: number | null = $state(null);
	let editStatement: string = $state('');
	let isAdding: boolean = $state(false);
	let newStatement: string = $state('');
	let newType: Constraint['type'] = $state('hard');

	const badgeClasses: Record<Constraint['type'], string> = {
		hard: 'bg-red-100 text-red-800',
		soft: 'bg-yellow-100 text-yellow-800',
		assumption: 'bg-blue-100 text-blue-800'
	};

	function startEdit(index: number) {
		editingIndex = index;
		editStatement = constraints[index].statement;
	}

	function commitEdit(index: number) {
		if (editingIndex !== index) return;
		editingIndex = null;
		if (!onUpdate) return;

		const updated = constraints.map((c, i) =>
			i === index ? { ...c, statement: editStatement } : c
		);
		onUpdate(updated);
	}

	function remove(index: number) {
		if (!onUpdate) return;
		onUpdate(constraints.filter((_, i) => i !== index));
	}

	function addConstraint() {
		if (!onUpdate || !newStatement.trim()) return;

		const constraint: Constraint = {
			statement: newStatement.trim(),
			type: newType
		};
		onUpdate([...constraints, constraint]);
		newStatement = '';
		newType = 'hard';
		isAdding = false;
	}

	function handleEditKeydown(e: KeyboardEvent, index: number) {
		if (e.key === 'Enter') {
			e.preventDefault();
			commitEdit(index);
		} else if (e.key === 'Escape') {
			editingIndex = null;
		}
	}

	function handleAddKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			addConstraint();
		} else if (e.key === 'Escape') {
			isAdding = false;
			newStatement = '';
		}
	}

	function focusOnMount(node: HTMLElement) {
		node.focus();
	}
</script>

<div class="bg-white rounded-lg border border-gray-200 p-6" data-testid="constraint-list">
	<h3 class="text-sm font-medium text-gray-700 mb-3">Constraints</h3>

	{#if constraints.length > 0}
		<ul class="space-y-2 mb-3">
			{#each constraints as constraint, i}
				<li class="flex items-start gap-2 group" data-testid="constraint-item">
					<span
						class="inline-block text-xs font-medium px-2 py-0.5 rounded-full mt-0.5 whitespace-nowrap {badgeClasses[constraint.type]}"
						data-testid="constraint-badge"
					>
						{constraint.type}
					</span>

					{#if editingIndex === i}
						<input
							type="text"
							class="flex-1 text-sm text-gray-700 bg-blue-50 border border-blue-300 rounded px-2 py-0.5 outline-none"
							bind:value={editStatement}
							onblur={() => commitEdit(i)}
							onkeydown={(e) => handleEditKeydown(e, i)}
							use:focusOnMount
						/>
					{:else}
						<button
							class="flex-1 text-sm text-gray-700 hover:bg-gray-50 rounded px-1 -mx-1 cursor-text text-left"
							onclick={() => startEdit(i)}
							data-testid="constraint-statement"
						>
							{constraint.statement}
						</button>
					{/if}

					<button
						class="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity text-sm px-1 mt-0.5"
						onclick={() => remove(i)}
						aria-label="Delete constraint"
						data-testid="constraint-delete"
					>
						&times;
					</button>
				</li>
			{/each}
		</ul>
	{/if}

	{#if isAdding}
		<div class="border border-gray-200 rounded-lg p-3 space-y-2" data-testid="add-constraint-form">
			<input
				type="text"
				class="w-full text-sm border border-gray-300 rounded px-2 py-1.5 outline-none focus:border-blue-400"
				placeholder="Constraint statement..."
				bind:value={newStatement}
				onkeydown={handleAddKeydown}
				use:focusOnMount
			/>
			<div class="flex items-center gap-2">
				<span class="text-xs text-gray-500">Type:</span>
				{#each (['hard', 'soft', 'assumption'] as const) as type}
					<button
						class="text-xs px-2 py-0.5 rounded-full transition-colors {newType === type
							? badgeClasses[type] + ' ring-1 ring-offset-1 ring-gray-300'
							: 'bg-gray-100 text-gray-500 hover:bg-gray-200'}"
						onclick={() => (newType = type)}
						data-testid="type-option-{type}"
					>
						{type}
					</button>
				{/each}
			</div>
			<div class="flex gap-2">
				<button
					class="text-xs bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 disabled:opacity-50"
					onclick={addConstraint}
					disabled={!newStatement.trim()}
					data-testid="confirm-add-constraint"
				>
					Add
				</button>
				<button
					class="text-xs text-gray-500 px-3 py-1 rounded hover:bg-gray-100"
					onclick={() => {
						isAdding = false;
						newStatement = '';
					}}
				>
					Cancel
				</button>
			</div>
		</div>
	{:else if onUpdate}
		<button
			class="text-xs text-blue-500 hover:text-blue-700"
			onclick={() => (isAdding = true)}
			data-testid="add-constraint-button"
		>
			+ Add constraint
		</button>
	{/if}
</div>
