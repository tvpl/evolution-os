import { describe, expect, it, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { freshDb } from "./helpers.js";
import { buildServer } from "../src/server.js";
import { seedDevData } from "../src/identity/seed.js";
import { seedDevGrants } from "../src/policy/policy.js";
import type { DbPool } from "../src/platform/db.js";

describe("Org-wide audit export (HARD-10/11)", () => {
  let pool: DbPool;
  let app: FastifyInstance;
  let tokenA: string;
  let tokenB: string;

  beforeAll(async () => {
    pool = await freshDb("evoos_test_hardening_audit_export");
    await seedDevData(pool);
    await seedDevGrants(pool);
    app = buildServer({ pool });
    const loginA = await app.inject({ method: "POST", url: "/auth/dev-login", payload: { email: "dev-a@evolutionos.local" } });
    tokenA = loginA.json().token;
    const loginB = await app.inject({ method: "POST", url: "/auth/dev-login", payload: { email: "dev-b@evolutionos.local" } });
    tokenB = loginB.json().token;
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  async function exportAudit(token: string) {
    return app.inject({ method: "GET", url: "/orgs/current/audit/export", headers: { authorization: `Bearer ${token}` } });
  }

  it("returns the full ordered trail with a valid chain verdict, isolated per org", async () => {
    // Ação já auditada (negação de capability) em cada org, produzindo entries reais.
    await pool.query("delete from capability_grants where org_id = 'org_dev_a' and capability = 'module.write'");
    await app.inject({
      method: "POST",
      url: "/orgs/current/modules",
      headers: { authorization: `Bearer ${tokenA}` },
      payload: {},
    });
    await pool.query("delete from capability_grants where org_id = 'org_dev_a' and capability = 'admin.write'");
    await app.inject({
      method: "POST",
      url: "/orgs/current/nodes/node_does_not_exist/revoke",
      headers: { authorization: `Bearer ${tokenA}` },
    });
    await pool.query("delete from capability_grants where org_id = 'org_dev_b' and capability = 'module.write'");
    await app.inject({
      method: "POST",
      url: "/orgs/current/modules",
      headers: { authorization: `Bearer ${tokenB}` },
      payload: {},
    });

    const exportedA = await exportAudit(tokenA);
    expect(exportedA.statusCode).toBe(200);
    const bodyA = exportedA.json() as { entries: Array<{ id: number; action: string }>; chainValid: boolean };
    expect(bodyA.chainValid).toBe(true);
    expect(bodyA.entries.length).toBeGreaterThanOrEqual(2);
    const idsAscending = bodyA.entries.map((e) => e.id);
    expect(idsAscending).toEqual([...idsAscending].sort((a, b) => a - b));

    const exportedB = await exportAudit(tokenB);
    const bodyB = exportedB.json() as { entries: Array<{ id: number }>; chainValid: boolean };
    expect(bodyB.chainValid).toBe(true);

    const idsA = new Set(bodyA.entries.map((e) => e.id));
    const idsB = new Set(bodyB.entries.map((e) => e.id));
    for (const id of idsB) {
      expect(idsA.has(id)).toBe(false);
    }
  });
});

describe("Org-wide audit export - empty org (HARD-10)", () => {
  let pool: DbPool;
  let app: FastifyInstance;
  let token: string;

  beforeAll(async () => {
    pool = await freshDb("evoos_test_hardening_audit_export_empty");
    await seedDevData(pool);
    await seedDevGrants(pool);
    app = buildServer({ pool });
    const login = await app.inject({ method: "POST", url: "/auth/dev-login", payload: { email: "dev-a@evolutionos.local" } });
    token = login.json().token;
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it("returns an empty list with a vacuously valid chain for an org with zero entries", async () => {
    const res = await app.inject({ method: "GET", url: "/orgs/current/audit/export", headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ entries: [], chainValid: true });
  });
});
