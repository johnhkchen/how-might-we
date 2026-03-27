import { test, expect } from '@playwright/test';
import { mockPersonaPartials, mockPersonaFinal } from './fixtures/persona';

function buildSSEBody(partials: unknown[]): string {
	return partials.map((p) => `data: ${JSON.stringify(p)}\n\n`).join('') + 'data: [DONE]\n\n';
}

test.describe('Session persistence — recovery banner', () => {
	test('no recovery banner on fresh visit', async ({ page }) => {
		await page.goto('/workshop');
		const banner = page.locator('[data-testid="recovery-banner"]');
		await expect(banner).not.toBeVisible();
	});

	test('recovery banner appears when saved session exists', async ({ page }) => {
		// Inject a saved session into localStorage before visiting
		await page.goto('/workshop');
		await page.evaluate(() => {
			const session = {
				version: 1,
				savedAt: Date.now(),
				store: {
					persona: {
						label: 'Test Persona',
						role: 'Tester',
						goals: ['Test things'],
						frustrations: ['Bugs'],
						context: 'Testing context',
						influencers: ['QA lead']
					},
					problemContext: null,
					analysis: null,
					candidates: [],
					iterationCount: 0
				},
				page: {
					personaDescription: 'A tester who tests',
					domain: 'Testing',
					constraints: [],
					hmwStatement: '',
					emergentTheme: null
				}
			};
			localStorage.setItem('hmw-session', JSON.stringify(session));
		});

		// Reload to trigger recovery
		await page.reload();

		const banner = page.locator('[data-testid="recovery-banner"]');
		await expect(banner).toBeVisible();
		await expect(banner).toContainText('saved session');
	});

	test('expired session (>24h) does not show recovery banner', async ({ page }) => {
		await page.goto('/workshop');
		await page.evaluate(() => {
			const session = {
				version: 1,
				savedAt: Date.now() - 25 * 60 * 60 * 1000, // 25 hours ago
				store: {
					persona: {
						label: 'Old Persona',
						role: 'Tester',
						goals: [],
						frustrations: [],
						context: '',
						influencers: []
					},
					problemContext: null,
					analysis: null,
					candidates: [],
					iterationCount: 0
				},
				page: {
					personaDescription: 'old',
					domain: 'old',
					constraints: [],
					hmwStatement: '',
					emergentTheme: null
				}
			};
			localStorage.setItem('hmw-session', JSON.stringify(session));
		});

		await page.reload();

		const banner = page.locator('[data-testid="recovery-banner"]');
		await expect(banner).not.toBeVisible();

		// localStorage should be cleaned up
		const hasKey = await page.evaluate(() => localStorage.getItem('hmw-session'));
		expect(hasKey).toBeNull();
	});
});

test.describe('Session persistence — resume', () => {
	test('resume restores persona and shows PersonaCard', async ({ page }) => {
		await page.goto('/workshop');
		await page.evaluate(() => {
			const session = {
				version: 1,
				savedAt: Date.now(),
				store: {
					persona: {
						label: 'Restored Persona',
						role: 'Product Designer',
						goals: ['Run effective workshops'],
						frustrations: ['Workshops feel unfocused'],
						context: 'Works at a SaaS company',
						influencers: ['PM']
					},
					problemContext: {
						domain: 'Design thinking',
						persona: {
							label: 'Restored Persona',
							role: 'Product Designer',
							goals: ['Run effective workshops'],
							frustrations: ['Workshops feel unfocused'],
							context: 'Works at a SaaS company',
							influencers: ['PM']
						},
						constraints: []
					},
					analysis: null,
					candidates: [],
					iterationCount: 0
				},
				page: {
					personaDescription: 'A junior designer',
					domain: 'Design thinking',
					constraints: [],
					hmwStatement: '',
					emergentTheme: null
				}
			};
			localStorage.setItem('hmw-session', JSON.stringify(session));
		});

		await page.reload();

		// Click Resume
		await page.click('[data-testid="recovery-resume"]');

		// Banner should disappear
		await expect(page.locator('[data-testid="recovery-banner"]')).not.toBeVisible();

		// PersonaCard should be visible with the restored label
		await expect(page.getByText('Restored Persona')).toBeVisible();

		// Input fields should be restored
		const personaInput = page.locator('#persona-input');
		await expect(personaInput).toHaveValue('A junior designer');

		const domainInput = page.locator('#domain-input');
		await expect(domainInput).toHaveValue('Design thinking');
	});

	test('resume restores full state through expand stage', async ({ page }) => {
		await page.goto('/workshop');
		await page.evaluate(() => {
			const session = {
				version: 1,
				savedAt: Date.now(),
				store: {
					persona: {
						label: 'Full Persona',
						role: 'Designer',
						goals: ['Goal'],
						frustrations: ['Frustration'],
						context: 'Context',
						influencers: ['Influencer']
					},
					problemContext: {
						domain: 'Test domain',
						persona: {
							label: 'Full Persona',
							role: 'Designer',
							goals: ['Goal'],
							frustrations: ['Frustration'],
							context: 'Context',
							influencers: ['Influencer']
						},
						constraints: []
					},
					analysis: {
						originalStatement: 'How might we test?',
						implicitUser: 'Tester',
						embeddedAssumptions: ['Testing is important'],
						scopeLevel: 'well_scoped',
						underlyingTension: 'Testing vs shipping',
						initialReframing: 'How might we ship with confidence?'
					},
					candidates: [
						{
							id: 'test-1',
							variant: {
								statement: 'How might we test better?',
								moveType: 'narrowed',
								rationale: 'Focus on quality'
							},
							status: 'generated',
							iteration: 0
						},
						{
							id: 'test-2',
							variant: {
								statement: 'How might we ship faster?',
								moveType: 'broadened',
								rationale: 'Focus on speed'
							},
							status: 'clipped',
							iteration: 0
						}
					],
					iterationCount: 1
				},
				page: {
					personaDescription: 'A tester',
					domain: 'Testing',
					constraints: [],
					hmwStatement: 'How might we test?',
					emergentTheme: 'Quality vs speed'
				}
			};
			localStorage.setItem('hmw-session', JSON.stringify(session));
		});

		await page.reload();
		await page.click('[data-testid="recovery-resume"]');

		// Stage 2 should be visible (analysis exists)
		await expect(page.getByTestId('stage-2')).toBeVisible();

		// Stage 3 should be visible (candidates exist)
		await expect(page.getByTestId('stage-3')).toBeVisible();

		// Clipped candidate should appear in clipboard
		await expect(page.getByTestId('clipboard-statement')).toContainText('How might we ship faster?');

		// Iteration count should be restored
		await expect(page.getByTestId('iteration-count')).toContainText('1');
	});
});

