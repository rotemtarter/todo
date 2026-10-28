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
  await client.query(
    `insert into public.tasks (title, description, due_date, completed, position) values
      ('ראשונה', 'תיאור ראשון', '2030-01-15', false, 0),
      ('תאריך שעבר', null, '2020-03-01', true, 1),
      ('שלישית', null, null, false, 2)`,
  );
});

async function rowByTitle(title: string) {
  const { rows } = await client.query('select * from public.tasks where title = $1', [title]);
  return rows[0];
}

async function selectTask(page: Page, title: string) {
  await page.goto('/');
  await expect(page.locator('.task-row')).toHaveCount(3);
  await page.getByRole('button', { name: title, exact: true }).click();
  return page.locator('.task-details');
}

test('edits all fields, saves, and the values survive a refresh', async ({ page }) => {
  const details = await selectTask(page, 'ראשונה');
  await details.getByLabel('כותרת').fill('ראשונה מעודכנת');
  await details.getByLabel('תיאור').fill('תיאור חדש');
  await details.getByLabel('תאריך יעד').fill('2031-02-20');
  await details.getByRole('button', { name: 'שמור שינויים', exact: true }).click();

  await expect(details.getByRole('status')).toHaveText('השינויים נשמרו');
  await expect(page.locator('.task-row').nth(0)).toContainText('ראשונה מעודכנת');
  expect(await rowByTitle('ראשונה מעודכנת')).toMatchObject({ description: 'תיאור חדש', due_date: '2031-02-20', position: 0 });

  await page.reload();
  await page.getByRole('button', { name: 'ראשונה מעודכנת', exact: true }).click();
  await expect(details.getByLabel('תיאור')).toHaveValue('תיאור חדש');
  await expect(details.getByLabel('תאריך יעד')).toHaveValue('2031-02-20');
});

test('a task with a past due date can be saved unchanged, but not moved to another past date', async ({ page }) => {
  const details = await selectTask(page, 'תאריך שעבר');
  await details.getByLabel('תיאור').fill('נוסף תיאור');
  await details.getByRole('button', { name: 'שמור שינויים', exact: true }).click();
  await expect(details.getByRole('status')).toHaveText('השינויים נשמרו');
  expect(await rowByTitle('תאריך שעבר')).toMatchObject({ description: 'נוסף תיאור', due_date: '2020-03-01', completed: true });

  await details.getByLabel('תאריך יעד').fill('2020-03-02');
  await details.getByRole('button', { name: 'שמור שינויים', exact: true }).click();
  await expect(details.getByText('תאריך היעד לא יכול להיות בעבר')).toBeVisible();
  expect((await rowByTitle('תאריך שעבר')).due_date).toBe('2020-03-01');
});

test('unsaved changes are discarded on task switch, navigation and refresh', async ({ page }) => {
  const details = await selectTask(page, 'ראשונה');
  await details.getByLabel('כותרת').fill('טיוטה 1');
  await page.getByRole('button', { name: 'שלישית', exact: true }).click();
  await page.getByRole('button', { name: 'ראשונה', exact: true }).click();
  await expect(details.getByLabel('כותרת')).toHaveValue('ראשונה');

  await details.getByLabel('כותרת').fill('טיוטה 2');
  await page.getByRole('link', { name: 'אודות' }).click();
  await page.getByRole('link', { name: 'דף הבית' }).click();
  await page.getByRole('button', { name: 'ראשונה', exact: true }).click();
  await expect(details.getByLabel('כותרת')).toHaveValue('ראשונה');

  await details.getByLabel('כותרת').fill('טיוטה 3');
  await page.reload();
  await page.getByRole('button', { name: 'ראשונה', exact: true }).click();
  await expect(details.getByLabel('כותרת')).toHaveValue('ראשונה');
  expect(await rowByTitle('ראשונה')).toBeDefined();
});

