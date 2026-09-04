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

async function registerProject(): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/projects",
    headers: { authorization: `Bearer ${tokenA}`, "idempotency-key": "prp-ready-setup" },
    payload: {
      apiVersion: "evolutionos.io/v1alpha1",
      kind: "EvolutionProject",
      metadata: { name: "Proj Ready", slug: "proj-prp-ready", type: "idea", status: "discovery" },
      spec: { intent: { problem: "x" } },
    },
  });
  return res.json().projectId;
}

async function addActiveEvidence(): Promise<string> {
  const created = await app.inject({
    method: "POST",
    url: `/projects/${projectId}/evidence`,
    headers: { authorization: `Bearer ${tokenA}` },
    payload: { type: "humanStatement", statement: `Evidência ${Math.random()}` },
  });
  const { evidenceId } = created.json();
  await app.inject({
    method: "POST",
    url: `/projects/${projectId}/evidence/${evidenceId}/activate`,
    headers: { authorization: `Bearer ${tokenA}` },
  });
  return evidenceId;
}

async function buildSignal(evidenceIds: string[]): Promise<string> {
  const clm = await app.inject({
    method: "POST",
    url: `/projects/${projectId}/claims`,
    headers: { authorization: `Bearer ${tokenA}` },
    payload: { statement: "x", epistemicType: "fact", evidenceIds },
  });
  const { claimId } = clm.json();
  const sig = await app.inject({
    method: "POST",
    url: `/projects/${projectId}/signals`,
    headers: { authorization: `Bearer ${tokenA}` },
    payload: { claimId },
  });
  return sig.json().signalId;
}

async function createDraft(body: Record<string, unknown>): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: `/projects/${projectId}/proposals`,
    headers: { authorization: `Bearer ${tokenA}` },
    payload: body,
  });
  return res.json().proposalId;
}

function moveReady(proposalId: string) {
  return app.inject({
    method: "POST",
    url: `/projects/${projectId}/proposals/${proposalId}/ready`,
    headers: { authorization: `Bearer ${tokenA}` },
  });
}

beforeAll(async () => {
  pool = await freshDb("evoos_test_proposal_ready");
  await seedDevData(pool);
  await seedDevGrants(pool);
  app = buildServer({ pool });
  const login = await app.inject({
    method: "POST",
    url: "/auth/dev-login",
    payload: { email: "dev-a@evolutionos.local" },
  });
  tokenA = login.json().token;
  projectId = await registerProject();
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

describe("proposal ready transition + Challenger (FLOW-13/14)", () => {
  it("a proposal with no do-nothing alternative and a single evidence source gains both findings and still moves to readyForReview", async () => {
    const e1 = await addActiveEvidence();
    const signalId = await buildSignal([e1]);
    const proposalId = await createDraft({
      title: "Adotar sem alternativa",
      summary: "y",
      proposalType: "adopt",
      alternatives: [{ id: "alt-1", type: "adopt" }],
      signalId,
    });

    const res = await moveReady(proposalId);
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("readyForReview");
    expect(res.json().challengerFindings).toEqual(
      expect.arrayContaining(["missing_do_nothing_alternative", "single_source_evidence"]),
    );

    const row = await pool.query("select status, challenger_findings from proposals where id = $1", [
      proposalId,
    ]);
    expect(row.rows[0].status).toBe("readyForReview");
    expect(row.rows[0].challenger_findings).toEqual(
      expect.arrayContaining(["missing_do_nothing_alternative", "single_source_evidence"]),
    );
  });

  it("a well-formed proposal (do-nothing, cost of inaction, multiple sources) moves to readyForReview with empty findings", async () => {
    const e1 = await addActiveEvidence();
    const e2 = await addActiveEvidence();
    const signalId = await buildSignal([e1, e2]);
    const proposalId = await createDraft({
      title: "Bem formada",
      summary: "y",
      proposalType: "adopt",
      costOfInaction: "Perda de vantagem competitiva.",
      alternatives: [
        { id: "alt-1", type: "adopt" },
        { id: "alt-2", type: "doNothing" },
      ],
      signalId,
    });

    const res = await moveReady(proposalId);
    expect(res.statusCode).toBe(200);
    expect(res.json().challengerFindings).toEqual([]);
  });

  it("moving an already-ready proposal to ready again is rejected 409", async () => {
    const e1 = await addActiveEvidence();
    const signalId = await buildSignal([e1]);
    const proposalId = await createDraft({
      title: "Duplo ready",
      summary: "y",
      proposalType: "adopt",
      signalId,
    });
    await moveReady(proposalId);

    const res = await moveReady(proposalId);
    expect(res.statusCode).toBe(409);
  });

  it("moving an unknown proposal to ready returns 404", async () => {
    const res = await moveReady("prp_unknown");
    expect(res.statusCode).toBe(404);
  });
});
