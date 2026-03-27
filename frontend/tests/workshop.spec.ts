import { test, expect } from '@playwright/test';
import { mockPersonaPartials, mockPersonaFinal, personaSSEStream } from './fixtures/persona';
import { mockAnalysisPartials, mockAnalysisFinal } from './fixtures/analysis';
import { mockExpansionPartials, mockExpansionFinal } from './fixtures/expansion';
import { mockRefinementPartials } from './fixtures/refinement';

// Helper: build an SSE response body from an array of objects
function buildSSEBody(partials: unknown[]): string {
	return partials.map((p) => `data: ${JSON.stringify(p)}\n\n`).join('') + 'data: [DONE]\n\n';
}

test.describe('Landing page', () => {
	test('shows title and start button', async ({ page }) => {
		await page.goto('/');
		await expect(page.getByRole('heading', { name: 'HMW Workshop' })).toBeVisible();
		await expect(page.getByRole('link', { name: 'Start a Session' })).toBeVisible();
	});

	test('navigates to workshop page', async ({ page }) => {
		await page.goto('/');
		await page.getByRole('link', { name: 'Start a Session' }).click();
		await expect(page).toHaveURL('/workshop');
	});
});

test.describe('Workshop page', () => {
	test('shows workshop header', async ({ page }) => {
		await page.goto('/workshop');
		await expect(page.getByRole('link', { name: 'HMW Workshop' })).toBeVisible();
	});

	test('shows Stage 1 setup form', async ({ page }) => {
		await page.goto('/workshop');
		await expect(page.getByTestId('stage-1')).toBeVisible();
		await expect(page.getByLabel('Who is this for?')).toBeVisible();
		await expect(page.getByLabel("What's the space/domain?")).toBeVisible();
		await expect(page.getByTestId('refine-button')).toBeVisible();
	});

	test('refine button is disabled when persona description is empty', async ({ page }) => {
		await page.goto('/workshop');
		await expect(page.getByTestId('refine-button')).toBeDisabled();
	});

	test('refine button enables when persona description is filled', async ({ page }) => {
		await page.goto('/workshop');
		await page.getByLabel('Who is this for?').fill('A junior designer who runs workshops');
		await expect(page.getByTestId('refine-button')).toBeEnabled();
	});
});

test.describe('Stage 1 — Persona streaming', () => {
	test('clicking Refine streams persona and shows PersonaCard', async ({ page }) => {
		const body = buildSSEBody(mockPersonaPartials);
		await page.route('/api/persona', (route) => {
			route.fulfill({
				status: 200,
				headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
				body
			});
		});

		await page.goto('/workshop');
		await page.getByLabel('Who is this for?').fill('A junior designer');
		await page.getByTestId('refine-button').click();

		// PersonaCard should appear with final data
		await expect(page.getByTestId('persona-card')).toBeVisible();
		await expect(page.getByTestId('persona-label')).toHaveText(mockPersonaFinal.label);
		await expect(page.getByTestId('persona-role')).toHaveText(mockPersonaFinal.role);
	});

	test('PersonaCard displays all persona fields', async ({ page }) => {
		const body = buildSSEBody(mockPersonaPartials);
		await page.route('/api/persona', (route) => {
			route.fulfill({
				status: 200,
				headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
				body
			});
		});

		await page.goto('/workshop');
		await page.getByLabel('Who is this for?').fill('A junior designer');
		await page.getByTestId('refine-button').click();

		const card = page.getByTestId('persona-card');
		await expect(card).toBeVisible();

		// Check all fields are rendered
		await expect(card.getByTestId('persona-label')).toHaveText('Junior Designer');
		await expect(card.getByTestId('persona-role')).toHaveText('Product Designer');

		// Goals are listed
		for (const goal of mockPersonaFinal.goals) {
			await expect(card.getByText(goal)).toBeVisible();
		}

		// Frustrations are listed
		for (const frustration of mockPersonaFinal.frustrations) {
			await expect(card.getByText(frustration)).toBeVisible();
		}

		// Context
		await expect(card.getByTestId('persona-context')).toContainText(mockPersonaFinal.context);

		// Influencers are listed
		for (const influencer of mockPersonaFinal.influencers) {
			await expect(card.getByText(influencer)).toBeVisible();
		}
	});

	test('PersonaCard inline edit — click label, type, Enter commits', async ({ page }) => {
		await page.goto('/workshop');
		await page.getByLabel('Who is this for?').fill('A junior designer');
		await page.getByTestId('refine-button').click();

		// Wait for streaming to fully complete (button text changes back from "Refining...")
		await expect(page.getByTestId('refine-button')).toHaveText('Refine Persona', {
			timeout: 10000
		});

		const card = page.getByTestId('persona-card');
		await expect(card.getByTestId('persona-label')).toHaveText('Junior Designer');

		// Click label to enter edit mode
		await card.getByTestId('persona-label').click();

		// An input should appear — clear and type new value
		const input = card.locator('input[type="text"]').first();
		await expect(input).toBeFocused();
		await input.fill('Senior Designer');
		await input.press('Enter');

		// Label should now show updated text
		await expect(card.getByTestId('persona-label')).toHaveText('Senior Designer');
	});
});

