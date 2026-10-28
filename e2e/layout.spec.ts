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
      ('לקנות מצרכים', null, null, false, 0),
      (null, 'תיאור ארוך מאוד בלי כותרת שאמור להיקטע בשורה של הרשימה ולא לגרום לגלילה הצידה במסך צר של טלפון', null, false, 1),
      ('לסיים דוח שנתי', 'פרטים', '2030-04-28', true, 2)`,
  );
});

async function box(page: Page, name: string) {
  const found = await page.getByRole('region', { name }).boundingBox();
  if (!found) throw new Error(`${name} not visible`);
  return found;
}

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

test('the page is Hebrew and right-to-left', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'he');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  const direction = await page.locator('.task-row__label').first().evaluate((node) => getComputedStyle(node).direction);
  expect(direction).toBe('rtl');
});

test('list and details are placed for the screen size', async ({ page, isMobile }) => {
  await page.goto('/');
  await expect(page.locator('.task-row')).toHaveCount(3);
  const list = await box(page, 'רשימת משימות');
  const details = await box(page, 'פרטי משימה');
  if (isMobile) {
    // One column: the list above the details (DESIGN 1.6)
    expect(list.y + list.height).toBeLessThanOrEqual(details.y);
  } else {
    // Side by side: the list on the right, the details on the left (DESIGN 1.1)
    expect(list.x).toBeGreaterThanOrEqual(details.x + details.width);
  }
});

test('no screen scrolls sideways', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.task-row')).toHaveCount(3);
  await expectNoHorizontalScroll(page);

  await page.getByRole('button', { name: 'לסיים דוח שנתי', exact: true }).click();
  await expect(page.getByRole('region', { name: 'פרטי משימה' }).getByLabel('כותרת')).toHaveValue('לסיים דוח שנתי');
  await expectNoHorizontalScroll(page);

  await page.getByRole('button', { name: 'הוסף משימה' }).click();
  await expect(page.getByRole('dialog', { name: 'הוספת משימה' })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.getByRole('button', { name: 'סגור' }).click();

  await page.getByRole('region', { name: 'פרטי משימה' }).getByRole('button', { name: 'מחק משימה' }).click();
  await expect(page.getByRole('alertdialog', { name: 'מחיקת משימה' })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.getByRole('button', { name: 'ביטול' }).click();

  await page.getByRole('link', { name: 'אודות' }).click();
  await expect(page.getByRole('heading', { name: 'אודות' })).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test('list rows show only the identifying text, and the mockup extras are absent', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.task-row')).toHaveCount(3);
  // The date and description of a titled task are not shown in the list (DESIGN 2.3)
  const completedRow = page.locator('.task-row', { hasText: 'לסיים דוח שנתי' });
  await expect(completedRow).not.toContainText('פרטים');
  await expect(completedRow).not.toContainText('2030');
  await expect(completedRow.locator('.task-row__label')).toHaveCSS('text-decoration-line', 'line-through');

  // Items seen only in the mockups or style guide are not implemented (DESIGN 1, 2.3)
  for (const extra of ['הגדרות', 'ערוך משימה', 'נוצר בתאריך', 'עודכן לאחרונה', 'To Do']) {
    await expect(page.getByText(extra, { exact: true })).toHaveCount(0);
  }
  await expect(page.getByRole('navigation', { name: 'ניווט ראשי' }).getByRole('link')).toHaveText(['דף הבית', 'אודות']);
});
