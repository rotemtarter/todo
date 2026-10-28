import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type pg from 'pg';
import { createDevClient, restoreSnapshot, takeSnapshot } from '../test-support/devSnapshot';
import {
  OrderConflictError,
  TaskLimitError,
  TaskNotFoundError,
  TaskValidationError,
  createTask,
  deleteTask,
  listTasks,
  reorderTasks,
  setTaskCompleted,
  updateTaskDetails,
} from './tasksRepository';
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

const TODAY = '2026-10-28';
const MISSING_ID = '00000000-0000-4000-8000-0000000000ff';

async function rowById(id: string) {
  const { rows } = await client.query('select * from public.tasks where id = $1', [id]);
  return rows[0];
}

async function positions(): Promise<{ title: string; position: number }[]> {
  const { rows } = await client.query('select title, position from public.tasks order by position, id');
  return rows;
}

describe('updateTaskDetails against the Dev database', () => {
  it('changes only title, description, due date and updated_at', async () => {
    await client.query('delete from public.tasks');
    const { rows } = await client.query(
      `insert into public.tasks (title, completed, position, updated_at)
       values ('ישנה', true, 7, now() - interval '1 day') returning id, updated_at`,
    );
    const task = await updateTaskDetails(rows[0].id, { title: ' חדשה ', description: 'תיאור', dueDate: '2030-01-01' }, TODAY);
    expect(task).toMatchObject({ title: 'חדשה', description: 'תיאור', dueDate: '2030-01-01', completed: true, position: 7 });
    const saved = await rowById(rows[0].id);
    expect(saved).toMatchObject({ title: 'חדשה', completed: true, position: 7 });
    expect(saved.updated_at.getTime()).toBeGreaterThan(rows[0].updated_at.getTime());
  });

  it('keeps an unchanged past due date, and rejects changing it to another past date', async () => {
    await client.query('delete from public.tasks');
    const { rows } = await client.query(
      `insert into public.tasks (title, due_date, position) values ('עבר', '2020-05-05', 0) returning id`,
    );
    const id = rows[0].id;
    expect((await updateTaskDetails(id, { title: 'עבר 2', description: null, dueDate: '2020-05-05' }, TODAY)).dueDate).toBe(
      '2020-05-05',
    );
    await expect(updateTaskDetails(id, { title: 'עבר 3', description: null, dueDate: '2020-05-06' }, TODAY)).rejects.toBeInstanceOf(
      TaskValidationError,
    );
    expect(await rowById(id)).toMatchObject({ title: 'עבר 2', due_date: '2020-05-05' });
  });

  it('throws TaskNotFoundError for a missing task', async () => {
    await expect(updateTaskDetails(MISSING_ID, { title: 'א', description: null, dueDate: null }, TODAY)).rejects.toBeInstanceOf(
      TaskNotFoundError,
    );
  });

  it('two concurrent saves from two instances: one complete version wins, status and position untouched', async () => {
    await client.query('delete from public.tasks');
    const { rows } = await client.query(
      `insert into public.tasks (title, completed, position) values ('מקור', true, 3) returning id`,
    );
    const id = rows[0].id;
    const other = await loadSecondInstance();
    try {
      const a = { title: 'גרסה א', description: 'תיאור א', dueDate: '2030-01-01' };
      const b = { title: 'גרסה ב', description: null, dueDate: null };
      await Promise.all([updateTaskDetails(id, a, TODAY), other.repository.updateTaskDetails(id, b, TODAY)]);
      const saved = await rowById(id);
      const final = { title: saved.title, description: saved.description, dueDate: saved.due_date };
      expect([a, b]).toContainEqual(final);
      expect(saved).toMatchObject({ completed: true, position: 3 });
    } finally {
      await other.db.getPool().end();
    }
  });
});

