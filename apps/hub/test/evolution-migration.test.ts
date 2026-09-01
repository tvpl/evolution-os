import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { freshDb } from "./helpers.js";
import { seedDevData } from "../src/identity/seed.js";
import { seedDevGrants } from "../src/policy/policy.js";
import { runMigrations } from "../src/platform/db.js";
import type { DbPool } from "../src/platform/db.js";

let pool: DbPool;

beforeAll(async () => {
  pool = await freshDb("evoos_test_evolution_migration");
});

afterAll(async () => {
  await pool.end();
});

describe("migration 004 (evolution)", () => {
  it("applies from zero creating evidence/claims/signals/proposals, and is idempotent", async () => {
    const tables = await pool.query(
      "select table_name from information_schema.tables where table_schema = 'public' order by table_name",
    );
    const names = tables.rows.map((r: { table_name: string }) => r.table_name);
    for (const required of ["evidence", "claims", "claim_evidence", "signals", "proposals"]) {
      expect(names).toContain(required);
    }

    const before = await pool.query("select count(*)::int as n from schema_migrations");
    const applied = await runMigrations(pool);
    expect(applied).toEqual([]);
    const after = await pool.query("select count(*)::int as n from schema_migrations");
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });

  it("seedDevGrants grants the five evolution capabilities to both dev tenants", async () => {
    await seedDevData(pool);
    await seedDevGrants(pool);
    for (const orgId of ["org_dev_a", "org_dev_b"]) {
      const rows = await pool.query(
        "select capability from capability_grants where org_id = $1 order by capability",
        [orgId],
      );
      const caps = rows.rows.map((r: { capability: string }) => r.capability);
      for (const required of [
        "evidence.write",
        "claim.write",
        "signal.write",
        "proposal.write",
        "proposal.decide",
      ]) {
        expect(caps).toContain(required);
      }
    }
  });
});
