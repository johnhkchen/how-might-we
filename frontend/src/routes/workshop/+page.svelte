<script lang="ts">
	// Main workshop interface — all stages in one scrollable flow
	// Stage 1: Setup (persona + context)
	// Stage 2: Analyze (critique rough HMW)
	// Stage 3: Expand (generate variants)
	// Stage 4: Refine (iterate on selections)
	// Stage 5: Export (clipped HMWs)

	import { session } from '$lib/stores/session.svelte';
	import { streamFromAPI } from '$lib/api/stream';
	import type {
		Persona,
		Constraint,
		HMWAnalysis,
		HMWVariant,
		CandidateStatus
	} from '$lib/stores/session.svelte';
	import PersonaCard from '$lib/components/PersonaCard.svelte';
	import ConstraintList from '$lib/components/ConstraintList.svelte';
	import AnalysisPanel from '$lib/components/AnalysisPanel.svelte';
	import VariantGrid from '$lib/components/VariantGrid.svelte';
	import ClipBoard from '$lib/components/ClipBoard.svelte';
	import ExportPanel from '$lib/components/ExportPanel.svelte';

	// --- Stage 1: Setup ---
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

	// --- Stage 3: Expand ---
	interface HMWExpansion {
		variants: HMWVariant[];
		emergentTheme?: string;
	}
	let isExpanding = $state(false);
	let expandError: string | null = $state(null);
	let hasExpandStarted = $state(false);
	let seenStatements = $state(new Set<string>());
	let emergentTheme: string | null = $state(null);

	// --- Stage 4: Refine ---
	interface HMWRefinement {
		newVariants: HMWVariant[];
		tensions: string[];
		recommendation?: string;
		suggestedNextMove?: string;
	}
	let isRefining = $state(false);
	let refineError: string | null = $state(null);
	let refinementTensions: string[] = $state([]);
	let refinementRecommendation: string | null = $state(null);
	let refinementSuggestedNext: string | null = $state(null);

	// --- Re-analysis warning ---
	let personaDirty = $state(false);

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
		if (session.analysis) {
			personaDirty = true;
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
			personaDirty = false;
		} catch (e) {
			analysisError = e instanceof Error ? e.message : 'An unexpected error occurred';
		} finally {
			isAnalyzing = false;
		}
	}

	async function expandHMW() {
		if (!session.analysis || !session.problemContext) return;

		expandError = null;
		hasExpandStarted = true;
		isExpanding = true;
		emergentTheme = null;

		// Track which statements we've already added so we only add new ones
		const localSeen = new Set(seenStatements);

		try {
			await streamFromAPI<HMWExpansion>(
				'/api/expand',
				{ analysis: session.analysis, context: session.problemContext },
				(partial) => {
					if (partial.emergentTheme) {
						emergentTheme = partial.emergentTheme;
					}
					if (partial.variants) {
						const newVariants = partial.variants.filter((v) => !localSeen.has(v.statement));
						if (newVariants.length > 0) {
							for (const v of newVariants) {
								localSeen.add(v.statement);
							}
							session.addCandidates(newVariants, 0);
						}
					}
				}
			);

			seenStatements = localSeen;
		} catch (e) {
			expandError = e instanceof Error ? e.message : 'An unexpected error occurred';
		} finally {
			isExpanding = false;
		}
	}

	async function refineHMW() {
		if (!session.problemContext) return;

		refineError = null;
		isRefining = true;
		refinementTensions = [];
		refinementRecommendation = null;
		refinementSuggestedNext = null;

		session.incrementIteration();
		const currentIteration = session.iterationCount;
		const localSeen = new Set(seenStatements);

		try {
			const hmwSession = {
				context: session.problemContext,
				analysis: session.analysis,
				candidates: session.candidates.map((c) => ({
					id: c.id,
					variant: c.variant,
					status: c.status.toUpperCase(),
					userEdits: c.userEdits
				})),
				clippedIds: Array.from(session.clippedIds),
				iterationCount: currentIteration
			};

			await streamFromAPI<HMWRefinement>(
				'/api/refine',
				{ session: hmwSession },
				(partial) => {
					if (partial.tensions) {
						refinementTensions = partial.tensions;
					}
					if (partial.recommendation) {
						refinementRecommendation = partial.recommendation;
					}
					if (partial.suggestedNextMove) {
						refinementSuggestedNext = partial.suggestedNextMove;
					}
					if (partial.newVariants) {
						const newVariants = partial.newVariants.filter((v) => !localSeen.has(v.statement));
						if (newVariants.length > 0) {
							for (const v of newVariants) {
								localSeen.add(v.statement);
							}
							session.addCandidates(newVariants, currentIteration);
						}
					}
				}
			);

			seenStatements = localSeen;
		} catch (e) {
			refineError = e instanceof Error ? e.message : 'An unexpected error occurred';
		} finally {
			isRefining = false;
		}
	}

	function handleConstraintUpdate(updated: Constraint[]) {
		constraints = updated;
		if (session.problemContext) {
			session.setContext({ ...session.problemContext, constraints: updated });
		}
		if (session.analysis) {
			personaDirty = true;
		}
	}

	function handleStatusChange(id: string, status: CandidateStatus, userEdits?: string) {
		session.updateCandidateStatus(id, status, userEdits);
	}

	function handleClipboardRemove(id: string) {
		session.updateCandidateStatus(id, 'generated');
	}

	const displayPersona = $derived(session.persona ?? (hasStreamStarted ? streamingPersona : null));
	const isComplete = $derived(!!session.persona && !session.isStreaming);

	const displayAnalysis = $derived(
		session.analysis ?? (hasAnalysisStarted ? streamingAnalysis : null)
	);
	const isAnalysisComplete = $derived(!!session.analysis && !isAnalyzing);

	const hasActionedCandidates = $derived(
		session.candidates.some((c) => c.status === 'selected' || c.status === 'edited')
	);
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

		<!-- Re-analysis warning -->
		{#if personaDirty && isComplete}
			<div
				class="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800"
				data-testid="reanalysis-warning"
			>
				You've edited the persona or constraints since the last analysis. Consider re-running the analysis to update.
			</div>
		{/if}

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

		<!-- Stage 3: Expand -->
		{#if isAnalysisComplete}
			<section data-testid="stage-3">
				<h2 class="text-xl font-semibold text-gray-900 mb-4">3. Expand — Generate Variants</h2>

				{#if !hasExpandStarted}
					<div class="bg-white rounded-lg border border-gray-200 p-6">
						<p class="text-sm text-gray-600 mb-4">
							Generate a diverse set of reframed HMW questions based on the analysis. Each variant makes a different "move" — narrowing, broadening, shifting the user, etc.
						</p>
						<button
							class="w-full bg-blue-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
							onclick={expandHMW}
							disabled={isExpanding}
							data-testid="expand-button"
						>
							{#if isExpanding}
								Expanding...
							{:else}
								Expand
							{/if}
						</button>
					</div>
				{/if}

				{#if expandError}
					<div class="mt-4 bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700" data-testid="expand-error">
						{expandError}
					</div>
				{/if}

				{#if hasExpandStarted}
					<div class="space-y-6">
						<VariantGrid
							candidates={session.candidates}
							onStatusChange={handleStatusChange}
							isStreaming={isExpanding || isRefining}
						/>

						{#if emergentTheme}
							<div class="bg-gray-50 rounded-lg p-4" data-testid="emergent-theme">
								<h4 class="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Emergent Theme</h4>
								<p class="text-sm text-gray-700 italic">{emergentTheme}</p>
							</div>
						{/if}

						<!-- Refinement insights -->
						{#if refinementTensions.length > 0}
							<div class="bg-amber-50 rounded-lg border border-amber-200 p-4" data-testid="refinement-tensions">
								<h4 class="text-xs font-medium text-amber-700 uppercase tracking-wider mb-2">Tensions</h4>
								<ul class="space-y-1">
									{#each refinementTensions as tension}
										<li class="text-sm text-amber-800">{tension}</li>
									{/each}
								</ul>
							</div>
						{/if}

						{#if refinementRecommendation}
							<div class="bg-blue-50 rounded-lg border border-blue-200 p-4" data-testid="refinement-recommendation">
								<h4 class="text-xs font-medium text-blue-700 uppercase tracking-wider mb-1">Recommendation</h4>
								<p class="text-sm text-blue-800">{refinementRecommendation}</p>
							</div>
						{/if}

						{#if refinementSuggestedNext}
							<div class="text-sm text-gray-500 italic" data-testid="refinement-suggested-next">
								Suggested next: {refinementSuggestedNext}
							</div>
						{/if}

						<!-- Go Deeper button -->
						{#if !isExpanding && !isRefining}
							<button
								class="w-full bg-purple-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
								onclick={refineHMW}
								disabled={!hasActionedCandidates}
								data-testid="refine-button-stage4"
							>
								Go Deeper
							</button>
							{#if !hasActionedCandidates}
								<p class="text-xs text-gray-400 text-center">Select or edit at least one variant to refine further</p>
							{/if}
						{:else if isRefining}
							<div class="w-full bg-purple-100 text-purple-700 px-4 py-2.5 rounded-lg text-sm font-medium text-center">
								Refining...
							</div>
						{/if}

						{#if session.iterationCount > 0}
							<p class="text-xs text-purple-500 text-center" data-testid="iteration-count">
								Iteration {session.iterationCount}
							</p>
						{/if}

						<!-- ClipBoard -->
						<ClipBoard
							clippedCandidates={session.clippedCandidates}
							onRemove={handleClipboardRemove}
						/>

						<!-- Stage 5: Export -->
						{#if session.clippedCandidates.length > 0}
							<section data-testid="stage-5">
								<h2 class="text-xl font-semibold text-gray-900 mb-4">5. Export</h2>
								<ExportPanel
									clippedCandidates={session.clippedCandidates}
									problemContext={session.problemContext}
								/>
							</section>
						{/if}
					</div>
				{/if}
			</section>
		{/if}
	</div>
</main>
