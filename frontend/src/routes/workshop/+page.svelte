<script lang="ts">
	// Main workshop interface — all stages in one scrollable flow
	// Stage 1: Setup (persona + context)
	// Stage 2: Analyze (critique rough HMW)
	// Stage 3: Expand (generate variants)
	// Stage 4: Refine (iterate on selections)
	// Stage 5: Export (clipped HMWs)

	import { onMount, onDestroy } from 'svelte';
	import { PUBLIC_TURNSTILE_SITE_KEY } from '$env/static/public';
	import { session } from '$lib/stores/session.svelte';
	import { streamFromAPI, RateLimitError, TurnstileError } from '$lib/api/stream';
	import type {
		Persona,
		Constraint,
		HMWAnalysis,
		HMWVariant,
		CandidateStatus
	} from '$lib/stores/session.svelte';
	import { initTurnstile, resetTurnstile, destroy as destroyTurnstile, onTurnstileStatus, retryTurnstile } from '$lib/utils/turnstile';
	import type { TurnstileStatus } from '$lib/utils/turnstile';
	import { saveSession, loadSession, clearSession, type SavedSession } from '$lib/utils/persistence';
	import PersonaCard from '$lib/components/PersonaCard.svelte';
	import ConstraintList from '$lib/components/ConstraintList.svelte';
	import AnalysisPanel from '$lib/components/AnalysisPanel.svelte';
	import VariantGrid from '$lib/components/VariantGrid.svelte';
	import ClipBoard from '$lib/components/ClipBoard.svelte';
	import ExportPanel from '$lib/components/ExportPanel.svelte';

	// --- Session Recovery ---
	let savedSession: SavedSession | null = $state(null);
	let showRecovery = $state(false);
	let persistenceReady = $state(false);

	function resumeSession() {
		if (!savedSession) return;
		session.restore(savedSession.store);
		personaDescription = savedSession.page.personaDescription;
		domain = savedSession.page.domain;
		constraints = savedSession.page.constraints;
		hmwStatement = savedSession.page.hmwStatement;
		emergentTheme = savedSession.page.emergentTheme;
		hasStreamStarted = !!savedSession.store.persona;
		hasAnalysisStarted = !!savedSession.store.analysis;
		hasExpandStarted = savedSession.store.candidates.length > 0;
		showRecovery = false;
		savedSession = null;
		persistenceReady = true;
	}

	function startFresh() {
		clearSession();
		showRecovery = false;
		savedSession = null;
		persistenceReady = true;
	}

	// --- Turnstile ---
	let turnstileContainer: HTMLDivElement = $state(undefined as unknown as HTMLDivElement);
	let turnstileWarning: string | null = $state(null);
	let turnstileFailed = $state(false);

	function handleRetryTurnstile() {
		if (PUBLIC_TURNSTILE_SITE_KEY && turnstileContainer) {
			retryTurnstile(PUBLIC_TURNSTILE_SITE_KEY, turnstileContainer);
		}
	}

	onMount(() => {
		// Load saved session
		const loaded = loadSession();
		if (loaded) {
			savedSession = loaded;
			showRecovery = true;
		} else {
			persistenceReady = true;
		}

		if (PUBLIC_TURNSTILE_SITE_KEY && turnstileContainer) {
			initTurnstile(PUBLIC_TURNSTILE_SITE_KEY, turnstileContainer);
			onTurnstileStatus((status: TurnstileStatus) => {
				if (status === 'failed' || status === 'error') {
					turnstileFailed = true;
					turnstileWarning = 'Bot verification unavailable — requests may fail';
				} else if (status === 'ready') {
					turnstileFailed = false;
					turnstileWarning = null;
				}
			});
		}
	});

	onDestroy(() => {
		destroyTurnstile();
	});

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

	// --- Rate-limit state (shared across all stages) ---
	let rateLimitRetryAfter = $state(0);
	let rateLimitRemaining: number | null = $state(null);
	let rateLimitSessionExhausted = $state(false);

	const rateLimitActive = $derived(rateLimitRetryAfter > 0 || rateLimitSessionExhausted);

	$effect(() => {
		if (rateLimitRetryAfter <= 0) return;

		const interval = setInterval(() => {
			rateLimitRetryAfter = Math.max(0, rateLimitRetryAfter - 1);
		}, 1000);

		return () => clearInterval(interval);
	});

	function handleRateLimitError(err: RateLimitError): void {
		if (err.isSessionLimit) {
			rateLimitSessionExhausted = true;
		} else {
			rateLimitRetryAfter = err.retryAfter;
		}
	}

	function handleResponseHeaders(headers: Headers): void {
		const remaining = headers.get('X-RateLimit-Remaining');
		if (remaining !== null) {
			rateLimitRemaining = parseInt(remaining, 10);
		}
	}

	// --- Re-analysis warning ---
	let personaDirty = $state(false);

	// --- Streaming dedup helper ---
	// BAML streams progressively-building arrays where each SSE event contains
	// the full array so far with partially-complete entries. We track committed
	// indices and only add a variant once its moveType field appears (the
	// completeness signal).
	function processStreamingVariants(
		variants: HMWVariant[] | undefined,
		committedIndices: Set<number>,
		iteration: number
	): void {
		if (!variants) return;
		for (let i = 0; i < variants.length; i++) {
			const v = variants[i];
			if (!committedIndices.has(i) && v.moveType && v.statement) {
				committedIndices.add(i);
				session.addCandidates([v], iteration);
			}
		}
	}

	async function refinePersona() {
		if (!personaDescription.trim()) return;

		error = null;
		hasStreamStarted = true;
		streamingPersona = {};
		session.startStreaming();

		try {
			let latestPartial: Partial<Persona> = {};
			await streamFromAPI<Persona>(
				'/api/persona',
				{ rawInput: personaDescription },
				(partial) => {
					latestPartial = partial;
					streamingPersona = partial;
				},
				{ onHeaders: handleResponseHeaders }
			);

			const finalPersona = latestPartial as Persona;
			session.setPersona(finalPersona);
			session.setContext({
				domain: domain.trim(),
				persona: finalPersona,
				constraints: [...constraints]
			});
		} catch (e) {
			if (e instanceof RateLimitError) {
				handleRateLimitError(e);
			} else if (e instanceof TurnstileError) {
				turnstileFailed = true;
				turnstileWarning = 'Bot protection check failed — try refreshing';
				error = 'Bot protection check failed — try refreshing';
			} else {
				error = e instanceof Error ? e.message : 'An unexpected error occurred';
			}
		} finally {
			session.stopStreaming();
			resetTurnstile();
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
				},
				{ onHeaders: handleResponseHeaders }
			);

			session.setAnalysis(latestPartial as HMWAnalysis);
			personaDirty = false;
		} catch (e) {
			if (e instanceof RateLimitError) {
				handleRateLimitError(e);
			} else if (e instanceof TurnstileError) {
				turnstileFailed = true;
				turnstileWarning = 'Bot protection check failed — try refreshing';
				analysisError = 'Bot protection check failed — try refreshing';
			} else {
				analysisError = e instanceof Error ? e.message : 'An unexpected error occurred';
			}
		} finally {
			isAnalyzing = false;
			resetTurnstile();
		}
	}

	async function expandHMW() {
		if (!session.analysis || !session.problemContext) return;

		expandError = null;
		hasExpandStarted = true;
		isExpanding = true;
		emergentTheme = null;

		const committedIndices = new Set<number>();

		try {
			await streamFromAPI<HMWExpansion>(
				'/api/expand',
				{ analysis: session.analysis, context: session.problemContext },
				(partial) => {
					if (partial.emergentTheme) {
						emergentTheme = partial.emergentTheme;
					}
					processStreamingVariants(partial.variants, committedIndices, 0);
				},
				{ onHeaders: handleResponseHeaders }
			);
		} catch (e) {
			if (e instanceof RateLimitError) {
				handleRateLimitError(e);
			} else if (e instanceof TurnstileError) {
				turnstileFailed = true;
				turnstileWarning = 'Bot protection check failed — try refreshing';
				expandError = 'Bot protection check failed — try refreshing';
			} else {
				expandError = e instanceof Error ? e.message : 'An unexpected error occurred';
			}
		} finally {
			isExpanding = false;
			resetTurnstile();
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
		const committedIndices = new Set<number>();

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
					processStreamingVariants(partial.newVariants, committedIndices, currentIteration);
				},
				{ onHeaders: handleResponseHeaders }
			);
		} catch (e) {
			if (e instanceof RateLimitError) {
				handleRateLimitError(e);
			} else if (e instanceof TurnstileError) {
				turnstileFailed = true;
				turnstileWarning = 'Bot protection check failed — try refreshing';
				refineError = 'Bot protection check failed — try refreshing';
			} else {
				refineError = e instanceof Error ? e.message : 'An unexpected error occurred';
			}
		} finally {
			isRefining = false;
			resetTurnstile();
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

	// --- Auto-save to localStorage (debounced 500ms) ---
	let saveTimer: ReturnType<typeof setTimeout> | undefined;
	$effect(() => {
		// Read all persistent fields to establish reactive dependencies
		const _persona = session.persona;
		const _problemContext = session.problemContext;
		const _analysis = session.analysis;
		const _candidates = session.candidates;
		const _iterationCount = session.iterationCount;
		const _personaDescription = personaDescription;
		const _domain = domain;
		const _constraints = constraints;
		const _hmwStatement = hmwStatement;
		const _emergentTheme = emergentTheme;
		const _ready = persistenceReady;

		if (!_ready) return;

		clearTimeout(saveTimer);
		saveTimer = setTimeout(() => {
			saveSession(
				{
					persona: _persona,
					problemContext: _problemContext,
					analysis: _analysis,
					candidates: _candidates,
					iterationCount: _iterationCount
				},
				{
					personaDescription: _personaDescription,
					domain: _domain,
					constraints: _constraints,
					hmwStatement: _hmwStatement,
					emergentTheme: _emergentTheme
				}
			);
		}, 500);

		return () => clearTimeout(saveTimer);
	});
</script>

<main class="min-h-screen bg-gray-50">
	<header class="bg-white border-b border-gray-200 px-6 py-4">
		<div class="max-w-4xl mx-auto flex items-center justify-between">
			<a href="/" class="text-lg font-semibold text-gray-900">HMW Workshop</a>
		</div>
	</header>

	<div class="max-w-4xl mx-auto px-6 py-8 space-y-8">
		<!-- Session recovery banner -->
		{#if showRecovery && savedSession}
			<div
				class="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800 flex items-center justify-between"
				data-testid="recovery-banner"
			>
				<span>
					You have a saved session from {new Date(savedSession.savedAt).toLocaleString()}.
				</span>
				<div class="flex gap-2 ml-4">
					<button
						class="px-3 py-1 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 transition-colors"
						onclick={resumeSession}
						data-testid="recovery-resume"
					>
						Resume
					</button>
					<button
						class="px-3 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium hover:bg-blue-200 transition-colors"
						onclick={startFresh}
						data-testid="recovery-start-fresh"
					>
						Start fresh
					</button>
				</div>
			</div>
		{/if}

		<!-- Turnstile warning banner -->
		{#if turnstileWarning}
			<div
				class="bg-amber-50 border border-amber-300 rounded-lg p-4 text-sm text-amber-800 flex items-center justify-between"
				data-testid="turnstile-warning"
			>
				<span>{turnstileWarning}</span>
				{#if PUBLIC_TURNSTILE_SITE_KEY}
					<button
						class="ml-4 px-3 py-1 bg-amber-200 hover:bg-amber-300 rounded text-xs font-medium transition-colors"
						onclick={handleRetryTurnstile}
						data-testid="turnstile-retry"
					>
						Retry verification
					</button>
				{/if}
			</div>
		{/if}

		<!-- Rate-limit banner -->
		{#if rateLimitActive}
			<div
				class="bg-amber-50 border border-amber-300 rounded-lg p-4 text-sm text-amber-800"
				data-testid="rate-limit-banner"
			>
				{#if rateLimitSessionExhausted}
					Session request limit reached. Please refresh to start a new session.
				{:else}
					Rate limit reached. You can try again in <strong>{rateLimitRetryAfter}s</strong>.
				{/if}
			</div>
		{/if}

		<!-- Remaining requests indicator -->
		{#if rateLimitRemaining !== null && !rateLimitActive}
			<p class="text-xs text-gray-400 text-right" data-testid="rate-limit-remaining">
				{rateLimitRemaining} requests remaining
			</p>
		{/if}

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
					disabled={!personaDescription.trim() || session.isStreaming || rateLimitActive}
					data-testid="refine-button"
				>
					{#if rateLimitActive && rateLimitRetryAfter > 0}
						Wait {rateLimitRetryAfter}s...
					{:else if session.isStreaming}
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
						disabled={!hmwStatement.trim() || isAnalyzing || rateLimitActive}
						data-testid="analyze-button"
					>
						{#if rateLimitActive && rateLimitRetryAfter > 0}
							Wait {rateLimitRetryAfter}s...
						{:else if isAnalyzing}
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
							disabled={isExpanding || rateLimitActive}
							data-testid="expand-button"
						>
							{#if rateLimitActive && rateLimitRetryAfter > 0}
								Wait {rateLimitRetryAfter}s...
							{:else if isExpanding}
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
								disabled={!hasActionedCandidates || rateLimitActive}
								data-testid="refine-button-stage4"
							>
								{#if rateLimitActive && rateLimitRetryAfter > 0}
									Wait {rateLimitRetryAfter}s...
								{:else}
									Go Deeper
								{/if}
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

	<!-- Turnstile invisible widget container -->
	{#if PUBLIC_TURNSTILE_SITE_KEY}
		<div bind:this={turnstileContainer} aria-hidden="true" style="position:absolute;left:-9999px"></div>
	{/if}
</main>
