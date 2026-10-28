import pg from 'pg';

// Keep DATE columns as 'YYYY-MM-DD' strings instead of JS Dates (avoids timezone shifts).
pg.types.setTypeParser(pg.types.builtins.DATE, (value) => value);

let pool: pg.Pool | undefined;

// One small pool per function instance, reused across invocations (ARCHITECTURE 2.9).
export function getPool(): pg.Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL is not set');
    }
    pool = new pg.Pool({
      connectionString,
      max: 1,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 5_000,
      query_timeout: 10_000,
      statement_timeout: 10_000,
      // Encrypted, without CA chain verification (ADR-3).
      ssl: { rejectUnauthorized: false },
    });
  }
  return pool;
}
