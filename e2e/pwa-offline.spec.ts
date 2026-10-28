import { expect, test } from '@playwright/test';
import type pg from 'pg';
import { createDevClient, restoreSnapshot, takeSnapshot } from '../test-support/devSnapshot';

let client: pg.Client;
let snapshot: Awaited<ReturnType<typeof takeSnapshot>>;

test.beforeAll(async () => {
  client = createDevClient();
  await client.connect();
  snapshot = await takeSnapshot(client);
});

test.afterAll(async () => {
  await restoreSnapshot(client, snapshot);
  await client.end();
});

test.beforeEach(async () => {
  await client.query('delete from public.tasks');
  await client.query(`insert into public.tasks (title, completed, position) values ('משימה שמורה', false, 0)`);
});

const OFFLINE_NOTICE = /אין חיבור לאינטרנט/;

test.describe('PWA manifest and icons (ADR-10)', () => {
  test('the manifest is valid for installing on Chrome Android', async ({ request }) => {
    const response = await request.get('/manifest.webmanifest');
    expect(response.status()).toBe(200);
    const manifest = await response.json();
    expect(manifest).toMatchObject({
      name: 'רשימת משימות משותפת',
      short_name: 'משימות',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      lang: 'he',
      dir: 'rtl',
    });
    const sizes = manifest.icons.map((icon: { sizes: string; purpose?: string }) => `${icon.sizes}:${icon.purpose ?? 'any'}`);
    expect(sizes).toEqual(expect.arrayContaining(['192x192:any', '512x512:any', '512x512:maskable']));
  });

  test('every manifest icon is served as a PNG', async ({ request }) => {
    const manifest = await (await request.get('/manifest.webmanifest')).json();
    for (const icon of manifest.icons as { src: string }[]) {
      const response = await request.get(icon.src);
      expect(response.status(), icon.src).toBe(200);
      expect(response.headers()['content-type'], icon.src).toContain('image/png');
    }
  });

  test('the page links the manifest and registers no service worker', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest');
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#2F80ED');
    await expect(page.getByText('משימה שמורה')).toBeVisible();
    const registrations = await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length);
    expect(registrations).toBe(0);
  });
});

test.describe('offline', () => {
  test('shows a notice and blocks data changes while offline', async ({ page, context }) => {
    await page.goto('/');
    await expect(page.getByText('משימה שמורה')).toBeVisible();
    await expect(page.getByText(OFFLINE_NOTICE)).toHaveCount(0);

    await context.setOffline(true);
    await expect(page.getByText(OFFLINE_NOTICE)).toBeVisible();

    // A status change fails and returns to the saved value.
    const checkbox = page.getByRole('checkbox', { name: 'סימון השלמה: משימה שמורה' });
    await checkbox.click();
    await expect(page.locator('.list-alert')).toContainText('לא ניתן להתחבר לשרת');
    await expect(checkbox).not.toBeChecked();

    // Creating fails and keeps the typed values in the form.
    await page.getByRole('button', { name: 'הוסף משימה' }).click();
    const dialog = page.getByRole('dialog', { name: 'הוספת משימה' });
    await dialog.getByLabel('כותרת').fill('נכתבה בלי חיבור');
    await dialog.getByRole('button', { name: 'הוסף משימה' }).click();
    await expect(dialog.getByRole('alert')).toContainText('לא ניתן להתחבר לשרת');
    await expect(dialog.getByLabel('כותרת')).toHaveValue('נכתבה בלי חיבור');
    await dialog.getByRole('button', { name: 'סגור' }).click();

    // The notice is shown on the about page too.
    await page.getByRole('link', { name: 'אודות' }).click();
    await expect(page.getByText(OFFLINE_NOTICE)).toBeVisible();

    // Nothing is cached: reloading offline does not show a saved list.
    await expect(page.reload()).rejects.toThrow();

    const { rows } = await client.query('select title, completed from public.tasks');
    expect(rows).toEqual([{ title: 'משימה שמורה', completed: false }]);

    await context.setOffline(false);
    await page.goto('/');
    await expect(page.getByText(OFFLINE_NOTICE)).toHaveCount(0);
    await expect(page.getByText('משימה שמורה')).toBeVisible();
  });
});
