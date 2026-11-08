import pg from 'pg';
import { config } from './config';

// numeric → number, int8 → number (safe for our magnitudes)
pg.types.setTypeParser(1700, (v) => (v == null ? null : Number(v)) as unknown as string);
pg.types.setTypeParser(20, (v) => (v == null ? null : Number(v)) as unknown as string);

export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 15 });

export type Queryable = Pick<pg.Pool, 'query'> | pg.PoolClient;

export async function q<T = any>(text: string, params: unknown[] = [], db: Queryable = pool): Promise<T[]> {
  const r = await db.query(text, params as any[]);
  return r.rows as T[];
}

export async function one<T = any>(text: string, params: unknown[] = [], db: Queryable = pool): Promise<T | null> {
  const r = await db.query(text, params as any[]);
  return (r.rows[0] as T) ?? null;
}

export async function tx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const out = await fn(c);
    await c.query('COMMIT');
    return out;
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}