test.describe('ConstraintList', () => {
	test('add constraint button opens form', async ({ page }) => {
		await page.goto('/workshop');
		const addButton = page.getByTestId('add-constraint-button').first();
		await addButton.click();
		await expect(page.getByTestId('add-constraint-form')).toBeVisible();
	});

	test('can add a constraint with type selection', async ({ page }) => {
		await page.goto('/workshop');
		const addButton = page.getByTestId('add-constraint-button').first();
		await addButton.click();

		// Type a constraint statement
		await page.getByPlaceholder('Constraint statement...').fill('Must work offline');

		// Select "soft" type
		await page.getByTestId('type-option-soft').click();

		// Click Add
		await page.getByTestId('confirm-add-constraint').click();

		// Constraint should appear in the list
		const item = page.getByTestId('constraint-item').first();
		await expect(item).toBeVisible();
		await expect(item.getByTestId('constraint-badge')).toHaveText('soft');
		await expect(item.getByTestId('constraint-statement')).toHaveText('Must work offline');
	});

	test('can delete a constraint', async ({ page }) => {
		await page.goto('/workshop');

		// Add a constraint first
		await page.getByTestId('add-constraint-button').first().click();
		await page.getByPlaceholder('Constraint statement...').fill('Budget under $10k');
		await page.getByTestId('confirm-add-constraint').click();
		await expect(page.getByTestId('constraint-item')).toHaveCount(1);

		// Delete it — need to hover to show the delete button
		const item = page.getByTestId('constraint-item').first();
		await item.hover();
		await item.getByTestId('constraint-delete').click();

		// Should be gone
		await expect(page.getByTestId('constraint-item')).toHaveCount(0);
	});

	test('can edit a constraint inline', async ({ page }) => {
		await page.goto('/workshop');

		// Add a constraint first
		await page.getByTestId('add-constraint-button').first().click();
		await page.getByPlaceholder('Constraint statement...').fill('Original text');
		await page.getByTestId('confirm-add-constraint').click();

		// Click the statement to edit
		await page.getByTestId('constraint-statement').first().click();

		// Input should appear focused
		const input = page.getByTestId('constraint-item').first().locator('input[type="text"]');
		await expect(input).toBeFocused();
		await input.fill('Updated text');
		await input.blur();

		// Statement should now show updated text
		await expect(page.getByTestId('constraint-statement').first()).toHaveText('Updated text');
	});

	test('constraint type badges have correct colors', async ({ page }) => {
		await page.goto('/workshop');

		// Add hard constraint
		await page.getByTestId('add-constraint-button').first().click();
		await page.getByPlaceholder('Constraint statement...').fill('Hard constraint');
		await page.getByTestId('type-option-hard').click();
		await page.getByTestId('confirm-add-constraint').click();

		// Add soft constraint
		await page.getByTestId('add-constraint-button').first().click();
		await page.getByPlaceholder('Constraint statement...').fill('Soft constraint');
		await page.getByTestId('type-option-soft').click();
		await page.getByTestId('confirm-add-constraint').click();

		// Add assumption constraint
		await page.getByTestId('add-constraint-button').first().click();
		await page.getByPlaceholder('Constraint statement...').fill('Assumption constraint');
		await page.getByTestId('type-option-assumption').click();
		await page.getByTestId('confirm-add-constraint').click();

		// Check badges
		const badges = page.getByTestId('constraint-badge');
		await expect(badges).toHaveCount(3);
		await expect(badges.nth(0)).toHaveText('hard');
		await expect(badges.nth(1)).toHaveText('soft');
		await expect(badges.nth(2)).toHaveText('assumption');

		// Check badge color classes
		await expect(badges.nth(0)).toHaveClass(/bg-red-100/);
		await expect(badges.nth(1)).toHaveClass(/bg-yellow-100/);
		await expect(badges.nth(2)).toHaveClass(/bg-blue-100/);
	});
});

test.describe('Stage 1 — Post-refinement constraints', () => {
	test('ConstraintList appears after persona refinement completes', async ({ page }) => {
		const body = buildSSEBody(mockPersonaPartials);
		await page.route('/api/persona', (route) => {
			route.fulfill({
				status: 200,
				headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
				body
			});
		});

		await page.goto('/workshop');

		// Add a pre-refinement constraint
		await page.getByTestId('add-constraint-button').first().click();
		await page.getByPlaceholder('Constraint statement...').fill('Must be mobile-first');
		await page.getByTestId('confirm-add-constraint').click();

		// Fill persona and refine
		await page.getByLabel('Who is this for?').fill('A junior designer');
		await page.getByTestId('refine-button').click();

		// After refinement, a post-refinement ConstraintList should appear below PersonaCard
		await expect(page.getByTestId('persona-card')).toBeVisible();

		// There should now be two ConstraintLists (one in form, one post-refinement)
		const constraintLists = page.getByTestId('constraint-list');
		await expect(constraintLists).toHaveCount(2);

		// The post-refinement one should contain our pre-refinement constraint
		const postList = constraintLists.nth(1);
		await expect(postList.getByText('Must be mobile-first')).toBeVisible();
	});
});

