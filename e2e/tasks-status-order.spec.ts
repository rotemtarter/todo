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
    `insert into public.tasks (title, description, completed, position) values
      ('אחת', null, false, 0),
      ('שתיים', null, true, 1),
      ('שלוש', null, false, 2),
      ('ארבע', null, false, 3)`,
  );
});

async function dbTitles(): Promise<string[]> {
  const { rows } = await client.query('select title from public.tasks order by position, id');
  return rows.map((row) => row.title);
}

async function dbPositions(): Promise<number[]> {
  const { rows } = await client.query('select position from public.tasks order by position, id');
  return rows.map((row) => row.position);
}

async function dbRow(title: string) {
  const { rows } = await client.query('select * from public.tasks where title = $1', [title]);
  return rows[0];
}

const rows = (page: Page) => page.locator('.task-row');
const labels = (page: Page) => page.locator('.task-row__label');
const checkbox = (page: Page, title: string) => page.getByRole('checkbox', { name: `סימון השלמה: ${title}` });
const handle = (page: Page, title: string) =>
  page.getByRole('button', { name: `גרור כדי לשנות את מיקום המשימה: ${title}` });

async function openHome(page: Page) {
  await page.goto('/');
  await expect(rows(page)).toHaveCount(4);
}

async function centerOf(locator: ReturnType<Page['locator']>) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('element not visible');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Drags a task by its handle with the mouse onto the row at `targetIndex`. */
async function mouseDrag(page: Page, title: string, targetIndex: number) {
  const from = await centerOf(handle(page, title));
  const to = await centerOf(rows(page).nth(targetIndex));
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x, from.y + 10, { steps: 3 });
  await page.mouse.move(from.x, to.y, { steps: 15 });
  await page.mouse.up();
}

/** Drags with real touch events (Chrome DevTools Protocol), as a finger on Android would. */
async function touchDrag(page: Page, title: string, targetIndex: number) {
  const from = await centerOf(handle(page, title));
  const to = await centerOf(rows(page).nth(targetIndex));
  const session = await page.context().newCDPSession(page);
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', x: number, y: number) =>
    session.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  await touch('touchStart', from.x, from.y);
  const steps = 15;
  for (let i = 1; i <= steps; i++) {
    await touch('touchMove', from.x, from.y + ((to.y - from.y) * i) / steps);
    await page.waitForTimeout(16);
  }
  await touch('touchEnd', to.x, to.y);
  await session.detach();
}

test('the checkbox marks and unmarks completion, saves at once and keeps the task in place', async ({ page }) => {
  await openHome(page);
  await checkbox(page, 'אחת').check();
  await expect(checkbox(page, 'אחת')).toBeEnabled();
  await expect(rows(page).nth(0)).toHaveClass(/task-row--completed/);
  await expect.poll(async () => (await dbRow('אחת')).completed).toBe(true);

  await checkbox(page, 'שתיים').uncheck();
  await expect.poll(async () => (await dbRow('שתיים')).completed).toBe(false);
  expect(await dbTitles()).toEqual(['אחת', 'שתיים', 'שלוש', 'ארבע']);

  await page.reload();
  await expect(checkbox(page, 'אחת')).toBeChecked();
  await expect(checkbox(page, 'שתיים')).not.toBeChecked();
  await expect(labels(page)).toHaveText(['אחת', 'שתיים', 'שלוש', 'ארבע']);
});

test('dragging with the mouse (including a completed task) saves the exact order', async ({ page }) => {
  await openHome(page);
  await mouseDrag(page, 'שתיים', 3);
  await expect(labels(page)).toHaveText(['אחת', 'שלוש', 'ארבע', 'שתיים']);
  await expect.poll(dbTitles).toEqual(['אחת', 'שלוש', 'ארבע', 'שתיים']);
  expect(await dbPositions()).toEqual([0, 1, 2, 3]);

  await mouseDrag(page, 'ארבע', 0);
  await expect.poll(dbTitles).toEqual(['ארבע', 'אחת', 'שלוש', 'שתיים']);
  await page.reload();
  await expect(labels(page)).toHaveText(['ארבע', 'אחת', 'שלוש', 'שתיים']);
  await expect(checkbox(page, 'שתיים')).toBeChecked();
  expect(await dbPositions()).toEqual([0, 1, 2, 3]);
});

test('touch drag on the handle reorders without toggling a checkbox or selecting a task', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'touch drag runs in the mobile project');
  await openHome(page);
  await touchDrag(page, 'אחת', 2);
  await expect(labels(page)).toHaveText(['שתיים', 'שלוש', 'אחת', 'ארבע']);
  await expect.poll(dbTitles).toEqual(['שתיים', 'שלוש', 'אחת', 'ארבע']);
  await expect(page.getByText('בחר משימה מהרשימה כדי לצפות בפרטיה')).toBeVisible();
  await expect(page.locator('.task-row--selected')).toHaveCount(0);
  expect((await client.query('select title from public.tasks where completed')).rows).toEqual([{ title: 'שתיים' }]);

  await page.reload();
  await expect(labels(page)).toHaveText(['שתיים', 'שלוש', 'אחת', 'ארבע']);
});

