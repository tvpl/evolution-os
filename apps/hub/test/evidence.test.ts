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
    const row = await pool.query("select type, status, content_digest from evidence where id = $1", [
      res.json().evidenceId,
    ]);
    expect(row.rows[0].type).toBe("humanStatement");
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
    const row = await pool.query("select type, source_reference, source_type from evidence where id = $1", [
      res.json().evidenceId,
    ]);
    expect(row.rows[0]).toEqual({
      type: "referenceOnly",
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

  it("listing returns each evidence's actual current status and digest", async () => {
    const quarantined = await createEvidence({ type: "humanStatement", statement: "Ainda em quarentena." });
    const { evidenceId: quarantinedId } = quarantined.json();
    const activated = await createEvidence({ type: "humanStatement", statement: "Vai ser ativada." });
    const { evidenceId: activatedId } = activated.json();
    await app.inject({
      method: "POST",
      url: `/projects/${projectId}/evidence/${activatedId}/activate`,
      headers: { authorization: `Bearer ${tokenA}` },
    });

    const res = await app.inject({
      method: "GET",
      url: `/projects/${projectId}/evidence`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(res.statusCode).toBe(200);
    const { evidence } = res.json();
    expect(evidence.length).toBeGreaterThanOrEqual(3);
    for (const e of evidence) {
      expect(e.contentDigest).toMatch(/^sha256:/);
    }
    const quarantinedItem = evidence.find((e: { id: string }) => e.id === quarantinedId);
    const activatedItem = evidence.find((e: { id: string }) => e.id === activatedId);
    expect(quarantinedItem.status).toBe("quarantine");
    expect(activatedItem.status).toBe("active");
  });

  it("two evidences with identical content are both created without error (dedup out of scope)", async () => {
    const sameContent = `Conteúdo duplicado ${Math.random()}`;
    const first = await createEvidence({ type: "humanStatement", statement: sameContent });
    const second = await createEvidence({ type: "humanStatement", statement: sameContent });
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect(first.json().evidenceId).not.toBe(second.json().evidenceId);

    const rows = await pool.query("select content_digest from evidence where id = any($1)", [
      [first.json().evidenceId, second.json().evidenceId],
    ]);
    expect(rows.rows[0].content_digest).toBe(rows.rows[1].content_digest);
  });

  it("the status column accepts source_unavailable so a future slice can flag stale evidence", async () => {
    const created = await createEvidence({ type: "referenceOnly", sourceReference: "https://example.com/gone" });
    const { evidenceId } = created.json();
    await pool.query("update evidence set status = 'source_unavailable' where id = $1", [evidenceId]);

    const res = await app.inject({
      method: "GET",
      url: `/projects/${projectId}/evidence`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    const item = res.json().evidence.find((e: { id: string }) => e.id === evidenceId);
    expect(item.status).toBe("source_unavailable");
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