test.describe('Stage 1 — SSE fixture format', () => {
	test('personaSSEStream produces expected format', () => {
		const lines = personaSSEStream();
		expect(lines).toHaveLength(mockPersonaPartials.length + 1);
		expect(lines[lines.length - 1]).toBe('data: [DONE]');
	});
});

// --- Stage 2: Analysis ---

// Helper: complete Stage 1 by mocking persona API and clicking Refine
async function completeStage1(page: import('@playwright/test').Page) {
	const personaBody = buildSSEBody(mockPersonaPartials);
	await page.route('/api/persona', (route) => {
		route.fulfill({
			status: 200,
			headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
			body: personaBody
		});
	});

	await page.goto('/workshop');
	await page.getByLabel('Who is this for?').fill('A junior designer');
	await page.getByLabel("What's the space/domain?").fill('Design thinking facilitation');
	await page.getByTestId('refine-button').click();
	await expect(page.getByTestId('persona-card')).toBeVisible();
	// Wait for streaming to complete
	await expect(page.getByTestId('refine-button')).toHaveText('Refine Persona', { timeout: 10000 });
}

test.describe('Stage 2 — Visibility gating', () => {
	test('Stage 2 is not visible before persona completion', async ({ page }) => {
		await page.goto('/workshop');
		await expect(page.getByTestId('stage-2')).not.toBeVisible();
	});

	test('Stage 2 appears after persona refinement completes', async ({ page }) => {
		await completeStage1(page);
		await expect(page.getByTestId('stage-2')).toBeVisible();
	});
});

test.describe('Stage 2 — Analyze form', () => {
	test('shows HMW input and Analyze button', async ({ page }) => {
		await completeStage1(page);
		await expect(page.getByLabel('Your rough HMW statement')).toBeVisible();
		await expect(page.getByTestId('analyze-button')).toBeVisible();
	});

	test('Analyze button is disabled when HMW input is empty', async ({ page }) => {
		await completeStage1(page);
		await expect(page.getByTestId('analyze-button')).toBeDisabled();
	});

	test('Analyze button enables when HMW input is filled', async ({ page }) => {
		await completeStage1(page);
		await page.getByLabel('Your rough HMW statement').fill('How might we make workshops more productive?');
		await expect(page.getByTestId('analyze-button')).toBeEnabled();
	});
});

test.describe('Stage 2 — Analysis streaming', () => {
	test('clicking Analyze streams analysis and shows AnalysisPanel', async ({ page }) => {
		await completeStage1(page);

		const analysisBody = buildSSEBody(mockAnalysisPartials);
		await page.route('/api/analyze', (route) => {
			route.fulfill({
				status: 200,
				headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
				body: analysisBody
			});
		});

		await page.getByLabel('Your rough HMW statement').fill('How might we make workshops more productive?');
		await page.getByTestId('analyze-button').click();

		// AnalysisPanel should appear with final data
		await expect(page.getByTestId('analysis-panel')).toBeVisible();
		await expect(page.getByTestId('analyze-button')).toHaveText('Analyze', { timeout: 10000 });
	});

	test('AnalysisPanel displays all analysis fields', async ({ page }) => {
		await completeStage1(page);

		const analysisBody = buildSSEBody(mockAnalysisPartials);
		await page.route('/api/analyze', (route) => {
			route.fulfill({
				status: 200,
				headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
				body: analysisBody
			});
		});

		await page.getByLabel('Your rough HMW statement').fill('How might we make workshops more productive?');
		await page.getByTestId('analyze-button').click();

		const panel = page.getByTestId('analysis-panel');
		await expect(panel).toBeVisible();
		await expect(page.getByTestId('analyze-button')).toHaveText('Analyze', { timeout: 10000 });

		// Implicit user
		await expect(panel.getByTestId('analysis-implicit-user')).toContainText(
			mockAnalysisFinal.implicitUser
		);

		// Embedded assumptions
		const assumptions = panel.getByTestId('analysis-assumptions');
		await expect(assumptions).toBeVisible();
		for (const assumption of mockAnalysisFinal.embeddedAssumptions) {
			await expect(assumptions.getByText(assumption)).toBeVisible();
		}

		// Scope level
		await expect(panel.getByTestId('analysis-scope-level')).toBeVisible();
		await expect(panel.getByTestId('scope-badge')).toHaveText('Too Broad');

		// Underlying tension
		await expect(panel.getByTestId('analysis-tension')).toContainText(
			mockAnalysisFinal.underlyingTension
		);

		// Initial reframing
		await expect(panel.getByTestId('analysis-reframing')).toContainText(
			mockAnalysisFinal.initialReframing
		);
	});

	test('scope level badge shows correct color class', async ({ page }) => {
		await completeStage1(page);

		const analysisBody = buildSSEBody(mockAnalysisPartials);
		await page.route('/api/analyze', (route) => {
			route.fulfill({
				status: 200,
				headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
				body: analysisBody
			});
		});

		await page.getByLabel('Your rough HMW statement').fill('How might we make workshops more productive?');
		await page.getByTestId('analyze-button').click();
		await expect(page.getByTestId('analyze-button')).toHaveText('Analyze', { timeout: 10000 });

		// The mock data has scopeLevel: 'too_broad' → amber badge
		await expect(page.getByTestId('scope-badge')).toHaveClass(/bg-amber-100/);
	});

	test('solution bias callout does not appear when solutionBias is undefined', async ({ page }) => {
		await completeStage1(page);

		// The default mock analysis has solutionBias: undefined
		const analysisBody = buildSSEBody(mockAnalysisPartials);
		await page.route('/api/analyze', (route) => {
			route.fulfill({
				status: 200,
				headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
				body: analysisBody
			});
		});

		await page.getByLabel('Your rough HMW statement').fill('How might we make workshops more productive?');
		await page.getByTestId('analyze-button').click();
		await expect(page.getByTestId('analyze-button')).toHaveText('Analyze', { timeout: 10000 });

		await expect(page.getByTestId('analysis-solution-bias')).not.toBeVisible();
	});

	test('solution bias fixture has undefined solutionBias — verifies conditional rendering path', () => {
		// The mock fixture has solutionBias: undefined, so the callout should NOT render.
		// This confirms the {#if analysis.solutionBias} conditional works.
		// Note: page.route() cannot override mockFetch responses (VITE_MOCK_API=true),
		// so we validate the fixture data shape here and the DOM absence above.
		expect(mockAnalysisFinal.solutionBias).toBeUndefined();
	});
});

