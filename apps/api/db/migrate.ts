import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../src/db';

const dir = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

async function main() {
  if (process.argv.includes('--reset')) {
    console.log('Resetting schema…');
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  }
  await pool.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const done = new Set((await pool.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    if (done.has(f)) continue;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(readFileSync(join(dir, f), 'utf8'));
      await client.query('INSERT INTO schema_migrations(name) VALUES ($1)', [f]);
      await client.query('COMMIT');
      console.log(`✔ applied ${f}`);
    } catch (e) {
      await client.query('ROLLBACK');
      console.error(`✘ ${f} failed`);
      throw e;
    } finally {
      client.release();
    }
  }
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
