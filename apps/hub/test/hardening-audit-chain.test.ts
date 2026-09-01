import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { freshDb } from "./helpers.js";
import { seedDevData } from "../src/identity/seed.js";
import { AUDIT_GENESIS, recordAudit, seedDevGrants, verifyAuditChain } from "../src/policy/policy.js";
import type { DbPool } from "../src/platform/db.js";

let pool: DbPool;

beforeAll(async () => {
  pool = await freshDb("evoos_test_hardening_audit_chain");
  await seedDevData(pool);
  await seedDevGrants(pool);
});

afterAll(async () => {
  await pool.end();
});

async function addEntry(orgId: string, action: string, correlationId: string) {
  await recordAudit(pool, {
    orgId,
    actor: "user_dev_a",
    action,
    resource: `resource/${action}`,
    outcome: "allowed",
    correlationId,
  });
}

describe("Tamper-evident audit chain (HARD-06..09)", () => {
  it("chains a new entry to the immediately preceding entry of the same org (HARD-06)", async () => {
    await addEntry("org_chain_1", "action.a", "corr_a1");
    await addEntry("org_chain_1", "action.b", "corr_a2");

    const rows = await pool.query(
      `select id, prev_hash as "prevHash", entry_hash as "entryHash" from audit_log where org_id = 'org_chain_1' order by id asc`,
    );
    expect(rows.rows).toHaveLength(2);
    const [first, second] = rows.rows as [
      { id: number; prevHash: string; entryHash: string },
      { id: number; prevHash: string; entryHash: string },
    ];
    expect(second.prevHash).toBe(first.entryHash);
    expect(first.entryHash).not.toBe(second.entryHash);
  });

  it("uses the fixed genesis value for an org's first entry (HARD-09)", async () => {
    await addEntry("org_chain_genesis", "action.first", "corr_genesis");
    const row = await pool.query(
      `select prev_hash as "prevHash" from audit_log where org_id = 'org_chain_genesis' order by id asc limit 1`,
    );
    expect(row.rows[0].prevHash).toBe(AUDIT_GENESIS);
  });

  it("reports a chain unaltered outside recordAudit as valid (HARD-07)", async () => {
    await addEntry("org_chain_valid", "action.a", "corr_v1");
    await addEntry("org_chain_valid", "action.b", "corr_v2");
    await addEntry("org_chain_valid", "action.c", "corr_v3");
    const verdict = await verifyAuditChain(pool, "org_chain_valid");
    expect(verdict).toEqual({ valid: true });
  });

  it("treats an org with exactly one entry as valid by construction", async () => {
    await addEntry("org_chain_single", "action.only", "corr_single");
    const verdict = await verifyAuditChain(pool, "org_chain_single");
    expect(verdict).toEqual({ valid: true });
  });

  it("treats an org with zero entries as valid (vacuously)", async () => {
    const verdict = await verifyAuditChain(pool, "org_chain_empty");
    expect(verdict).toEqual({ valid: true });
  });

  it("detects a direct tamper on a middle entry, identifying the exact broken id (HARD-08)", async () => {
    await addEntry("org_chain_tamper", "action.a", "corr_t1");
    await addEntry("org_chain_tamper", "action.b", "corr_t2");
    await addEntry("org_chain_tamper", "action.c", "corr_t3");

    const before = await verifyAuditChain(pool, "org_chain_tamper");
    expect(before).toEqual({ valid: true });

    const middle = await pool.query(
      `select id from audit_log where org_id = 'org_chain_tamper' order by id asc offset 1 limit 1`,
    );
    const middleId = middle.rows[0].id as number;
    await pool.query(`update audit_log set reason = 'tampered directly in the database' where id = $1`, [middleId]);

    const after = await verifyAuditChain(pool, "org_chain_tamper");
    expect(after).toEqual({ valid: false, brokenAtId: middleId });
  });
});
