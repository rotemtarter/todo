import type { Task, TaskInput } from '../shared/types.js';
import { TASK_LIMIT } from '../shared/validation.js';
import { getPool } from './db.js';
import { lockTaskList } from './listLock.js';

export class TaskLimitError extends Error {
  constructor() {
    super('Task limit reached');
    this.name = 'TaskLimitError';
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
