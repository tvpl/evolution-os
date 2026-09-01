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
let projectId: string;
let otherProjectId: string;

async function registerProject(slug: string): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/projects",
    headers: { authorization: `Bearer ${tokenA}`, "idempotency-key": `clm-${slug}` },
    payload: {
      apiVersion: "evolutionos.io/v1alpha1",
      kind: "EvolutionProject",
      metadata: { name: `Proj ${slug}`, slug, type: "idea", status: "discovery" },
      spec: { intent: { problem: "x" } },
    },
  });
  return res.json().projectId;
}

async function addEvidence(target: string, activate = true): Promise<string> {
  const created = await app.inject({
    method: "POST",
    url: `/projects/${target}/evidence`,
    headers: { authorization: `Bearer ${tokenA}` },
    payload: { type: "humanStatement", statement: `Evidência ${Math.random()}` },
  });
  const { evidenceId } = created.json();
  if (activate) {
    await app.inject({
      method: "POST",
      url: `/projects/${target}/evidence/${evidenceId}/activate`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
  }
  return evidenceId;
}

function createClaim(body: Record<string, unknown>) {
  return app.inject({
    method: "POST",
    url: `/projects/${projectId}/claims`,
    headers: { authorization: `Bearer ${tokenA}` },
    payload: body,
  });
}

beforeAll(async () => {
  pool = await freshDb("evoos_test_claims");
  await seedDevData(pool);
  await seedDevGrants(pool);
  app = buildServer({ pool });
  const login = await app.inject({
    method: "POST",
    url: "/auth/dev-login",
    payload: { email: "dev-a@evolutionos.local" },
  });
  tokenA = login.json().token;
  projectId = await registerProject("proj-clm");
  otherProjectId = await registerProject("proj-clm-other");
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

describe("claims with many-to-many evidence (FLOW-05/06/07/08)", () => {
  it("a claim referencing two active evidence records persists with both", async () => {
    const e1 = await addEvidence(projectId);
    const e2 = await addEvidence(projectId);
    const res = await createClaim({
      statement: "O framework está em declínio de adoção.",
      epistemicType: "inference",
      evidenceIds: [e1, e2],
    });
    expect(res.statusCode).toBe(201);
    const { claimId } = res.json();

    const list = await app.inject({
      method: "GET",
      url: `/projects/${projectId}/claims`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    const found = list.json().claims.find((c: { id: string }) => c.id === claimId);
    expect(found.evidenceIds.sort()).toEqual([e1, e2].sort());
    expect(found.epistemicType).toBe("inference");
  });

  it("a claim referencing quarantined evidence is rejected 422 without persisting", async () => {
    const quarantined = await addEvidence(projectId, false);
    const before = await pool.query("select count(*)::int as n from claims where project_id = $1", [
      projectId,
    ]);
    const res = await createClaim({
      statement: "Não deveria persistir",
      epistemicType: "fact",
      evidenceIds: [quarantined],
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().title).toBe("evidence_not_active");
    const after = await pool.query("select count(*)::int as n from claims where project_id = $1", [
      projectId,
    ]);
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });

  it("a claim referencing evidence from another project is rejected 422", async () => {
    const foreignEvidence = await addEvidence(otherProjectId);
    const res = await createClaim({
      statement: "x",
      epistemicType: "fact",
      evidenceIds: [foreignEvidence],
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().title).toBe("invalid_evidence_reference");
  });

  it("a claim with zero evidence is rejected 422 (edge case)", async () => {
    const res = await createClaim({ statement: "sem evidência", epistemicType: "hypothesis", evidenceIds: [] });
    expect(res.statusCode).toBe(422);
    expect(res.json().title).toBe("claim_requires_evidence");
  });

  it("a claim without statement or epistemicType is rejected 422", async () => {
    const res = await createClaim({ evidenceIds: ["evd_x"] });
    expect(res.statusCode).toBe(422);
  });

  it("if one referenced evidence is invalid, no claim_evidence row is created for the others either (atomicity)", async () => {
    const valid = await addEvidence(projectId);
    const before = await pool.query(
      "select count(*)::int as n from claim_evidence where evidence_id = $1",
      [valid],
    );
    await createClaim({
      statement: "mistura válida com inválida",
      epistemicType: "fact",
      evidenceIds: [valid, "evd_does_not_exist"],
    });
    const after = await pool.query(
      "select count(*)::int as n from claim_evidence where evidence_id = $1",
      [valid],
    );
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });

  it("claims listing is denied cross-tenant", async () => {
    const loginB = await app.inject({
      method: "POST",
      url: "/auth/dev-login",
      payload: { email: "dev-b@evolutionos.local" },
    });
    const res = await app.inject({
      method: "GET",
      url: `/projects/${projectId}/claims`,
      headers: { authorization: `Bearer ${loginB.json().token}` },
    });
    expect(res.statusCode).toBe(403);
  });
});
