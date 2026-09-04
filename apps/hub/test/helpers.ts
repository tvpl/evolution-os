import pg from "pg";
import { createPool, runMigrations, type DbPool } from "../src/platform/db.js";

const { Client } = pg;

const BASE_URL = process.env["EVOOS_PG_BASE_URL"] ?? "postgresql://evo@127.0.0.1:55432";

/** Cria um banco descartável zerado com as migrations aplicadas. */
export async function freshDb(name: string): Promise<DbPool> {
  const admin = new Client({ connectionString: `${BASE_URL}/postgres` });
  await admin.connect();
  // Conexões órfãs (ex.: um runner morto) não podem impedir o drop.
  await admin.query(
    "select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()",
    [name],
  );
  await admin.query(`drop database if exists ${name}`);
  await admin.query(`create database ${name}`);
  await admin.end();
  const pool = createPool(`${BASE_URL}/${name}`);
  await runMigrations(pool);
  return pool;
}