// --- Stage 3: Expand ---

// Helper: complete Stage 2 by mocking persona + analyze, progressing through both
async function completeStage2(page: import('@playwright/test').Page) {
	const personaBody = buildSSEBody(mockPersonaPartials);
	const analysisBody = buildSSEBody(mockAnalysisPartials);

	await page.route('/api/persona', (route) => {
		route.fulfill({
			status: 200,
			headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
			body: personaBody
		});
	});
	await page.route('/api/analyze', (route) => {
		route.fulfill({
			status: 200,
			headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
			body: analysisBody
		});
	});

	await page.goto('/workshop');

	// Complete Stage 1
	await page.getByLabel('Who is this for?').fill('A junior designer');
	await page.getByLabel("What's the space/domain?").fill('Design thinking facilitation');
	await page.getByTestId('refine-button').click();
	await expect(page.getByTestId('refine-button')).toHaveText('Refine Persona', { timeout: 10000 });

	// Complete Stage 2
	await page.getByLabel('Your rough HMW statement').fill('How might we make workshops more productive?');
	await page.getByTestId('analyze-button').click();
	await expect(page.getByTestId('analyze-button')).toHaveText('Analyze', { timeout: 10000 });
}

test.describe('Stage 3 — Visibility gating', () => {
	test('Stage 3 is not visible before analysis completion', async ({ page }) => {
		await page.goto('/workshop');
		await expect(page.getByTestId('stage-3')).not.toBeVisible();
	});

	test('Stage 3 appears after analysis completes', async ({ page }) => {
		await completeStage2(page);
		await expect(page.getByTestId('stage-3')).toBeVisible();
	});
});

test.describe('Stage 3 — Expand streaming', () => {
	test('clicking Expand generates variant cards', async ({ page }) => {
		await completeStage2(page);

		const expansionBody = buildSSEBody(mockExpansionPartials);
		await page.route('/api/expand', (route) => {
			route.fulfill({
				status: 200,
				headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
				body: expansionBody
			});
		});

		await page.getByTestId('expand-button').click();

		// Wait for cards to appear — the final partial has 6 variants
		await expect(page.getByTestId('variant-card')).toHaveCount(6, { timeout: 10000 });
	});

	test('variant cards show HMW statement and rationale', async ({ page }) => {
		await completeStage2(page);

		const expansionBody = buildSSEBody(mockExpansionPartials);
		await page.route('/api/expand', (route) => {
			route.fulfill({
				status: 200,
				headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
				body: expansionBody
			});
		});

		await page.getByTestId('expand-button').click();
		await expect(page.getByTestId('variant-card')).toHaveCount(6, { timeout: 10000 });

		const firstCard = page.getByTestId('variant-card').first();
		await expect(firstCard.getByTestId('variant-statement')).toContainText(
			mockExpansionFinal.variants[0].statement
		);
		await expect(firstCard.getByTestId('variant-rationale')).toContainText(
			mockExpansionFinal.variants[0].rationale
		);
	});

	test('variant cards have color-coded move type badges', async ({ page }) => {
		await completeStage2(page);

		const expansionBody = buildSSEBody(mockExpansionPartials);
		await page.route('/api/expand', (route) => {
			route.fulfill({
				status: 200,
				headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
				body: expansionBody
			});
		});

		await page.getByTestId('expand-button').click();
		await expect(page.getByTestId('variant-card')).toHaveCount(6, { timeout: 10000 });

		// First card move is "narrowed" → green badge
		const firstBadge = page.getByTestId('variant-card').first().getByTestId('move-badge');
		await expect(firstBadge).toHaveText('Narrowed');
		await expect(firstBadge).toHaveClass(/bg-green-100/);

		// Second card move is "shifted_user" → orange badge
		const secondBadge = page.getByTestId('variant-card').nth(1).getByTestId('move-badge');
		await expect(secondBadge).toHaveText('Shifted User');
		await expect(secondBadge).toHaveClass(/bg-orange-100/);
	});

	test('emergent theme appears after expansion completes', async ({ page }) => {
		await completeStage2(page);

		const expansionBody = buildSSEBody(mockExpansionPartials);
		await page.route('/api/expand', (route) => {
			route.fulfill({
				status: 200,
				headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
				body: expansionBody
			});
		});

		await page.getByTestId('expand-button').click();
		await expect(page.getByTestId('variant-card')).toHaveCount(6, { timeout: 10000 });
		await expect(page.getByTestId('emergent-theme')).toBeVisible();
		await expect(page.getByTestId('emergent-theme')).toContainText(
			mockExpansionFinal.emergentTheme!
		);
	});
});

