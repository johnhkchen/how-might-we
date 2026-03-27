import { test, expect } from '@playwright/test';

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
});
