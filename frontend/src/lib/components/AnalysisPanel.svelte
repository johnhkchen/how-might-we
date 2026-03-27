<script lang="ts">
	import { fade, slide } from 'svelte/transition';
	import { motionParams } from '$lib/utils/motion';
	import type { HMWAnalysis } from '../stores/session.svelte';

	let {
		analysis,
		isStreaming = false
	}: {
		analysis: Partial<HMWAnalysis>;
		isStreaming?: boolean;
	} = $props();

	const scopeClasses: Record<string, string> = {
		too_narrow: 'bg-amber-100 text-amber-800',
		too_broad: 'bg-amber-100 text-amber-800',
		well_scoped: 'bg-green-100 text-green-800'
	};

	const scopeLabels: Record<string, string> = {
		too_narrow: 'Too Narrow',
		too_broad: 'Too Broad',
		well_scoped: 'Well Scoped'
	};
</script>

<div class="bg-white rounded-lg border border-gray-200 p-6 space-y-4" data-testid="analysis-panel">
	{#if isStreaming}
		<div class="flex items-center gap-2 text-xs text-blue-500">
			<span class="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
			Analyzing...
		</div>
	{/if}

	<!-- Implicit User -->
	{#if analysis.implicitUser !== undefined}
		<div in:fade={motionParams(250)} data-testid="analysis-implicit-user">
			<h4 class="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Implicit User</h4>
			<p class="text-sm text-gray-700">{analysis.implicitUser}</p>
		</div>
	{:else if isStreaming}
		<div>
			<h4 class="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Implicit User</h4>
			<div class="h-4 w-64 rounded shimmer"></div>
		</div>
	{/if}

	<!-- Embedded Assumptions -->
	{#if analysis.embeddedAssumptions !== undefined}
		<div in:slide={motionParams(300)} data-testid="analysis-assumptions">
			<h4 class="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Embedded Assumptions</h4>
			<ul class="space-y-1">
				{#each analysis.embeddedAssumptions as assumption, i}
					<li class="text-sm text-gray-700 flex items-start gap-2" in:fade={motionParams(200, i * 60)}>
						<span class="text-gray-400 mt-0.5 shrink-0">&bull;</span>
						<span>{assumption}</span>
					</li>
				{/each}
			</ul>
		</div>
	{:else if isStreaming && analysis.implicitUser !== undefined}
		<div>
			<h4 class="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Embedded Assumptions</h4>
			<div class="space-y-1">
				<div class="h-4 w-72 rounded shimmer"></div>
				<div class="h-4 w-56 rounded shimmer"></div>
			</div>
		</div>
	{/if}

	<!-- Scope Level -->
	{#if analysis.scopeLevel !== undefined}
		<div in:fade={motionParams(200)} data-testid="analysis-scope-level">
			<h4 class="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Scope</h4>
			<span
				class="inline-block text-xs font-medium px-2.5 py-1 rounded-full {scopeClasses[analysis.scopeLevel]}"
				data-testid="scope-badge"
			>
				{scopeLabels[analysis.scopeLevel]}
			</span>
		</div>
	{:else if isStreaming && analysis.embeddedAssumptions !== undefined}
		<div>
			<h4 class="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Scope</h4>
			<div class="h-6 w-24 rounded-full shimmer"></div>
		</div>
	{/if}

	<!-- Solution Bias (conditional) -->
	{#if analysis.solutionBias}
		<div
			in:slide={motionParams(300)}
			class="bg-amber-50 border border-amber-200 rounded-lg p-4"
			data-testid="analysis-solution-bias"
		>
			<h4 class="text-xs font-medium text-amber-700 uppercase tracking-wider mb-1">Solution Bias Detected</h4>
			<p class="text-sm text-amber-800">{analysis.solutionBias}</p>
		</div>
	{/if}

	<!-- Underlying Tension -->
	{#if analysis.underlyingTension !== undefined}
		<div
			in:slide={motionParams(300)}
			class="border-l-4 border-blue-500 pl-4 py-2"
			data-testid="analysis-tension"
		>
			<h4 class="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Underlying Tension</h4>
			<p class="text-sm text-gray-900 font-medium">{analysis.underlyingTension}</p>
		</div>
	{:else if isStreaming && analysis.scopeLevel !== undefined}
		<div class="border-l-4 border-gray-200 pl-4 py-2">
			<h4 class="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Underlying Tension</h4>
			<div class="h-4 w-full rounded shimmer"></div>
		</div>
	{/if}

	<!-- Initial Reframing -->
	{#if analysis.initialReframing !== undefined}
		<div
			in:fade={motionParams(250)}
			class="bg-gray-50 rounded-lg p-4"
			data-testid="analysis-reframing"
		>
			<h4 class="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Initial Reframing</h4>
			<p class="text-sm text-gray-700 italic">&ldquo;{analysis.initialReframing}&rdquo;</p>
		</div>
	{:else if isStreaming && analysis.underlyingTension !== undefined}
		<div class="bg-gray-50 rounded-lg p-4">
			<h4 class="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Initial Reframing</h4>
			<div class="h-4 w-80 rounded shimmer"></div>
		</div>
	{/if}
</div>
