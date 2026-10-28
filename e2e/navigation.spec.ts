import { expect, test } from '@playwright/test';

test('navigates between home and about, including a refresh on /about', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'המשימות שלי' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

  await page.getByRole('link', { name: 'אודות' }).click();
  await expect(page).toHaveURL(/\/about$/);
  await expect(page.getByRole('heading', { name: 'אודות' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'אודות' })).toHaveClass(/active/);

  await page.reload();
  await expect(page.getByRole('heading', { name: 'אודות' })).toBeVisible();

  await page.getByRole('link', { name: 'דף הבית' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'המשימות שלי' })).toBeVisible();
});

test('the API route is not swallowed by the SPA fallback', async ({ request }) => {
  const response = await request.get('/api/tasks');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('application/json');
  expect(response.headers()['cache-control']).toContain('no-store');
  expect(Array.isArray(await response.json())).toBe(true);
});