test('a server error keeps the draft, and a retry succeeds', async ({ page }) => {
  const details = await selectTask(page, 'שלישית');
  await page.route('**/api/tasks/*', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE', message: 'לא ניתן לשמור את השינויים כרגע. נסה שוב.' } }),
    }),
  );
  await details.getByLabel('תיאור').fill('טיוטה ששורדת');
  await details.getByRole('button', { name: 'שמור שינויים', exact: true }).click();
  await expect(details.getByRole('alert')).toContainText('לא ניתן לשמור את השינויים');
  await expect(details.getByLabel('תיאור')).toHaveValue('טיוטה ששורדת');

  await page.unroute('**/api/tasks/*');
  await details.getByRole('button', { name: 'שמור שינויים', exact: true }).click();
  await expect(details.getByRole('status')).toHaveText('השינויים נשמרו');
  expect((await rowByTitle('שלישית')).description).toBe('טיוטה ששורדת');
});

test('saving a task deleted by another visitor shows a not-found message', async ({ page }) => {
  const details = await selectTask(page, 'שלישית');
  await client.query(`delete from public.tasks where title = 'שלישית'`);
  await details.getByLabel('כותרת').fill('שלישית שונתה');
  await details.getByRole('button', { name: 'שמור שינויים', exact: true }).click();
  await expect(details.getByRole('alert')).toContainText('המשימה לא נמצאה');
  await expect(details.getByLabel('כותרת')).toHaveValue('שלישית שונתה');
});

test('delete: cancel keeps the task, confirm removes it after the server succeeds', async ({ page }) => {
  const details = await selectTask(page, 'ראשונה');
  await details.getByRole('button', { name: 'מחק משימה', exact: true }).click();
  const dialog = page.getByRole('alertdialog', { name: 'מחיקת משימה' });
  await expect(dialog).toContainText('האם אתה בטוח שברצונך למחוק את המשימה הזו?');
  await dialog.getByRole('button', { name: 'ביטול', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('.task-row')).toHaveCount(3);
  expect(await rowByTitle('ראשונה')).toBeDefined();

  await details.getByRole('button', { name: 'מחק משימה', exact: true }).click();
  await dialog.getByRole('button', { name: 'אישור', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('.task-row')).toHaveCount(2);
  await expect(page.getByText('בחר משימה מהרשימה כדי לצפות בפרטיה')).toBeVisible();
  expect(await rowByTitle('ראשונה')).toBeUndefined();
  const { rows } = await client.query('select position from public.tasks order by position');
  expect(rows.map((row) => row.position)).toEqual([0, 1]);

  await page.reload();
  await expect(page.locator('.task-row')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'ראשונה', exact: true })).toHaveCount(0);
});

test('a failed delete keeps the task in the list and in the database', async ({ page }) => {
  const details = await selectTask(page, 'שלישית');
  await page.route('**/api/tasks/*', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
  await details.getByRole('button', { name: 'מחק משימה', exact: true }).click();
  const dialog = page.getByRole('alertdialog');
  await dialog.getByRole('button', { name: 'אישור', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('לא ניתן למחוק את המשימה');
  await dialog.getByRole('button', { name: 'ביטול', exact: true }).click();
  await expect(page.locator('.task-row')).toHaveCount(3);
  await expect(details.getByLabel('כותרת')).toHaveValue('שלישית');
  expect(await rowByTitle('שלישית')).toBeDefined();
});

test('concurrent PATCH requests: the last write wins as a whole, status and position untouched', async ({ request }) => {
  const { id } = await rowByTitle('תאריך שעבר');
  const a = { title: 'גרסה א', description: 'א', dueDate: '2030-01-01' };
  const b = { title: 'גרסה ב', description: null, dueDate: null };
  const responses = await Promise.all([
    request.patch(`/api/tasks/${id}`, { data: a }),
    request.patch(`/api/tasks/${id}`, { data: b }),
  ]);
  expect(responses.map((response) => response.status())).toEqual([200, 200]);
  const { rows } = await client.query('select * from public.tasks where id = $1', [id]);
  expect([a, b]).toContainEqual({ title: rows[0].title, description: rows[0].description, dueDate: rows[0].due_date });
  expect(rows[0]).toMatchObject({ completed: true, position: 1 });
});

test('the API rejects invalid ids and deleting twice', async ({ request }) => {
  expect((await request.delete('/api/tasks/not-a-uuid')).status()).toBe(400);
  const { id } = await rowByTitle('שלישית');
  expect((await request.delete(`/api/tasks/${id}`)).status()).toBe(204);
  expect((await request.delete(`/api/tasks/${id}`)).status()).toBe(404);
});