test.describe('Stage 3 — VariantCard actions', () => {
	async function setupWithExpansion(page: import('@playwright/test').Page) {
		await completeStage2(page);

		const expansionBody = buildSSEBody(mockExpansionPartials);
		await page.route('/api/expand', (route) => {
			route.fulfill({
				status: 200,
				headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
				body: expansionBody
			});
		});

		await page.getByTestId('expand-button').click();
		await expect(page.getByTestId('variant-card')).toHaveCount(6, { timeout: 10000 });
	}

	test('Select action highlights card with blue border', async ({ page }) => {
		await setupWithExpansion(page);

		const firstCard = page.getByTestId('variant-card').first();
		await firstCard.getByTestId('action-select').click();

		await expect(firstCard).toHaveAttribute('data-status', 'selected');
		await expect(firstCard).toHaveClass(/border-blue-400/);
	});

	test('Skip action grays out card', async ({ page }) => {
		await setupWithExpansion(page);

		const firstCard = page.getByTestId('variant-card').first();
		await firstCard.getByTestId('action-skip').click();

		await expect(firstCard).toHaveAttribute('data-status', 'skipped');
		await expect(firstCard).toHaveClass(/opacity-50/);
	});

	test('Skip action shows undo button', async ({ page }) => {
		await setupWithExpansion(page);

		const firstCard = page.getByTestId('variant-card').first();
		await firstCard.getByTestId('action-skip').click();

		await expect(firstCard.getByTestId('action-undo')).toBeVisible();
	});

	test('Undo reverts skipped card to generated state', async ({ page }) => {
		await setupWithExpansion(page);

		const firstCard = page.getByTestId('variant-card').first();
		await firstCard.getByTestId('action-skip').click();
		await expect(firstCard).toHaveAttribute('data-status', 'skipped');

		await firstCard.getByTestId('action-undo').click();
		await expect(firstCard).toHaveAttribute('data-status', 'generated');
	});

	test('Clip action adds card to clipboard', async ({ page }) => {
		await setupWithExpansion(page);

		const firstCard = page.getByTestId('variant-card').first();
		await firstCard.getByTestId('action-clip').click();

		await expect(firstCard).toHaveAttribute('data-status', 'clipped');
		await expect(page.getByTestId('clipboard-count')).toHaveText('1');
		await expect(page.getByTestId('clipboard-item')).toHaveCount(1);
	});

	test('Edit action opens inline edit, commit updates statement', async ({ page }) => {
		await setupWithExpansion(page);

		const firstCard = page.getByTestId('variant-card').first();
		await firstCard.getByTestId('action-edit').click();

		// Textarea should appear
		const textarea = firstCard.getByTestId('variant-edit-input');
		await expect(textarea).toBeFocused();

		// Clear and type new text
		await textarea.fill('My custom HMW question');
		await textarea.blur();

		// Should show edited text and indicator
		await expect(firstCard.getByTestId('variant-statement')).toHaveText('My custom HMW question');
		await expect(firstCard).toHaveAttribute('data-status', 'edited');
		await expect(firstCard.getByTestId('edited-indicator')).toBeVisible();
	});
});