test('toggling and dragging the selected task keep the unsaved draft and save nothing else', async ({ page }) => {
  await openHome(page);
  await page.getByRole('button', { name: 'שלוש', exact: true }).click();
  const details = page.locator('.task-details');
  await details.getByLabel('כותרת').fill('טיוטה שלא נשמרה');

  await checkbox(page, 'שלוש').check();
  await expect.poll(async () => (await dbRow('שלוש')).completed).toBe(true);
  await mouseDrag(page, 'שלוש', 0);
  await expect.poll(dbTitles).toEqual(['שלוש', 'אחת', 'שתיים', 'ארבע']);

  await expect(details.getByLabel('כותרת')).toHaveValue('טיוטה שלא נשמרה');
  await expect(page.locator('.task-row--selected')).toContainText('שלוש');
  expect(await dbRow('טיוטה שלא נשמרה')).toBeUndefined();
});

test('a server error on status restores the checkbox and shows a message', async ({ page }) => {
  await openHome(page);
  await page.route('**/api/tasks/*/status', (route) =>
    route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }),
  );
  await checkbox(page, 'אחת').click();
  await expect(page.locator('.task-list').getByRole('alert')).toContainText('לא ניתן לעדכן את סטטוס המשימה');
  await expect(checkbox(page, 'אחת')).not.toBeChecked();
  expect((await dbRow('אחת')).completed).toBe(false);
});

test('a server error on order restores the previous order and shows a message', async ({ page }) => {
  await openHome(page);
  await page.route('**/api/tasks/order', (route) =>
    route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }),
  );
  await mouseDrag(page, 'אחת', 3);
  await expect(page.locator('.task-list').getByRole('alert')).toContainText('הסדר הקודם הוחזר');
  await expect(labels(page)).toHaveText(['אחת', 'שתיים', 'שלוש', 'ארבע']);
  expect(await dbTitles()).toEqual(['אחת', 'שתיים', 'שלוש', 'ארבע']);
});

test('a task added by another visitor before dragging: 409, nothing lost, and refresh shows the current list', async ({
  page,
  request,
}) => {
  await openHome(page);
  expect((await request.post('/api/tasks', { data: { title: 'ממבקר אחר' } })).status()).toBe(201);

  await mouseDrag(page, 'אחת', 3);
  const alert = page.locator('.task-list').getByRole('alert');
  await expect(alert).toContainText('רשימת המשימות השתנתה בינתיים');
  await expect(labels(page)).toHaveText(['אחת', 'שתיים', 'שלוש', 'ארבע']);
  expect(await dbTitles()).toEqual(['אחת', 'שתיים', 'שלוש', 'ארבע', 'ממבקר אחר']);

  await alert.getByRole('button', { name: 'רענן את הרשימה' }).click();
  await expect(labels(page)).toHaveText(['אחת', 'שתיים', 'שלוש', 'ארבע', 'ממבקר אחר']);
  await expect(page.locator('.task-list').getByRole('alert')).toHaveCount(0);
});

test('changes by another visitor appear only after a refresh, with no background requests', async ({ page, browser }) => {
  await openHome(page);
  let listRequests = 0;
  page.on('request', (req) => {
    if (req.method() === 'GET' && new URL(req.url()).pathname === '/api/tasks') listRequests++;
  });

  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await openHome(otherPage);
  await checkbox(otherPage, 'ארבע').check();
  await expect.poll(async () => (await dbRow('ארבע')).completed).toBe(true);
  await mouseDrag(otherPage, 'ארבע', 0);
  await expect.poll(dbTitles).toEqual(['ארבע', 'אחת', 'שתיים', 'שלוש']);
  await other.close();

  await page.waitForTimeout(1500);
  expect(listRequests).toBe(0);
  await expect(labels(page)).toHaveText(['אחת', 'שתיים', 'שלוש', 'ארבע']);
  await expect(checkbox(page, 'ארבע')).not.toBeChecked();

  await page.reload();
  await expect(labels(page)).toHaveText(['ארבע', 'אחת', 'שתיים', 'שלוש']);
  await expect(checkbox(page, 'ארבע')).toBeChecked();
});

test('the API: explicit status, ordered ids, 409 on a changed set, and routing of /order', async ({ request }) => {
  const ids = (await client.query('select id from public.tasks order by position, id')).rows.map((row) => row.id);
  const status = await request.patch(`/api/tasks/${ids[0]}/status`, { data: { completed: true } });
  expect(status.status()).toBe(200);
  expect(await status.json()).toMatchObject({ id: ids[0], completed: true, position: 0 });
  expect((await request.patch(`/api/tasks/${ids[0]}/status`, { data: { completed: 'yes' } })).status()).toBe(400);

  const reversed = [...ids].reverse();
  const order = await request.put('/api/tasks/order', { data: { orderedIds: reversed } });
  expect(order.status()).toBe(200);
  expect((await order.json()).map((task: { id: string }) => task.id)).toEqual(reversed);

  const conflict = await request.put('/api/tasks/order', { data: { orderedIds: reversed.slice(1) } });
  expect(conflict.status()).toBe(409);
  expect(await conflict.json()).toMatchObject({ error: { code: 'ORDER_CONFLICT' } });
  expect((await request.patch('/api/tasks/order', { data: {} })).status()).toBe(405);
  expect(await dbPositions()).toEqual([0, 1, 2, 3]);
});
