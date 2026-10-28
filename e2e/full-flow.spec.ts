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
  await client.query(`insert into public.tasks (title, completed, position) values ('קיימת', false, 0)`);
});

const labels = (page: Page) => page.locator('.task-row__label');

async function dbRows() {
  const { rows } = await client.query('select title, description, completed, position from public.tasks order by position, id');
  return rows;
}

test('a visitor goes through every flow end to end', async ({ page }) => {
  await page.goto('/');
  await expect(labels(page)).toHaveText(['קיימת']);
  await expect(page.getByText('בחר משימה מהרשימה כדי לצפות בפרטיה')).toBeVisible();

  // Create
  await page.getByRole('button', { name: 'הוסף משימה' }).click();
  const dialog = page.getByRole('dialog', { name: 'הוספת משימה' });
  await dialog.getByLabel('כותרת').fill('חדשה');
  await dialog.getByLabel('תיאור').fill('תיאור ראשון');
  await dialog.getByRole('button', { name: 'הוסף משימה' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(labels(page)).toHaveText(['קיימת', 'חדשה']);
  const details = page.getByRole('region', { name: 'פרטי משימה' });
  await expect(details.getByLabel('כותרת')).toHaveValue('חדשה');

  // Edit
  await details.getByLabel('כותרת').fill('חדשה ערוכה');
  await details.getByRole('button', { name: 'שמור שינויים' }).click();
  await expect(details.getByText('השינויים נשמרו')).toBeVisible();
  await expect(labels(page)).toHaveText(['קיימת', 'חדשה ערוכה']);

  // Complete
  const checkbox = page.getByRole('checkbox', { name: 'סימון השלמה: חדשה ערוכה' });
  await checkbox.click();
  await expect(checkbox).toBeChecked();
  await expect(checkbox).toBeEnabled();

  // Reorder with the keyboard sensor (mouse and touch drags are covered in tasks-status-order.spec.ts)
  const handle = page.getByRole('button', { name: 'גרור כדי לשנות את מיקום המשימה: חדשה ערוכה' });
  await handle.focus();
  // Each step waits for dnd-kit's screen reader announcement, so the keys don't outrun the drag.
  await page.keyboard.press('Space');
  await expect(page.getByText(/מעל מקום 2 מתוך 2/)).toHaveCount(1);
  await page.keyboard.press('ArrowUp');
  await expect(page.getByText(/מעל מקום 1 מתוך 2/)).toHaveCount(1);
  await page.keyboard.press('Space');
  await expect(labels(page)).toHaveText(['חדשה ערוכה', 'קיימת']);
  await expect(handle).toBeEnabled();

  // Navigate away and back, then refresh: everything came from the server
  await page.getByRole('link', { name: 'אודות' }).click();
  await expect(page.getByRole('heading', { name: 'אודות' })).toBeVisible();
  await page.getByRole('link', { name: 'דף הבית' }).click();
  await page.reload();
  await expect(labels(page)).toHaveText(['חדשה ערוכה', 'קיימת']);
  await expect(page.getByRole('checkbox', { name: 'סימון השלמה: חדשה ערוכה' })).toBeChecked();
  expect(await dbRows()).toEqual([
    { title: 'חדשה ערוכה', description: 'תיאור ראשון', completed: true, position: 0 },
    { title: 'קיימת', description: null, completed: false, position: 1 },
  ]);

  // Delete with confirmation
  await page.getByRole('button', { name: 'חדשה ערוכה', exact: true }).click();
  await details.getByRole('button', { name: 'מחק משימה' }).click();
  await page.getByRole('alertdialog', { name: 'מחיקת משימה' }).getByRole('button', { name: 'אישור' }).click();
  await expect(labels(page)).toHaveText(['קיימת']);
  await expect(page.getByText('בחר משימה מהרשימה כדי לצפות בפרטיה')).toBeVisible();
  expect(await dbRows()).toEqual([{ title: 'קיימת', description: null, completed: false, position: 0 }]);
});

test("another visitor's changes appear only after a refresh", async ({ browser }) => {
  const first = await browser.newContext();
  const second = await browser.newContext();
  try {
    const pageA = await first.newPage();
    const pageB = await second.newPage();
    await pageA.goto('/');
    await pageB.goto('/');
    await expect(labels(pageB)).toHaveText(['קיימת']);

    await pageA.getByRole('checkbox', { name: 'סימון השלמה: קיימת' }).click();
    await pageA.getByRole('button', { name: 'הוסף משימה' }).click();
    const dialog = pageA.getByRole('dialog', { name: 'הוספת משימה' });
    await dialog.getByLabel('כותרת').fill('ממבקר אחר');
    await dialog.getByRole('button', { name: 'הוסף משימה' }).click();
    await expect(labels(pageA)).toHaveText(['קיימת', 'ממבקר אחר']);

    // No polling or real-time: the second visitor still sees the old list
    await pageB.waitForTimeout(1500);
    await expect(labels(pageB)).toHaveText(['קיימת']);
    await expect(pageB.getByRole('checkbox', { name: 'סימון השלמה: קיימת' })).not.toBeChecked();

    await pageB.reload();
    await expect(labels(pageB)).toHaveText(['קיימת', 'ממבקר אחר']);
    await expect(pageB.getByRole('checkbox', { name: 'סימון השלמה: קיימת' })).toBeChecked();
  } finally {
    await first.close();
    await second.close();
  }
});