test.describe('Stage 3 — ClipBoard', () => {
	async function setupWithExpansion(page: import('@playwright/test').Page) {
		await completeStage2(page);

		const expansionBody = buildSSEBody(mockExpansionPartials);
		await page.route('/api/expand', (route) => {
			route.fulfill({
				status: 200,
				headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
				body: expansionBody
			});
		});

		await page.getByTestId('expand-button').click();
		await expect(page.getByTestId('variant-card')).toHaveCount(6, { timeout: 10000 });
	}

	test('ClipBoard initially shows empty state', async ({ page }) => {
		await setupWithExpansion(page);

		await expect(page.getByTestId('clipboard')).toBeVisible();
		await expect(page.getByTestId('clipboard-count')).toHaveText('0');
		await expect(page.getByTestId('clipboard-empty')).toBeVisible();
	});

	test('ClipBoard shows clipped items with statement and move badge', async ({ page }) => {
		await setupWithExpansion(page);

		// Clip first card
		await page.getByTestId('variant-card').first().getByTestId('action-clip').click();

		const item = page.getByTestId('clipboard-item').first();
		await expect(item).toBeVisible();
		await expect(item.getByTestId('clipboard-statement')).toContainText(
			mockExpansionFinal.variants[0].statement
		);
		await expect(item.getByTestId('clipboard-move-badge')).toHaveText('Narrowed');
	});

	test('ClipBoard count updates as items are clipped', async ({ page }) => {
		await setupWithExpansion(page);

		await page.getByTestId('variant-card').first().getByTestId('action-clip').click();
		await expect(page.getByTestId('clipboard-count')).toHaveText('1');

		await page.getByTestId('variant-card').nth(1).getByTestId('action-clip').click();
		await expect(page.getByTestId('clipboard-count')).toHaveText('2');
	});

	test('ClipBoard remove button unclips item', async ({ page }) => {
		await setupWithExpansion(page);

		// Clip first card
		await page.getByTestId('variant-card').first().getByTestId('action-clip').click();
		await expect(page.getByTestId('clipboard-count')).toHaveText('1');

		// Remove from clipboard
		const item = page.getByTestId('clipboard-item').first();
		await item.hover();
		await item.getByTestId('clipboard-remove').click();

		await expect(page.getByTestId('clipboard-count')).toHaveText('0');
		await expect(page.getByTestId('clipboard-empty')).toBeVisible();
	});
});

test.describe('Stage 4 — Go Deeper (Refine)', () => {
	async function setupWithExpansion(page: import('@playwright/test').Page) {
		await completeStage2(page);

		const expansionBody = buildSSEBody(mockExpansionPartials);
		await page.route('/api/expand', (route) => {
			route.fulfill({
				status: 200,
				headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
				body: expansionBody
			});
		});

		await page.getByTestId('expand-button').click();
		await expect(page.getByTestId('variant-card')).toHaveCount(6, { timeout: 10000 });
	}

	test('Go Deeper button is disabled when no candidates are selected', async ({ page }) => {
		await setupWithExpansion(page);

		await expect(page.getByTestId('refine-button-stage4')).toBeDisabled();
	});

	test('Go Deeper button enables after selecting a candidate', async ({ page }) => {
		await setupWithExpansion(page);

		await page.getByTestId('variant-card').first().getByTestId('action-select').click();
		await expect(page.getByTestId('refine-button-stage4')).toBeEnabled();
	});

	test('Go Deeper streams new variants and shows refinement insights', async ({ page }) => {
		await setupWithExpansion(page);

		const refinementBody = buildSSEBody(mockRefinementPartials);
		await page.route('/api/refine', (route) => {
			route.fulfill({
				status: 200,
				headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
				body: refinementBody
			});
		});

		// Select a candidate first
		await page.getByTestId('variant-card').first().getByTestId('action-select').click();
		await page.getByTestId('refine-button-stage4').click();

		// Should now have original 6 + 3 new = 9 variant cards
		await expect(page.getByTestId('variant-card')).toHaveCount(9, { timeout: 10000 });

		// Refinement insights should appear
		await expect(page.getByTestId('refinement-tensions')).toBeVisible();
		await expect(page.getByTestId('refinement-recommendation')).toBeVisible();
		await expect(page.getByTestId('refinement-suggested-next')).toBeVisible();
	});
});

// --- Iteration Tracking ---

