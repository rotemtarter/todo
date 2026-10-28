import { readFileSync } from 'node:fs';
import pg from 'pg';

// Saves the Dev tasks table before tests and restores it exactly afterwards (ADR-7, ADR-11).
// Must only ever be used with the Dev DATABASE_URL from .env.

interface TaskRecord {
  id: string;
  title: string | null;
  description: string | null;
  due_date: string | null;
  completed: boolean;
  position: number;
  created_at: Date;
  updated_at: Date;
}

pg.types.setTypeParser(pg.types.builtins.DATE, (value) => value);

export function assertDevDatabase(connectionString: string | undefined): string {
  if (!connectionString) throw new Error('DATABASE_URL (Dev) is not set in .env');
  // The Supabase CLI is linked to Dev only (ADR-1); refuse any other project.
  const devRef = readFileSync('supabase/.temp/project-ref', 'utf8').trim();
  let user = '';
  try {
    user = decodeURIComponent(new URL(connectionString).username);
  } catch {
    throw new Error('DATABASE_URL is not a valid URL');
  }
  if (!devRef || user !== `app_backend.${devRef}`) {
    throw new Error('DATABASE_URL does not point to the linked Dev project; refusing to run');
  }
  return connectionString;
}

export function createDevClient(): pg.Client {
  const connectionString = assertDevDatabase(process.env.DATABASE_URL);
  return new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
}

export async function takeSnapshot(client: pg.Client): Promise<TaskRecord[]> {
  const { rows } = await client.query<TaskRecord>('select * from public.tasks order by position, id');
  return rows;
}

export async function restoreSnapshot(client: pg.Client, rows: TaskRecord[]): Promise<void> {
  await client.query('begin');
  try {
    await client.query('delete from public.tasks');
    for (const row of rows) {
      await client.query(
        `insert into public.tasks (id, title, description, due_date, completed, position, created_at, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [row.id, row.title, row.description, row.due_date, row.completed, row.position, row.created_at, row.updated_at],
      );
    }
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}
