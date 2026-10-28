import type pg from 'pg';

// One transaction-level advisory lock for every change to the list structure:
// create, delete and reorder (ARCHITECTURE 2.6). Arbitrary fixed key.
export const TASK_LIST_LOCK_KEY = 72_410_001;

/** Must run inside a transaction on `client`; released automatically on COMMIT/ROLLBACK. */
export async function lockTaskList(client: pg.PoolClient | pg.Client): Promise<void> {
  await client.query('select pg_advisory_xact_lock($1)', [TASK_LIST_LOCK_KEY]);
}