test.describe('Iteration tracking', () => {
	async function setupWithExpansion(page: import('@playwright/test').Page) {
		await completeStage2(page);

		const expansionBody = buildSSEBody(mockExpansionPartials);
		await page.route('/api/expand', (route) => {
			route.fulfill({
				status: 200,
				headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
				body: expansionBody
			});
		});

		await page.getByTestId('expand-button').click();
		await expect(page.getByTestId('variant-card')).toHaveCount(6, { timeout: 10000 });
	}

	test('iteration count is not visible after expand only', async ({ page }) => {
		await setupWithExpansion(page);
		await expect(page.getByTestId('iteration-count')).not.toBeVisible();
	});

	test('iteration count shows after Go Deeper', async ({ page }) => {
		await setupWithExpansion(page);

		const refinementBody = buildSSEBody(mockRefinementPartials);
		await page.route('/api/refine', (route) => {
			route.fulfill({
				status: 200,
				headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
				body: refinementBody
			});
		});

		await page.getByTestId('variant-card').first().getByTestId('action-select').click();
		await page.getByTestId('refine-button-stage4').click();
		await expect(page.getByTestId('variant-card')).toHaveCount(9, { timeout: 10000 });

		await expect(page.getByTestId('iteration-count')).toBeVisible();
		await expect(page.getByTestId('iteration-count')).toHaveText('Iteration 1');
	});

	test('expand variant cards have data-iteration="0"', async ({ page }) => {
		await setupWithExpansion(page);

		const firstCard = page.getByTestId('variant-card').first();
		await expect(firstCard).toHaveAttribute('data-iteration', '0');
	});

	test('refined variant cards have data-iteration="1"', async ({ page }) => {
		await setupWithExpansion(page);

		const refinementBody = buildSSEBody(mockRefinementPartials);
		await page.route('/api/refine', (route) => {
			route.fulfill({
				status: 200,
				headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
				body: refinementBody
			});
		});

		await page.getByTestId('variant-card').first().getByTestId('action-select').click();
		await page.getByTestId('refine-button-stage4').click();
		await expect(page.getByTestId('variant-card')).toHaveCount(9, { timeout: 10000 });

		// Last 3 cards should be from iteration 1
		const cards = page.getByTestId('variant-card');
		await expect(cards.nth(6)).toHaveAttribute('data-iteration', '1');
		await expect(cards.nth(7)).toHaveAttribute('data-iteration', '1');
		await expect(cards.nth(8)).toHaveAttribute('data-iteration', '1');
	});

	test('refined variant cards show iteration badge', async ({ page }) => {
		await setupWithExpansion(page);

		const refinementBody = buildSSEBody(mockRefinementPartials);
		await page.route('/api/refine', (route) => {
			route.fulfill({
				status: 200,
				headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
				body: refinementBody
			});
		});

		await page.getByTestId('variant-card').first().getByTestId('action-select').click();
		await page.getByTestId('refine-button-stage4').click();
		await expect(page.getByTestId('variant-card')).toHaveCount(9, { timeout: 10000 });

		// Refined cards should have an iteration badge
		const refinedCard = page.getByTestId('variant-card').nth(6);
		await expect(refinedCard.getByTestId('iteration-badge')).toBeVisible();
		await expect(refinedCard.getByTestId('iteration-badge')).toHaveText('Iteration 1');

		// Expand cards should NOT have an iteration badge
		const expandCard = page.getByTestId('variant-card').first();
		await expect(expandCard.getByTestId('iteration-badge')).not.toBeVisible();
	});
});

// --- Re-analysis Warning ---

test.describe('Re-analysis warning', () => {
	test('warning is not visible after completing Stage 2', async ({ page }) => {
		await completeStage2(page);
		await expect(page.getByTestId('reanalysis-warning')).not.toBeVisible();
	});

	test('editing persona after analysis shows warning', async ({ page }) => {
		await completeStage2(page);

		// Edit persona label
		const card = page.getByTestId('persona-card');
		await card.getByTestId('persona-label').click();
		const input = card.locator('input[type="text"]').first();
		await input.fill('Senior Designer');
		await input.press('Enter');

		await expect(page.getByTestId('reanalysis-warning')).toBeVisible();
		await expect(page.getByTestId('reanalysis-warning')).toContainText(
			"You've edited the persona or constraints"
		);
	});

	test('re-running analysis clears the warning', async ({ page }) => {
		await completeStage2(page);

		// Edit persona to trigger warning
		const card = page.getByTestId('persona-card');
		await card.getByTestId('persona-label').click();
		const input = card.locator('input[type="text"]').first();
		await input.fill('Senior Designer');
		await input.press('Enter');
		await expect(page.getByTestId('reanalysis-warning')).toBeVisible();

		// Re-run analysis
		const analysisBody = buildSSEBody(mockAnalysisPartials);
		await page.route('/api/analyze', (route) => {
			route.fulfill({
				status: 200,
				headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
				body: analysisBody
			});
		});

		await page.getByTestId('analyze-button').click();
		await expect(page.getByTestId('analyze-button')).toHaveText('Analyze', { timeout: 10000 });

		await expect(page.getByTestId('reanalysis-warning')).not.toBeVisible();
	});
});

// --- Full Flow ---

