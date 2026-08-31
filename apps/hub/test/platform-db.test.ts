import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool, runMigrations, withTx, type DbPool } from "../src/platform/db.js";

const { Client } = pg;
const BASE_URL = process.env["EVOOS_PG_BASE_URL"] ?? "postgresql://evo@127.0.0.1:55432";
const DB = "evoos_test_platform";

let pool: DbPool;

beforeAll(async () => {
  const admin = new Client({ connectionString: `${BASE_URL}/postgres` });
  await admin.connect();
  await admin.query(
    "select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()",
    [DB],
  );
  await admin.query(`drop database if exists ${DB}`);
  await admin.query(`create database ${DB}`);
  await admin.end();
  pool = createPool(`${BASE_URL}/${DB}`);
});

afterAll(async () => {
  await pool.end();
});

describe("migrations", () => {
  it("apply from zero creating the v0 tables", async () => {
    const applied = await runMigrations(pool);
    expect(applied).toEqual(["001_init.sql"]);
    const tables = await pool.query(
      "select table_name from information_schema.tables where table_schema = 'public' order by table_name",
    );
    const names = tables.rows.map((r: { table_name: string }) => r.table_name);
    for (const required of [
      "organizations",
      "workspaces",
      "users",
      "node_agents",
      "node_artifacts",
      "projects",
      "capability_grants",
      "idempotency_keys",
      "outbox",
      "inbox",
      "projects_view",
      "workflows",
      "workflow_steps",
      "audit_log",
      "schema_migrations",
    ]) {
      expect(names).toContain(required);
    }
  });

  it("re-run is a no-op (idempotent)", async () => {
    const before = await pool.query("select count(*)::int as n from schema_migrations");
    const applied = await runMigrations(pool);
    const after = await pool.query("select count(*)::int as n from schema_migrations");
    expect(applied).toEqual([]);
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });
});

describe("withTx", () => {
  it("commits on success", async () => {
    await withTx(pool, async (client) => {
      await client.query("insert into organizations (id, name) values ('org_tx1', 'Tx Org')");
    });
    const row = await pool.query("select name from organizations where id = 'org_tx1'");
    expect(row.rows[0]?.name).toBe("Tx Org");
  });

  it("rolls back every statement when fn throws", async () => {
    await expect(
      withTx(pool, async (client) => {
        await client.query("insert into organizations (id, name) values ('org_tx2', 'Rollback Org')");
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    const row = await pool.query("select 1 from organizations where id = 'org_tx2'");
    expect(row.rowCount).toBe(0);
  });
});
