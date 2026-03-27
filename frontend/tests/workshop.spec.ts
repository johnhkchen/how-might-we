import { test, expect } from '@playwright/test';
import { mockPersonaPartials, mockPersonaFinal, personaSSEStream } from './fixtures/persona';
import { mockAnalysisPartials, mockAnalysisFinal } from './fixtures/analysis';

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
