import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type pg from 'pg';
import { createDevClient, restoreSnapshot, takeSnapshot } from '../test-support/devSnapshot';
import { TaskLimitError, createTask, listTasks } from './tasksRepository';
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

// Fills the table with `count` tasks at positions 0..count-1.
async function fillTasks(count: number) {
  await client.query('delete from public.tasks');
  await client.query(
    `insert into public.tasks (title, position) select 'משימה ' || i, i from generate_series(0, $1 - 1) as i`,
    [count],
  );
}

// A fresh copy of the repository with its own connection pool simulates a second
// function instance serving another visitor (ADR-7).
async function loadSecondInstance() {
  vi.resetModules();
  const repository = await import('./tasksRepository');
  const db = await import('./db');
  return { repository, db };
}

async function countTasks(): Promise<number> {
  const { rows } = await client.query<{ count: number }>('select count(*)::int as count from public.tasks');
  return rows[0].count;
}

describe('createTask against the Dev database', () => {
  it('inserts exactly one task at the end, as not completed', async () => {
    await client.query('delete from public.tasks');
    await client.query(`insert into public.tasks (title, position) values ('א', 0), ('ב', 4)`);
    const task = await createTask({ title: 'חדשה', description: null, dueDate: '2030-05-01' });
    expect(task).toMatchObject({ title: 'חדשה', description: null, dueDate: '2030-05-01', completed: false, position: 5 });
    expect(await countTasks()).toBe(3);
    const tasks = await listTasks();
    expect(tasks.at(-1)?.id).toBe(task.id);
  });

  it('starts at position 0 in an empty list', async () => {
    await client.query('delete from public.tasks');
    expect((await createTask({ title: null, description: 'רק תיאור', dueDate: null })).position).toBe(0);
  });

  it('refuses to create beyond 1,000 tasks', async () => {
    await fillTasks(1000);
    await expect(createTask({ title: 'עודפת', description: null, dueDate: null })).rejects.toBeInstanceOf(TaskLimitError);
    expect(await countTasks()).toBe(1000);
  });

  it('two concurrent creates at 999 tasks from two instances: exactly one succeeds', async () => {
    await fillTasks(999);
    const other = await loadSecondInstance();
    try {
      const results = await Promise.allSettled([
        createTask({ title: 'מבקר ראשון', description: null, dueDate: null }),
        other.repository.createTask({ title: 'מבקר שני', description: null, dueDate: null }),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const rejected = results.filter((r) => r.status === 'rejected');
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason.name).toBe('TaskLimitError');
      expect(await countTasks()).toBe(1000);
    } finally {
      await other.db.getPool().end();
    }
  });

  it('two concurrent creates from two instances both succeed at distinct consecutive positions', async () => {
    await fillTasks(3);
    const other = await loadSecondInstance();
    try {
      const [a, b] = await Promise.all([
        createTask({ title: 'מקבילה 1', description: null, dueDate: null }),
        other.repository.createTask({ title: 'מקבילה 2', description: null, dueDate: null }),
      ]);
      expect([a.position, b.position].sort()).toEqual([3, 4]);
      expect(await countTasks()).toBe(5);
    } finally {
      await other.db.getPool().end();
    }
  });
});