test.describe('Session persistence — start fresh', () => {
	test('start fresh clears saved session', async ({ page }) => {
		await page.goto('/workshop');
		await page.evaluate(() => {
			const session = {
				version: 1,
				savedAt: Date.now(),
				store: {
					persona: {
						label: 'To Be Cleared',
						role: 'Tester',
						goals: [],
						frustrations: [],
						context: '',
						influencers: []
					},
					problemContext: null,
					analysis: null,
					candidates: [],
					iterationCount: 0
				},
				page: {
					personaDescription: 'Old description',
					domain: 'Old domain',
					constraints: [],
					hmwStatement: '',
					emergentTheme: null
				}
			};
			localStorage.setItem('hmw-session', JSON.stringify(session));
		});

		await page.reload();
		await page.click('[data-testid="recovery-start-fresh"]');

		// Banner should disappear
		await expect(page.locator('[data-testid="recovery-banner"]')).not.toBeVisible();

		// PersonaCard should NOT be visible
		await expect(page.getByText('To Be Cleared')).not.toBeVisible();

		// Inputs should be empty
		await expect(page.locator('#persona-input')).toHaveValue('');
		await expect(page.locator('#domain-input')).toHaveValue('');

		// localStorage should be cleared
		const hasKey = await page.evaluate(() => localStorage.getItem('hmw-session'));
		expect(hasKey).toBeNull();
	});
});

test.describe('Session persistence — auto-save', () => {
	test('typing in persona field auto-saves to localStorage', async ({ page }) => {
		await page.goto('/workshop');

		// Wait for persistence to be ready (no saved session = immediately ready)
		await page.waitForTimeout(200);

		await page.fill('#persona-input', 'Auto-save test persona');
		await page.fill('#domain-input', 'Auto-save domain');

		// Wait for debounce (500ms) + buffer
		await page.waitForTimeout(800);

		const saved = await page.evaluate(() => {
			const raw = localStorage.getItem('hmw-session');
			return raw ? JSON.parse(raw) : null;
		});

		expect(saved).not.toBeNull();
		expect(saved.version).toBe(1);
		expect(saved.page.personaDescription).toBe('Auto-save test persona');
		expect(saved.page.domain).toBe('Auto-save domain');
	});

	test('completing persona streaming saves full state', async ({ page }) => {
		const body = buildSSEBody(mockPersonaPartials);
		await page.route('/api/persona', (route) => {
			route.fulfill({
				status: 200,
				headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
				body
			});
		});

		await page.goto('/workshop');
		await page.fill('#persona-input', 'A junior designer');
		await page.fill('#domain-input', 'Design thinking');
		await page.click('[data-testid="refine-button"]');

		// Wait for streaming + debounce
		await page.waitForTimeout(2000);

		const saved = await page.evaluate(() => {
			const raw = localStorage.getItem('hmw-session');
			return raw ? JSON.parse(raw) : null;
		});

		expect(saved).not.toBeNull();
		expect(saved.store.persona).not.toBeNull();
		expect(saved.store.persona.label).toBe(mockPersonaFinal.label);
	});
});

test.describe('Session persistence — corrupt data', () => {
	test('corrupt localStorage data does not crash the page', async ({ page }) => {
		await page.goto('/workshop');
		await page.evaluate(() => {
			localStorage.setItem('hmw-session', 'not valid json{{{');
		});

		await page.reload();

		// Page should load normally without recovery banner
		await expect(page.locator('[data-testid="recovery-banner"]')).not.toBeVisible();
		await expect(page.getByTestId('stage-1')).toBeVisible();

		// Corrupt data should be cleaned up
		const hasKey = await page.evaluate(() => localStorage.getItem('hmw-session'));
		expect(hasKey).toBeNull();
	});

	test('wrong version data is discarded', async ({ page }) => {
		await page.goto('/workshop');
		await page.evaluate(() => {
			localStorage.setItem(
				'hmw-session',
				JSON.stringify({ version: 99, savedAt: Date.now(), store: {}, page: {} })
			);
		});

		await page.reload();

		await expect(page.locator('[data-testid="recovery-banner"]')).not.toBeVisible();
		const hasKey = await page.evaluate(() => localStorage.getItem('hmw-session'));
		expect(hasKey).toBeNull();
	});
});
