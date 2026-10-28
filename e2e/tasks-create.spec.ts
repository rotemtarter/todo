import { expect, test, type Page } from '@playwright/test';
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
  await client.query(`insert into public.tasks (title, position) values ('משימה קיימת', 0)`);
});

async function localToday(page: Page): Promise<string> {
  return page.evaluate(() => {
    const now = new Date();
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  });
}

async function openModal(page: Page) {
  await page.goto('/');
  await expect(page.locator('.task-row')).toHaveCount(1);
  await page.getByRole('button', { name: 'הוסף משימה', exact: true }).click();
  return page.getByRole('dialog', { name: 'הוספת משימה' });
}

async function rowsInDb(title: string) {
  const { rows } = await client.query('select * from public.tasks where title = $1 or description = $1', [title]);
  return rows;
}

test('creates a task with a title only: saved once, last in the list, selected, and kept after refresh', async ({ page }) => {
  const dialog = await openModal(page);
  await expect(dialog.getByLabel('כותרת')).toHaveValue('');
  await expect(dialog.getByLabel('תיאור')).toHaveValue('');
  await expect(dialog.getByLabel('תאריך יעד')).toHaveValue(await localToday(page));

  await dialog.getByLabel('כותרת').fill('משימה חדשה מהטופס');
  await dialog.getByRole('button', { name: 'הוסף משימה', exact: true }).click();

  await expect(dialog).toBeHidden();
  const rows = page.locator('.task-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(1)).toContainText('משימה חדשה מהטופס');
  await expect(rows.nth(1)).toHaveClass(/task-row--selected/);
  await expect(page.locator('.task-details').getByLabel('כותרת')).toHaveValue('משימה חדשה מהטופס');

  const saved = await rowsInDb('משימה חדשה מהטופס');
  expect(saved).toHaveLength(1);
  expect(saved[0].completed).toBe(false);
  expect(saved[0].due_date).toBe(await localToday(page));

  await page.reload();
  await expect(page.locator('.task-row').nth(1)).toContainText('משימה חדשה מהטופס');
});

test('creates a task with a description only and no due date', async ({ page }) => {
  const dialog = await openModal(page);
  await dialog.getByLabel('תיאור').fill('תיאור בלבד ללא כותרת');
  await dialog.getByLabel('תאריך יעד').fill('');
  await dialog.getByRole('button', { name: 'הוסף משימה', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('.task-row').nth(1)).toContainText('תיאור בלבד ללא כותרת');
  const saved = await rowsInDb('תיאור בלבד ללא כותרת');
  expect(saved).toHaveLength(1);
  expect(saved[0].title).toBeNull();
  expect(saved[0].due_date).toBeNull();
});

test('creates a task with a title, description and future date; another window sees it', async ({ page, browser }) => {
  const dialog = await openModal(page);
  await dialog.getByLabel('כותרת').fill('משימה מלאה');
  await dialog.getByLabel('תיאור').fill('עם תיאור');
  await dialog.getByLabel('תאריך יעד').fill('2031-03-15');
  await dialog.getByRole('button', { name: 'הוסף משימה', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('.task-details').getByLabel('תאריך יעד')).toHaveValue('2031-03-15');

  const otherContext = await browser.newContext();
  const otherPage = await otherContext.newPage();
  await otherPage.goto('http://localhost:3000/');
  await expect(otherPage.getByText('משימה מלאה')).toBeVisible();
  await otherContext.close();
});

test('invalid input shows messages in the form and saves nothing', async ({ page }) => {
  const dialog = await openModal(page);
  let posts = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST') posts++;
  });

  await dialog.getByLabel('כותרת').fill('    ');
  await dialog.getByRole('button', { name: 'הוסף משימה', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveText('יש להזין כותרת או תיאור למשימה');

  await dialog.getByLabel('כותרת').fill('א'.repeat(101));
  await dialog.getByRole('button', { name: 'הוסף משימה', exact: true }).click();
  await expect(dialog.getByText('הכותרת יכולה להכיל עד 100 תווים')).toBeVisible();

  await dialog.getByLabel('כותרת').fill('תקין');
  await dialog.getByLabel('תאריך יעד').fill('2020-01-01');
  await dialog.getByRole('button', { name: 'הוסף משימה', exact: true }).click();
  await expect(dialog.getByText('תאריך היעד לא יכול להיות בעבר')).toBeVisible();
  await expect(dialog.getByLabel('כותרת')).toHaveValue('תקין');

  expect(posts).toBe(0);
  expect(await rowsInDb('תקין')).toHaveLength(0);
});

test('closing without saving resets the form (close button, X and Escape)', async ({ page }) => {
  let dialog = await openModal(page);
  const today = await localToday(page);
  for (const close of [
    () => dialog.getByRole('button', { name: 'סגור', exact: true }).click(),
    () => dialog.getByRole('button', { name: 'סגירת החלון', exact: true }).click(),
    () => page.keyboard.press('Escape'),
  ]) {
    await dialog.getByLabel('כותרת').fill('טיוטה');
    await dialog.getByLabel('תאריך יעד').fill('');
    await close();
    await expect(dialog).toBeHidden();
    await page.getByRole('button', { name: 'הוסף משימה', exact: true }).click();
    dialog = page.getByRole('dialog', { name: 'הוספת משימה' });
    await expect(dialog.getByLabel('כותרת')).toHaveValue('');
    await expect(dialog.getByLabel('תאריך יעד')).toHaveValue(today);
  }
  expect(await rowsInDb('טיוטה')).toHaveLength(0);
});

test('a server error keeps the modal and values, and a retry succeeds', async ({ page }) => {
  const dialog = await openModal(page);
  await page.route('**/api/tasks', (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE', message: 'לא ניתן לשמור את המשימה כרגע. נסה שוב.' } }),
        })
      : route.fallback(),
  );
  await dialog.getByLabel('כותרת').fill('ניסיון חוזר');
  await dialog.getByLabel('תיאור').fill('נשמר בטופס');
  await dialog.getByRole('button', { name: 'הוסף משימה', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('לא ניתן לשמור את המשימה');
  await expect(dialog.getByLabel('כותרת')).toHaveValue('ניסיון חוזר');
  await expect(dialog.getByLabel('תיאור')).toHaveValue('נשמר בטופס');
  expect(await rowsInDb('ניסיון חוזר')).toHaveLength(0);

  await page.unroute('**/api/tasks');
  await dialog.getByRole('button', { name: 'הוסף משימה', exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(await rowsInDb('ניסיון חוזר')).toHaveLength(1);
});

test('with 1,000 tasks the button is disabled with a notice, and the API answers 409', async ({ page, request }) => {
  await client.query('delete from public.tasks');
  await client.query(`insert into public.tasks (title, position) select 'משימה ' || i, i from generate_series(0, 999) as i`);
  await page.goto('/');
  await expect(page.locator('.task-row')).toHaveCount(1000);
  await expect(page.getByRole('button', { name: 'הוסף משימה', exact: true })).toBeDisabled();
  await expect(page.getByText('הרשימה מלאה (1,000 משימות)')).toBeVisible();

  const response = await request.post('/api/tasks', { data: { title: 'עודפת', description: null, dueDate: null } });
  expect(response.status()).toBe(409);
  expect((await response.json()).error.code).toBe('TASK_LIMIT_REACHED');
  expect(await rowsInDb('עודפת')).toHaveLength(0);
});
