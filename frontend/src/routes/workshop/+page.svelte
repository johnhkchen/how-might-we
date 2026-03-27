<script lang="ts">
	// Main workshop interface — all stages in one scrollable flow
	// Stage 1: Setup (persona + context)
	// Stage 2: Analyze (critique rough HMW)
	// Stage 3: Expand (generate variants)
	// Stage 4: Refine (iterate on selections)
	// Stage 5: Export (clipped HMWs)

	import { session } from '$lib/stores/session.svelte';
	import { streamFromAPI } from '$lib/api/stream';
	import type { Persona, Constraint, HMWAnalysis } from '$lib/stores/session.svelte';
	import PersonaCard from '$lib/components/PersonaCard.svelte';
	import ConstraintList from '$lib/components/ConstraintList.svelte';
	import AnalysisPanel from '$lib/components/AnalysisPanel.svelte';

	let personaDescription = $state('');
	let domain = $state('');
	let constraints: Constraint[] = $state([]);
	let streamingPersona: Partial<Persona> = $state({});
	let error: string | null = $state(null);
	let hasStreamStarted = $state(false);

	// Stage 2: Analyze (uses local isAnalyzing flag, not session.isStreaming,
	// because session.isStreaming drives isComplete which gates Stage 2 visibility)
	let hmwStatement = $state('');
	let streamingAnalysis: Partial<HMWAnalysis> = $state({});
	let analysisError: string | null = $state(null);
	let hasAnalysisStarted = $state(false);
	let isAnalyzing = $state(false);

	async function refinePersona() {
		if (!personaDescription.trim()) return;

		error = null;
		hasStreamStarted = true;
		streamingPersona = {};
		session.startStreaming();

		try {
			let latestPartial: Partial<Persona> = {};
			await streamFromAPI<Persona>('/api/persona', { rawInput: personaDescription }, (partial) => {
				latestPartial = partial;
				streamingPersona = partial;
			});

			const finalPersona = latestPartial as Persona;
			session.setPersona(finalPersona);
			session.setContext({
				domain: domain.trim(),
				persona: finalPersona,
				constraints: [...constraints]
			});
		} catch (e) {
			error = e instanceof Error ? e.message : 'An unexpected error occurred';
		} finally {
			session.stopStreaming();
		}
	}

	function handlePersonaUpdate(updated: Persona) {
		session.setPersona(updated);
		if (session.problemContext) {
			session.setContext({ ...session.problemContext, persona: updated });
		}
	}

	async function analyzeHMW() {
		if (!hmwStatement.trim() || !session.problemContext) return;

		analysisError = null;
		hasAnalysisStarted = true;
		streamingAnalysis = {};
		isAnalyzing = true;

		try {
			let latestPartial: Partial<HMWAnalysis> = {};
			await streamFromAPI<HMWAnalysis>(
				'/api/analyze',
				{ statement: hmwStatement, context: session.problemContext },
				(partial) => {
					latestPartial = partial;
					streamingAnalysis = partial;
				}
			);

			session.setAnalysis(latestPartial as HMWAnalysis);
		} catch (e) {
			analysisError = e instanceof Error ? e.message : 'An unexpected error occurred';
		} finally {
			isAnalyzing = false;
		}
	}

	function handleConstraintUpdate(updated: Constraint[]) {
		constraints = updated;
		if (session.problemContext) {
			session.setContext({ ...session.problemContext, constraints: updated });
		}
	}

	const displayPersona = $derived(session.persona ?? (hasStreamStarted ? streamingPersona : null));
	const isComplete = $derived(!!session.persona && !session.isStreaming);

	const displayAnalysis = $derived(
		session.analysis ?? (hasAnalysisStarted ? streamingAnalysis : null)
	);
	const isAnalysisComplete = $derived(!!session.analysis && !isAnalyzing);
</script>

