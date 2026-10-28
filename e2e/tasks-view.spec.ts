import { expect, test } from '@playwright/test';
import type pg from 'pg';
import { createDevClient, restoreSnapshot, takeSnapshot } from '../test-support/devSnapshot';

let client: pg.Client;
let snapshot: Awaited<ReturnType<typeof takeSnapshot>>;

test.beforeAll(async () => {
  client = createDevClient();
  await client.connect();
  snapshot = await takeSnapshot(client);
  await client.query('delete from public.tasks');
  await client.query(
    `insert into public.tasks (title, description, due_date, completed, position) values
      ('לקנות מצרכים', 'חלב ולחם', '2030-01-15', false, 0),
      (null, E'לבדוק אפשרויות ביטוח לרכב אצל כמה חברות ולהשוות מחירים וכיסויים נוספים לפני סוף החודש\\nשורה שנייה', null, false, 1),
      ('לסיים דוח שנתי', null, null, true, 2)`,
  );
});

test.afterAll(async () => {
  await restoreSnapshot(client, snapshot);
  await client.end();
});

test('shows the list, no initial selection, and details of a selected task', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('בחר משימה מהרשימה כדי לצפות בפרטיה')).toBeVisible();

  const rows = page.locator('.task-row');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText('לקנות מצרכים');
  // No title: the first description line is shown, without the second line.
  await expect(rows.nth(1)).toContainText('לבדוק אפשרויות ביטוח לרכב');
  await expect(rows.nth(1)).not.toContainText('שורה שנייה');
  // Completed task: checked box and struck-through text.
  await expect(rows.nth(2).getByRole('checkbox')).toBeChecked();
  await expect(rows.nth(2).locator('.task-row__label')).toHaveCSS('text-decoration-line', 'line-through');

  await page.getByRole('button', { name: 'לקנות מצרכים' }).click();
  await expect(page.getByLabel('כותרת')).toHaveValue('לקנות מצרכים');
  await expect(page.getByLabel('תיאור')).toHaveValue('חלב ולחם');
  await expect(page.getByLabel('תאריך יעד')).toHaveValue('2030-01-15');
  await expect(page.getByText('בחר משימה מהרשימה כדי לצפות בפרטיה')).toHaveCount(0);
  // No write actions yet.
  await expect(page.getByRole('button', { name: /שמור|מחק|הוסף/ })).toHaveCount(0);
});

test('a refresh shows database changes, and nothing is kept in local storage', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.task-row')).toHaveCount(3);

  await client.query(`insert into public.tasks (title, position) values ('משימה שנוספה במסד', 3)`);
  await page.reload();
  await expect(page.locator('.task-row')).toHaveCount(4);
  await expect(page.getByText('משימה שנוספה במסד')).toBeVisible();

  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  await client.query(`delete from public.tasks where title = 'משימה שנוספה במסד'`);
});

test('a server error is shown as an error, not as an empty list', async ({ page }) => {
  await page.route('**/api/tasks', (route) => route.fulfill({ status: 500, body: '{}' }));
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('לא ניתן לטעון את המשימות');
  await expect(page.getByText('אין עדיין משימות ברשימה')).toHaveCount(0);
});

test('an empty response shows the empty state', async ({ page }) => {
  await page.route('**/api/tasks', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.goto('/');
  await expect(page.getByText('אין עדיין משימות ברשימה')).toBeVisible();
});

test('layout: list beside details on desktop (list on the right), stacked on mobile', async ({ page, isMobile }) => {
  await page.goto('/');
  await expect(page.locator('.task-row')).toHaveCount(3);
  const list = (await page.locator('.task-list').boundingBox())!;
  const details = (await page.locator('.task-details').boundingBox())!;
  if (isMobile) {
    expect(details.y).toBeGreaterThanOrEqual(list.y + list.height);
  } else {
    expect(list.x).toBeGreaterThan(details.x);
    expect(Math.abs(list.y - details.y)).toBeLessThan(2);
  }
});
