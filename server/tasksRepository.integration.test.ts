import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { createDevClient, restoreSnapshot, takeSnapshot } from '../test-support/devSnapshot';
import { listTasks } from './tasksRepository';
import { getPool } from './db';

let client: pg.Client;
let snapshot: Awaited<ReturnType<typeof takeSnapshot>>;

beforeAll(async () => {
  client = createDevClient();
  await client.connect();
  snapshot = await takeSnapshot(client);
});

afterAll(async () => {
  await restoreSnapshot(client, snapshot);
  await client.end();
  await getPool().end();
});

describe('listTasks against the Dev database', () => {
  it('returns [] when the table is empty', async () => {
    await client.query('delete from public.tasks');
    expect(await listTasks()).toEqual([]);
  });

  it('returns tasks ordered by position, then id, with date-only due dates', async () => {
    await client.query('delete from public.tasks');
    await client.query(
      `insert into public.tasks (id, title, description, due_date, completed, position) values
        ('00000000-0000-4000-8000-000000000003', 'שלישית', null, null, false, 2),
        ('00000000-0000-4000-8000-000000000002', null, 'שנייה ב', '2026-12-31', true, 1),
        ('00000000-0000-4000-8000-000000000001', 'שנייה א', null, null, false, 1),
        ('00000000-0000-4000-8000-000000000000', 'ראשונה', null, null, false, 0)`,
    );
    const tasks = await listTasks();
    expect(tasks.map((task) => task.id)).toEqual([
      '00000000-0000-4000-8000-000000000000',
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
      '00000000-0000-4000-8000-000000000003',
    ]);
    expect(tasks[2]).toEqual({
      id: '00000000-0000-4000-8000-000000000002',
      title: null,
      description: 'שנייה ב',
      dueDate: '2026-12-31',
      completed: true,
      position: 1,
    });
  });

  it('rejects a task with whitespace-only title and description (DB constraint)', async () => {
    await expect(
      client.query(`insert into public.tasks (title, description, position) values ('   ', E'\\n', 0)`),
    ).rejects.toThrow(/tasks_title_or_description/);
  });
});