<main class="min-h-screen bg-gray-50">
	<header class="bg-white border-b border-gray-200 px-6 py-4">
		<div class="max-w-4xl mx-auto flex items-center justify-between">
			<a href="/" class="text-lg font-semibold text-gray-900">HMW Workshop</a>
		</div>
	</header>

	<div class="max-w-4xl mx-auto px-6 py-8 space-y-8">
		<!-- Stage 1: Setup -->
		<section data-testid="stage-1">
			<h2 class="text-xl font-semibold text-gray-900 mb-4">1. Setup — Persona & Context</h2>

			<!-- Input Form -->
			<div class="bg-white rounded-lg border border-gray-200 p-6 space-y-4" data-testid="setup-form">
				<div>
					<label for="persona-input" class="block text-sm font-medium text-gray-700 mb-1">
						Who is this for?
					</label>
					<textarea
						id="persona-input"
						class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-blue-400 focus:ring-1 focus:ring-blue-400 outline-none resize-none"
						rows="3"
						placeholder="Describe the persona in rough terms, e.g. 'A junior product designer at a mid-size SaaS company who feels overwhelmed running workshops'"
						bind:value={personaDescription}
						disabled={session.isStreaming}
					></textarea>
				</div>

				<div>
					<label for="domain-input" class="block text-sm font-medium text-gray-700 mb-1">
						What's the space/domain?
					</label>
					<input
						id="domain-input"
						type="text"
						class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-blue-400 focus:ring-1 focus:ring-blue-400 outline-none"
						placeholder="e.g. Design thinking facilitation, Healthcare onboarding"
						bind:value={domain}
						disabled={session.isStreaming}
					/>
				</div>

				<div>
					<h3 class="text-sm font-medium text-gray-700 mb-2">Known constraints</h3>
					<ConstraintList {constraints} onUpdate={(c) => (constraints = c)} />
				</div>

				<button
					class="w-full bg-blue-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
					onclick={refinePersona}
					disabled={!personaDescription.trim() || session.isStreaming}
					data-testid="refine-button"
				>
					{#if session.isStreaming}
						Refining...
					{:else}
						Refine Persona
					{/if}
				</button>
			</div>

			{#if error}
				<div class="mt-4 bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700" data-testid="error-message">
					{error}
				</div>
			{/if}

			<!-- Streaming / Final Output -->
			{#if displayPersona}
				<div class="mt-6 space-y-4">
					<PersonaCard
						persona={displayPersona}
						isStreaming={session.isStreaming}
						onUpdate={isComplete ? handlePersonaUpdate : undefined}
					/>

					{#if isComplete}
						<ConstraintList
							constraints={session.problemContext?.constraints ?? constraints}
							onUpdate={handleConstraintUpdate}
						/>
					{/if}
				</div>
			{/if}
		</section>

		<!-- Stage 2: Analyze -->
		{#if isComplete}
			<section data-testid="stage-2">
				<h2 class="text-xl font-semibold text-gray-900 mb-4">2. Analyze — Critique Your HMW</h2>

				<div class="bg-white rounded-lg border border-gray-200 p-6 space-y-4" data-testid="analyze-form">
					<div>
						<label for="hmw-input" class="block text-sm font-medium text-gray-700 mb-1">
							Your rough HMW statement
						</label>
						<textarea
							id="hmw-input"
							class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-blue-400 focus:ring-1 focus:ring-blue-400 outline-none resize-none"
							rows="2"
							placeholder="e.g. 'How might we make workshops more productive?'"
							bind:value={hmwStatement}
							disabled={isAnalyzing}
						></textarea>
					</div>

					<button
						class="w-full bg-blue-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
						onclick={analyzeHMW}
						disabled={!hmwStatement.trim() || isAnalyzing}
						data-testid="analyze-button"
					>
						{#if isAnalyzing}
							Analyzing...
						{:else}
							Analyze
						{/if}
					</button>
				</div>

				{#if analysisError}
					<div class="mt-4 bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700" data-testid="analysis-error">
						{analysisError}
					</div>
				{/if}

				{#if displayAnalysis}
					<div class="mt-6">
						<AnalysisPanel
							analysis={displayAnalysis}
							isStreaming={isAnalyzing}
						/>
					</div>
				{/if}
			</section>
		{/if}
	</div>
</main>
