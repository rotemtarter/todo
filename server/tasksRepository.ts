import type { Task, TaskInput } from '../shared/types.js';
import { TASK_LIMIT, validateTaskInput, type ValidationError } from '../shared/validation.js';
import { getPool } from './db.js';
import { lockTaskList } from './listLock.js';

export class TaskLimitError extends Error {
  constructor() {
    super('Task limit reached');
    this.name = 'TaskLimitError';
  }
}

export class TaskNotFoundError extends Error {
  constructor() {
    super('Task not found');
    this.name = 'TaskNotFoundError';
  }
}

export class OrderConflictError extends Error {
  constructor() {
    super('Order does not match the current task list');
    this.name = 'OrderConflictError';
  }
}

export class TaskValidationError extends Error {
  constructor(readonly errors: ValidationError[]) {
    super('Task validation failed');
    this.name = 'TaskValidationError';
  }
}

interface TaskRow {
  id: string;
  title: string | null;
  description: string | null;
  due_date: string | null;
  completed: boolean;
  position: number;
}

function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    dueDate: row.due_date,
    completed: row.completed,
    position: row.position,
  };
}

const TASK_COLUMNS = 'id, title, description, due_date, completed, position';

export async function listTasks(): Promise<Task[]> {
  const result = await getPool().query<TaskRow>(
    `select ${TASK_COLUMNS}
       from public.tasks
      order by position asc, id asc`,
  );
  return result.rows.map(toTask);
}

/**
 * Adds a validated task at the end of the list. Counts and inserts under the shared list
 * lock in one transaction, so concurrent creates cannot exceed TASK_LIMIT.
 */
export async function createTask(input: TaskInput): Promise<Task> {
  // The whole transaction must use one client (Transaction Pooler, ARCHITECTURE 2.9).
  const client = await getPool().connect();
  try {
    await client.query('begin');
    try {
      await lockTaskList(client);
      const { rows: stats } = await client.query<{ count: number; next: number }>(
        'select count(*)::int as count, coalesce(max(position), -1) + 1 as next from public.tasks',
      );
      if (stats[0].count >= TASK_LIMIT) {
        throw new TaskLimitError();
      }
      const { rows } = await client.query<TaskRow>(
        `insert into public.tasks (title, description, due_date, completed, position)
         values ($1, $2, $3, false, $4)
         returning ${TASK_COLUMNS}`,
        [input.title, input.description, input.dueDate, stats[0].next],
      );
      await client.query('commit');
      return toTask(rows[0]);
    } catch (error) {
      await client.query('rollback');
      throw error;
    }
  } finally {
    client.release();
  }
}

/**
 * Replaces title, description and due date (never completed/position). The saved due date is read
 * under a row lock and validated in the same transaction, so the "past date only if changed" rule
 * checks the value that is actually overwritten; concurrent saves are serialized: last write wins (ADR-8).
 */
export async function updateTaskDetails(id: string, input: TaskInput, today: string): Promise<Task> {
  const client = await getPool().connect();
  try {
    await client.query('begin');
    try {
      const { rows: saved } = await client.query<{ due_date: string | null }>(
        'select due_date from public.tasks where id = $1 for update',
        [id],
      );
      if (saved.length === 0) {
        throw new TaskNotFoundError();
      }
      const result = validateTaskInput(input, today, saved[0].due_date);
      if (!result.ok) {
        throw new TaskValidationError(result.errors);
      }
      const { rows } = await client.query<TaskRow>(
        `update public.tasks
            set title = $2, description = $3, due_date = $4, updated_at = now()
          where id = $1
          returning ${TASK_COLUMNS}`,
        [id, result.value.title, result.value.description, result.value.dueDate],
      );
      await client.query('commit');
      return toTask(rows[0]);
    } catch (error) {
      await client.query('rollback');
      throw error;
    }
  } finally {
    client.release();
  }
}

/** Deletes a task under the shared list lock and renumbers positions to 0..N-1 in the existing order. */
export async function deleteTask(id: string): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query('begin');
    try {
      await lockTaskList(client);
      const { rowCount } = await client.query('delete from public.tasks where id = $1', [id]);
      if (rowCount === 0) {
        throw new TaskNotFoundError();
      }
      await client.query(
        `update public.tasks t
            set position = r.new_position
           from (select id, (row_number() over (order by position, id) - 1)::int as new_position
                   from public.tasks) r
          where t.id = r.id and t.position <> r.new_position`,
      );
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    }
  } finally {
    client.release();
  }
}

/** Saves an explicit status in one statement, without the list lock: it never touches position or details (ADR-9). */
export async function setTaskCompleted(id: string, completed: boolean): Promise<Task> {
  const { rows } = await getPool().query<TaskRow>(
    `update public.tasks
        set completed = $2, updated_at = now()
      where id = $1
      returning ${TASK_COLUMNS}`,
    [id, completed],
  );
  if (rows.length === 0) {
    throw new TaskNotFoundError();
  }
  return toTask(rows[0]);
}

/**
 * Replaces the list order under the shared list lock. The ids must match the stored set one-to-one,
 * otherwise nothing changes (OrderConflictError). Positions become 0..N-1; returns the reordered list.
 */
export async function reorderTasks(orderedIds: string[]): Promise<Task[]> {
  const client = await getPool().connect();
  try {
    await client.query('begin');
    try {
      await lockTaskList(client);
      const { rows: existing } = await client.query<{ id: string }>('select id from public.tasks');
      const stored = new Set(existing.map((row) => row.id));
      if (stored.size !== orderedIds.length || !orderedIds.every((id) => stored.has(id))) {
        throw new OrderConflictError();
      }
      await client.query(
        `update public.tasks t
            set position = (o.ord - 1)::int, updated_at = now()
           from unnest($1::uuid[]) with ordinality as o(id, ord)
          where t.id = o.id and t.position <> o.ord - 1`,
        [orderedIds],
      );
      const { rows } = await client.query<TaskRow>(
        `select ${TASK_COLUMNS}
           from public.tasks
          order by position asc, id asc`,
      );
      await client.query('commit');
      return rows.map(toTask);
    } catch (error) {
      await client.query('rollback');
      throw error;
    }
  } finally {
    client.release();
  }
}
