<script lang="ts">
	import type { HMWCandidate, ProblemContext } from '../stores/session.svelte';
	import { moveLabel } from '$lib/utils/moves';

	let {
		clippedCandidates,
		problemContext
	}: {
		clippedCandidates: HMWCandidate[];
		problemContext: ProblemContext | null;
	} = $props();

	type ExportFormat = 'text' | 'markdown' | 'json';

	let activeFormat = $state<ExportFormat>('text');
	let copied = $state(false);

	function statement(c: HMWCandidate): string {
		return c.userEdits ?? c.variant.statement;
	}

	const plainText = $derived(
		clippedCandidates.map((c, i) => `${i + 1}. ${statement(c)}`).join('\n')
	);

	const markdownText = $derived(() => {
		const lines: string[] = ['# HMW Export', ''];

		if (problemContext) {
			lines.push('## Persona');
			lines.push(
				`**${problemContext.persona.label}** — ${problemContext.persona.role}`
			);
			lines.push(`**Domain:** ${problemContext.domain}`);
			lines.push('');
		}

		lines.push('## HMW Questions');
		lines.push('');

		clippedCandidates.forEach((c, i) => {
			lines.push(`### ${i + 1}. ${statement(c)}`);
			lines.push(`- **Move:** ${moveLabel(c.variant.moveType)}`);
			lines.push(`- **Rationale:** ${c.variant.rationale}`);
			lines.push('');
		});

		return lines.join('\n');
	});

	const jsonText = $derived(() => {
		const exportData = {
			context: problemContext,
			candidates: clippedCandidates.map((c) => ({
				id: c.id,
				variant: c.variant,
				status: c.status,
				userEdits: c.userEdits
			})),
			clippedIds: clippedCandidates.map((c) => c.id)
		};
		return JSON.stringify(exportData, null, 2);
	});

	const activeContent = $derived(
		activeFormat === 'text'
			? plainText
			: activeFormat === 'markdown'
				? markdownText()
				: jsonText()
	);

	const fileExtension = $derived(
		activeFormat === 'text' ? '.txt' : activeFormat === 'markdown' ? '.md' : '.json'
	);

	const mimeType = $derived(
		activeFormat === 'text'
			? 'text/plain'
			: activeFormat === 'markdown'
				? 'text/markdown'
				: 'application/json'
	);

	async function copyToClipboard() {
		try {
			await navigator.clipboard.writeText(activeContent);
			copied = true;
			setTimeout(() => {
				copied = false;
			}, 2000);
		} catch {
			// Fallback: silent fail — clipboard API may not be available
		}
	}

	function download() {
		const blob = new Blob([activeContent], { type: mimeType });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `hmw-export${fileExtension}`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	}

	const formats: { key: ExportFormat; label: string }[] = [
		{ key: 'text', label: 'Plain Text' },
		{ key: 'markdown', label: 'Markdown' },
		{ key: 'json', label: 'JSON' }
	];
</script>

{#if clippedCandidates.length === 0}
	<div class="bg-white rounded-lg border border-gray-200 p-6" data-testid="export-panel">
		<p class="text-sm text-gray-400" data-testid="export-empty">
			No HMWs clipped yet. Clip some variants to export them.
		</p>
	</div>
{:else}
	<div class="bg-white rounded-lg border border-gray-200 p-6 space-y-4" data-testid="export-panel">
		<!-- Format tabs -->
		<div class="flex gap-1 bg-gray-100 rounded-lg p-1" data-testid="format-tabs">
			{#each formats as fmt}
				<button
					class="flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors {activeFormat === fmt.key
						? 'bg-white text-gray-900 shadow-sm'
						: 'text-gray-500 hover:text-gray-700'}"
					onclick={() => (activeFormat = fmt.key)}
					data-testid="format-{fmt.key}"
				>
					{fmt.label}
				</button>
			{/each}
		</div>

		<!-- Preview -->
		<pre
			class="bg-gray-50 rounded-lg p-4 text-sm text-gray-800 font-mono overflow-x-auto max-h-96 overflow-y-auto whitespace-pre-wrap"
			data-testid="export-preview"
		>{activeContent}</pre>

		<!-- Actions -->
		<div class="flex gap-3">
			<button
				class="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors {copied
					? 'bg-green-100 text-green-800'
					: 'bg-gray-100 text-gray-700 hover:bg-gray-200'}"
				onclick={copyToClipboard}
				aria-label="Copy to clipboard"
				data-testid="copy-button"
			>
				{#if copied}
					<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
					</svg>
					Copied!
				{:else}
					Copy to Clipboard
				{/if}
			</button>

			<button
				class="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
				onclick={download}
				aria-label="Download file"
				data-testid="download-button"
			>
				Download {fileExtension}
			</button>
		</div>
	</div>
{/if}