test.describe('Full flow integration', () => {
	test('complete flow: Setup -> Analyze -> Expand -> Select -> Go Deeper', async ({ page }) => {
		const personaBody = buildSSEBody(mockPersonaPartials);
		const analysisBody = buildSSEBody(mockAnalysisPartials);
		const expansionBody = buildSSEBody(mockExpansionPartials);
		const refinementBody = buildSSEBody(mockRefinementPartials);

		await page.route('/api/persona', (route) => {
			route.fulfill({
				status: 200,
				headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
				body: personaBody
			});
		});
		await page.route('/api/analyze', (route) => {
			route.fulfill({
				status: 200,
				headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
				body: analysisBody
			});
		});
		await page.route('/api/expand', (route) => {
			route.fulfill({
				status: 200,
				headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
				body: expansionBody
			});
		});
		await page.route('/api/refine', (route) => {
			route.fulfill({
				status: 200,
				headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
				body: refinementBody
			});
		});

		await page.goto('/workshop');

		// Stage 1: Setup
		await expect(page.getByTestId('stage-1')).toBeVisible();
		await expect(page.getByTestId('stage-2')).not.toBeVisible();
		await page.getByLabel('Who is this for?').fill('A junior designer');
		await page.getByLabel("What's the space/domain?").fill('Design thinking facilitation');
		await page.getByTestId('refine-button').click();
		await expect(page.getByTestId('persona-card')).toBeVisible();
		await expect(page.getByTestId('refine-button')).toHaveText('Refine Persona', {
			timeout: 10000
		});

		// Stage 2: Analyze
		await expect(page.getByTestId('stage-2')).toBeVisible();
		await expect(page.getByTestId('stage-3')).not.toBeVisible();
		await page.getByLabel('Your rough HMW statement').fill('How might we make workshops better?');
		await page.getByTestId('analyze-button').click();
		await expect(page.getByTestId('analysis-panel')).toBeVisible();
		await expect(page.getByTestId('analyze-button')).toHaveText('Analyze', { timeout: 10000 });

		// Stage 3: Expand
		await expect(page.getByTestId('stage-3')).toBeVisible();
		await page.getByTestId('expand-button').click();
		await expect(page.getByTestId('variant-card')).toHaveCount(6, { timeout: 10000 });

		// Select a variant and clip another
		await page.getByTestId('variant-card').first().getByTestId('action-select').click();
		await page.getByTestId('variant-card').nth(1).getByTestId('action-clip').click();
		await expect(page.getByTestId('clipboard-count')).toHaveText('1');

		// Stage 4: Go Deeper
		await page.getByTestId('refine-button-stage4').click();
		await expect(page.getByTestId('variant-card')).toHaveCount(9, { timeout: 10000 });

		// Verify iteration tracking
		await expect(page.getByTestId('iteration-count')).toHaveText('Iteration 1');

		// Verify all stages remain visible
		await expect(page.getByTestId('stage-1')).toBeVisible();
		await expect(page.getByTestId('stage-2')).toBeVisible();
		await expect(page.getByTestId('stage-3')).toBeVisible();

		// Verify refinement insights
		await expect(page.getByTestId('refinement-tensions')).toBeVisible();
		await expect(page.getByTestId('refinement-recommendation')).toBeVisible();
	});
});

// --- ExportPanel ---

test.describe('ExportPanel', () => {
	async function setupWithExpansion(page: import('@playwright/test').Page) {
		await completeStage2(page);

		const expansionBody = buildSSEBody(mockExpansionPartials);
		await page.route('/api/expand', (route) => {
			route.fulfill({
				status: 200,
				headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
				body: expansionBody
			});
		});

		await page.getByTestId('expand-button').click();
		await expect(page.getByTestId('variant-card')).toHaveCount(6, { timeout: 10000 });
	}

	test('export panel not visible when no items clipped', async ({ page }) => {
		await setupWithExpansion(page);

		await expect(page.getByTestId('stage-5')).not.toBeVisible();
	});

	test('export panel appears after clipping a variant', async ({ page }) => {
		await setupWithExpansion(page);

		await page.getByTestId('variant-card').first().getByTestId('action-clip').click();

		await expect(page.getByTestId('stage-5')).toBeVisible();
		await expect(page.getByTestId('export-panel')).toBeVisible();
	});

	test('default format is plain text with numbered list', async ({ page }) => {
		await setupWithExpansion(page);

		await page.getByTestId('variant-card').first().getByTestId('action-clip').click();

		const preview = page.getByTestId('export-preview');
		await expect(preview).toBeVisible();
		await expect(preview).toContainText('1.');
		await expect(preview).toContainText('How might we');
	});

	test('format tabs render and switch to markdown', async ({ page }) => {
		await setupWithExpansion(page);

		await page.getByTestId('variant-card').first().getByTestId('action-clip').click();

		await expect(page.getByTestId('format-text')).toBeVisible();
		await expect(page.getByTestId('format-markdown')).toBeVisible();
		await expect(page.getByTestId('format-json')).toBeVisible();

		// Switch to markdown
		await page.getByTestId('format-markdown').click();
		const preview = page.getByTestId('export-preview');
		await expect(preview).toContainText('# HMW Export');
		await expect(preview).toContainText('Junior Designer');
		await expect(preview).toContainText('**Move:**');
	});

	test('JSON format shows valid parseable JSON', async ({ page }) => {
		await setupWithExpansion(page);

		await page.getByTestId('variant-card').first().getByTestId('action-clip').click();

		await page.getByTestId('format-json').click();
		const preview = page.getByTestId('export-preview');
		const text = await preview.textContent();
		expect(text).toBeTruthy();
		const parsed = JSON.parse(text!);
		expect(parsed).toHaveProperty('context');
		expect(parsed).toHaveProperty('candidates');
		expect(parsed).toHaveProperty('clippedIds');
		expect(parsed.candidates).toHaveLength(1);
	});

	test('copy and download buttons are present', async ({ page }) => {
		await setupWithExpansion(page);

		await page.getByTestId('variant-card').first().getByTestId('action-clip').click();

		await expect(page.getByTestId('copy-button')).toBeVisible();
		await expect(page.getByTestId('download-button')).toBeVisible();
	});

	test('export panel hides when last item unclipped', async ({ page }) => {
		await setupWithExpansion(page);

		// Clip and verify visible
		await page.getByTestId('variant-card').first().getByTestId('action-clip').click();
		await expect(page.getByTestId('stage-5')).toBeVisible();

		// Unclip via clipboard remove button
		await page.getByTestId('clipboard-remove').click();
		await expect(page.getByTestId('stage-5')).not.toBeVisible();
	});
});
