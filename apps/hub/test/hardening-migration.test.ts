import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { freshDb } from "./helpers.js";
import { seedDevData } from "../src/identity/seed.js";
import { seedDevGrants } from "../src/policy/policy.js";
import { runMigrations } from "../src/platform/db.js";
import type { DbPool } from "../src/platform/db.js";

let pool: DbPool;

beforeAll(async () => {
  pool = await freshDb("evoos_test_hardening_migration");
});

afterAll(async () => {
  await pool.end();
});

describe("migration 010 (hardening)", () => {
  it("applies from zero adding the hardening columns/table, and is idempotent", async () => {
    const tables = await pool.query(
      "select table_name from information_schema.tables where table_schema = 'public' order by table_name",
    );
    const names = tables.rows.map((r: { table_name: string }) => r.table_name);
    expect(names).toContain("org_retention_policies");

    const columns = await pool.query(
      `select table_name, column_name from information_schema.columns
        where (table_name = 'audit_log' and column_name in ('entry_hash', 'prev_hash'))
           or (table_name = 'evidence' and column_name = 'redacted_at')
           or (table_name = 'users' and column_name = 'deactivated_at')`,
    );
    expect(columns.rowCount).toBe(4);

    const before = await pool.query("select count(*)::int as n from schema_migrations");
    const applied = await runMigrations(pool);
    expect(applied).toEqual([]);
    const after = await pool.query("select count(*)::int as n from schema_migrations");
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });

  it("seedDevGrants grants admin.write to both dev tenants", async () => {
    await seedDevData(pool);
    await seedDevGrants(pool);
    for (const orgId of ["org_dev_a", "org_dev_b"]) {
      const rows = await pool.query(
        "select capability from capability_grants where org_id = $1 order by capability",
        [orgId],
      );
      const caps = rows.rows.map((r: { capability: string }) => r.capability);
      expect(caps).toContain("admin.write");
    }
  });
});
