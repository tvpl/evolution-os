import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { freshDb } from "./helpers.js";
import { seedDevData } from "../src/identity/seed.js";
import { seedDevGrants } from "../src/policy/policy.js";
import { runMigrations } from "../src/platform/db.js";
import type { DbPool } from "../src/platform/db.js";

let pool: DbPool;

beforeAll(async () => {
  pool = await freshDb("evoos_test_idea_migration");
});

afterAll(async () => {
  await pool.end();
});

describe("migration 002 (idea memory)", () => {
  it("applies from zero creating the typed entity tables", async () => {
    const tables = await pool.query(
      "select table_name from information_schema.tables where table_schema = 'public' order by table_name",
    );
    const names = tables.rows.map((r: { table_name: string }) => r.table_name);
    for (const required of ["hypotheses", "constraints_", "artifacts", "artifact_versions", "decisions"]) {
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

  it("seedDevGrants grants the new idea-memory capabilities to both dev tenants", async () => {
    await seedDevData(pool);
    await seedDevGrants(pool);
    for (const orgId of ["org_dev_a", "org_dev_b"]) {
      const rows = await pool.query(
        "select capability from capability_grants where org_id = $1 order by capability",
        [orgId],
      );
      const caps = rows.rows.map((r: { capability: string }) => r.capability);
      for (const required of ["project.overview.read", "hypothesis.write", "artifact.write", "decision.write"]) {
        expect(caps).toContain(required);
      }
    }
  });
});