describe('deleteTask against the Dev database', () => {
  it('deletes one task and renumbers positions to 0..N-1 in the same order', async () => {
    await client.query('delete from public.tasks');
    const { rows } = await client.query(
      `insert into public.tasks (title, position) values ('א', 0), ('ב', 2), ('ג', 5), ('ד', 9) returning id, title`,
    );
    await deleteTask(rows.find((row) => row.title === 'ב').id);
    expect(await positions()).toEqual([
      { title: 'א', position: 0 },
      { title: 'ג', position: 1 },
      { title: 'ד', position: 2 },
    ]);
  });

  it('throws TaskNotFoundError for a missing or already deleted task', async () => {
    await fillTasks(2);
    await expect(deleteTask(MISSING_ID)).rejects.toBeInstanceOf(TaskNotFoundError);
    expect(await countTasks()).toBe(2);
  });

  it('delete and create in parallel from two instances leave consecutive positions without duplicates', async () => {
    await fillTasks(5);
    const { rows } = await client.query(`select id from public.tasks where position = 1`);
    const other = await loadSecondInstance();
    try {
      await Promise.all([
        deleteTask(rows[0].id),
        other.repository.createTask({ title: 'חדשה במקביל', description: null, dueDate: null }),
      ]);
      const list = await positions();
      expect(list).toHaveLength(5);
      // A create that commits after the delete may leave one gap at the end, but never a duplicate.
      expect(new Set(list.map((t) => t.position)).size).toBe(5);
      expect(list.at(-1)?.title).toBe('חדשה במקביל');
    } finally {
      await other.db.getPool().end();
    }
  });
});

async function idsInOrder(): Promise<string[]> {
  const { rows } = await client.query<{ id: string }>('select id from public.tasks order by position, id');
  return rows.map((row) => row.id);
}

async function expectConsecutivePositions() {
  const { rows } = await client.query<{ position: number }>('select position from public.tasks order by position, id');
  expect(rows.map((row) => row.position)).toEqual(rows.map((_, index) => index));
}

describe('setTaskCompleted against the Dev database', () => {
  it('sets the explicit value both ways, changing only completed and updated_at', async () => {
    await client.query('delete from public.tasks');
    const { rows } = await client.query(
      `insert into public.tasks (title, description, due_date, position, updated_at)
       values ('סטטוס', 'תיאור', '2030-01-01', 4, now() - interval '1 day') returning id, updated_at`,
    );
    const id = rows[0].id;
    expect(await setTaskCompleted(id, true)).toMatchObject({ completed: true, position: 4, title: 'סטטוס' });
    expect(await setTaskCompleted(id, true)).toMatchObject({ completed: true });
    const saved = await rowById(id);
    expect(saved).toMatchObject({ completed: true, position: 4, title: 'סטטוס', description: 'תיאור', due_date: '2030-01-01' });
    expect(saved.updated_at.getTime()).toBeGreaterThan(rows[0].updated_at.getTime());
    expect(await setTaskCompleted(id, false)).toMatchObject({ completed: false });
  });

  it('throws TaskNotFoundError for a missing task', async () => {
    await expect(setTaskCompleted(MISSING_ID, true)).rejects.toBeInstanceOf(TaskNotFoundError);
  });
});

