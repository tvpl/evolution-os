import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const { Pool } = pg;
export type DbPool = pg.Pool;
export type DbClient = pg.PoolClient;

export const DEFAULT_DB_URL = "postgresql://evo@127.0.0.1:55432/evolution";

export function createPool(url: string = process.env["DATABASE_URL"] ?? DEFAULT_DB_URL): DbPool {
  return new Pool({ connectionString: url, max: 10 });
}

/** Executa fn numa transação; commit no sucesso, rollback em qualquer erro. */
export async function withTx<T>(pool: DbPool, fn: (client: DbClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}

export const MIGRATIONS_DIR = join(import.meta.dirname, "..", "..", "migrations");

/**
 * Aplica migrations SQL sequenciais uma única vez cada (tabela schema_migrations).
 * Idempotente: re-execução é no-op. Retorna os nomes aplicados nesta chamada.
 */
export async function runMigrations(pool: DbPool, dir: string = MIGRATIONS_DIR): Promise<string[]> {
  await pool.query(
    "create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())",
  );
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const applied: string[] = [];
  for (const file of files) {
    const done = await pool.query("select 1 from schema_migrations where name = $1", [file]);
    if (done.rowCount) continue;
    const sql = readFileSync(join(dir, file), "utf8");
    await withTx(pool, async (client) => {
      await client.query(sql);
      await client.query("insert into schema_migrations (name) values ($1)", [file]);
    });
    applied.push(file);
  }
  return applied;
}
