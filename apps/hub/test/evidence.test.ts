import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { freshDb } from "./helpers.js";
import { buildServer } from "../src/server.js";
import { seedDevData } from "../src/identity/seed.js";
import { seedDevGrants } from "../src/policy/policy.js";
import type { DbPool } from "../src/platform/db.js";

let pool: DbPool;
let app: FastifyInstance;
let tokenA: string;
let tokenB: string;
let projectId: string;

async function registerProject(): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/projects",
    headers: { authorization: `Bearer ${tokenA}`, "idempotency-key": "evd-setup" },
    payload: {
      apiVersion: "evolutionos.io/v1alpha1",
      kind: "EvolutionProject",
      metadata: { name: "Proj Evidence", slug: "proj-evd", type: "idea", status: "discovery" },
      spec: { intent: { problem: "x" } },
    },
  });
  return res.json().projectId;
}

function createEvidence(body: Record<string, unknown>) {
  return app.inject({
    method: "POST",
    url: `/projects/${projectId}/evidence`,
    headers: { authorization: `Bearer ${tokenA}` },
    payload: body,
  });
}

beforeAll(async () => {
  pool = await freshDb("evoos_test_evidence");
  await seedDevData(pool);
  await seedDevGrants(pool);
  app = buildServer({ pool });
  const loginA = await app.inject({
    method: "POST",
    url: "/auth/dev-login",
    payload: { email: "dev-a@evolutionos.local" },
  });
  tokenA = loginA.json().token;
  const loginB = await app.inject({
    method: "POST",
    url: "/auth/dev-login",
    payload: { email: "dev-b@evolutionos.local" },
  });
  tokenB = loginB.json().token;
  projectId = await registerProject();
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

describe("evidence quarantine and activation (FLOW-01/02/03/04)", () => {
  it("creates a manual statement evidence in quarantine with a digest", async () => {
    const res = await createEvidence({ type: "humanStatement", statement: "O concorrente lançou a feature X." });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ evidenceId: expect.stringMatching(/^evd_/), status: "quarantine" });
    const row = await pool.query("select status, content_digest from evidence where id = $1", [
      res.json().evidenceId,
    ]);
    expect(row.rows[0].status).toBe("quarantine");
    expect(row.rows[0].content_digest).toMatch(/^sha256:/);
  });

  it("creates a URL-reference evidence without fetching its content", async () => {
    const res = await createEvidence({
      type: "referenceOnly",
      sourceReference: "https://example.com/announcement",
      sourceType: "url",
    });
    expect(res.statusCode).toBe(201);
    const row = await pool.query("select source_reference, source_type from evidence where id = $1", [
      res.json().evidenceId,
    ]);
    expect(row.rows[0]).toEqual({
      source_reference: "https://example.com/announcement",
      source_type: "url",
    });
  });

  it("activating a quarantined evidence transitions it to active preserving the same digest", async () => {
    const created = await createEvidence({ type: "humanStatement", statement: "Framework X entrou em EOL." });
    const { evidenceId } = created.json();
    const before = await pool.query("select content_digest from evidence where id = $1", [evidenceId]);

    const res = await app.inject({
      method: "POST",
      url: `/projects/${projectId}/evidence/${evidenceId}/activate`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ evidenceId, status: "active" });

    const after = await pool.query("select status, content_digest from evidence where id = $1", [
      evidenceId,
    ]);
    expect(after.rows[0].status).toBe("active");
    expect(after.rows[0].content_digest).toBe(before.rows[0].content_digest);
  });

  it("submission without statement or sourceReference is rejected 422 without creating a row", async () => {
    const before = await pool.query("select count(*)::int as n from evidence where project_id = $1", [
      projectId,
    ]);
    const res = await createEvidence({ type: "humanStatement" });
    expect(res.statusCode).toBe(422);
    const after = await pool.query("select count(*)::int as n from evidence where project_id = $1", [
      projectId,
    ]);
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });

  it("submission without a type is rejected 422", async () => {
    const res = await createEvidence({ statement: "sem tipo" });
    expect(res.statusCode).toBe(422);
  });

  it("listing returns status and digest for every evidence", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/projects/${projectId}/evidence`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(res.statusCode).toBe(200);
    const { evidence } = res.json();
    expect(evidence.length).toBeGreaterThanOrEqual(3);
    for (const e of evidence) {
      expect(e).toHaveProperty("status");
      expect(e.contentDigest).toMatch(/^sha256:/);
    }
  });

  it("activating unknown evidence returns 404", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/projects/${projectId}/evidence/evd_unknown/activate`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it("evidence listing is denied cross-tenant", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/projects/${projectId}/evidence`,
      headers: { authorization: `Bearer ${tokenB}` },
    });
    expect(res.statusCode).toBe(403);
  });
});