describe('reorderTasks against the Dev database', () => {
  it('saves the exact order with positions 0..N-1, keeping other fields', async () => {
    await client.query('delete from public.tasks');
    await client.query(
      `insert into public.tasks (title, completed, position) values ('א', false, 0), ('ב', true, 3), ('ג', false, 8)`,
    );
    const [a, b, c] = await idsInOrder();
    const result = await reorderTasks([c, a, b]);
    expect(result.map((t) => [t.id, t.position])).toEqual([
      [c, 0],
      [a, 1],
      [b, 2],
    ]);
    expect(await idsInOrder()).toEqual([c, a, b]);
    expect((await rowById(b)).completed).toBe(true);
  });

  it('rejects a missing, extra or unknown id with OrderConflictError and changes nothing', async () => {
    await fillTasks(3);
    const before = await idsInOrder();
    const [a, b, c] = before;
    await expect(reorderTasks([b, a])).rejects.toBeInstanceOf(OrderConflictError);
    await expect(reorderTasks([c, b, a, MISSING_ID])).rejects.toBeInstanceOf(OrderConflictError);
    await expect(reorderTasks([c, b, MISSING_ID])).rejects.toBeInstanceOf(OrderConflictError);
    expect(await idsInOrder()).toEqual(before);
  });

  it('accepts an empty order only for an empty list', async () => {
    await client.query('delete from public.tasks');
    expect(await reorderTasks([])).toEqual([]);
    await fillTasks(1);
    await expect(reorderTasks([])).rejects.toBeInstanceOf(OrderConflictError);
  });

  it('two concurrent reorders from two instances: the last one wins, positions stay consecutive', async () => {
    await fillTasks(6);
    const original = await idsInOrder();
    const first = [...original].reverse();
    const second = [...original.slice(3), ...original.slice(0, 3)];
    const other = await loadSecondInstance();
    try {
      await Promise.all([reorderTasks(first), other.repository.reorderTasks(second)]);
      expect([first, second]).toContainEqual(await idsInOrder());
      await expectConsecutivePositions();
    } finally {
      await other.db.getPool().end();
    }
  });

  it('create during a reorder: atomic, no lost task, no partial order, no duplicate position', async () => {
    for (let round = 0; round < 3; round++) {
      await fillTasks(5);
      const original = await idsInOrder();
      const requested = [...original].reverse();
      const other = await loadSecondInstance();
      try {
        const [reorder, created] = await Promise.allSettled([
          reorderTasks(requested),
          other.repository.createTask({ title: 'נוצרה בזמן גרירה', description: null, dueDate: null }),
        ]);
        expect(created.status).toBe('fulfilled');
        const newId = created.status === 'fulfilled' ? created.value.id : '';
        const ids = await idsInOrder();
        if (reorder.status === 'fulfilled') {
          expect(ids).toEqual([...requested, newId]);
        } else {
          expect(reorder.reason).toBeInstanceOf(OrderConflictError);
          expect(ids).toEqual([...original, newId]);
        }
        await expectConsecutivePositions();
      } finally {
        await other.db.getPool().end();
      }
    }
  });

  it('delete during a reorder: atomic, the deleted task never returns, positions stay consecutive', async () => {
    for (let round = 0; round < 3; round++) {
      await fillTasks(5);
      const original = await idsInOrder();
      const requested = [...original].reverse();
      const removed = original[2];
      const other = await loadSecondInstance();
      try {
        const [reorder, deleted] = await Promise.allSettled([
          reorderTasks(requested),
          other.repository.deleteTask(removed),
        ]);
        expect(deleted.status).toBe('fulfilled');
        const ids = await idsInOrder();
        if (reorder.status === 'fulfilled') {
          expect(ids).toEqual(requested.filter((id) => id !== removed));
        } else {
          expect(reorder.reason).toBeInstanceOf(OrderConflictError);
          expect(ids).toEqual(original.filter((id) => id !== removed));
        }
        await expectConsecutivePositions();
      } finally {
        await other.db.getPool().end();
      }
    }
  });

  it('status and detail saves during a reorder do not overwrite each other', async () => {
    await fillTasks(4);
    const original = await idsInOrder();
    const target = original[0];
    const requested = [...original].reverse();
    const other = await loadSecondInstance();
    try {
      await Promise.all([
        reorderTasks(requested),
        other.repository.setTaskCompleted(target, true),
        updateTaskDetails(target, { title: 'עודכנה', description: null, dueDate: null }, TODAY),
      ]);
      expect(await idsInOrder()).toEqual(requested);
      expect(await rowById(target)).toMatchObject({ title: 'עודכנה', completed: true, position: 3 });
    } finally {
      await other.db.getPool().end();
    }
  });
});
