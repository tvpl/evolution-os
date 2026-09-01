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
let signalId: string;

async function registerProject(slug: string): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/projects",
    headers: { authorization: `Bearer ${tokenA}`, "idempotency-key": `prp-${slug}` },
    payload: {
      apiVersion: "evolutionos.io/v1alpha1",
      kind: "EvolutionProject",
      metadata: { name: `Proj ${slug}`, slug, type: "idea", status: "discovery" },
      spec: { intent: { problem: "x" } },
    },
  });
  return res.json().projectId;
}

async function buildSignal(target: string): Promise<string> {
  const evd = await app.inject({
    method: "POST",
    url: `/projects/${target}/evidence`,
    headers: { authorization: `Bearer ${tokenA}` },
    payload: { type: "humanStatement", statement: `Evidência ${Math.random()}` },
  });
  const { evidenceId } = evd.json();
  await app.inject({
    method: "POST",
    url: `/projects/${target}/evidence/${evidenceId}/activate`,
    headers: { authorization: `Bearer ${tokenA}` },
  });
  const clm = await app.inject({
    method: "POST",
    url: `/projects/${target}/claims`,
    headers: { authorization: `Bearer ${tokenA}` },
    payload: { statement: "x", epistemicType: "inference", evidenceIds: [evidenceId] },
  });
  const { claimId } = clm.json();
  const sig = await app.inject({
    method: "POST",
    url: `/projects/${target}/signals`,
    headers: { authorization: `Bearer ${tokenA}` },
    payload: { claimId },
  });
  return sig.json().signalId;
}

function createProposal(target: string, body: Record<string, unknown>) {
  return app.inject({
    method: "POST",
    url: `/projects/${target}/proposals`,
    headers: { authorization: `Bearer ${tokenA}` },
    payload: body,
  });
}

beforeAll(async () => {
  pool = await freshDb("evoos_test_proposals");
  await seedDevData(pool);
  await seedDevGrants(pool);
  app = buildServer({ pool });
  const login = await app.inject({
    method: "POST",
    url: "/auth/dev-login",
    payload: { email: "dev-a@evolutionos.local" },
  });
  tokenA = login.json().token;
  projectId = await registerProject("proj-prp");
  otherProjectId = await registerProject("proj-prp-other");
  signalId = await buildSignal(projectId);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

describe("proposals — draft creation (FLOW-12/15)", () => {
  it("a well-formed proposal with a do-nothing alternative persists as draft", async () => {
    const res = await createProposal(projectId, {
      title: "Adotar biblioteca X",
      summary: "Reduz manutenção própria.",
      proposalType: "adopt",
      whyNow: "Concorrente já adotou.",
      costOfInaction: "Débito técnico crescente.",
      alternatives: [
        { id: "alt-1", type: "adopt", title: "Adotar" },
        { id: "alt-2", type: "doNothing", title: "Não fazer nada" },
      ],
      recommendedAlternativeId: "alt-1",
      signalId,
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({
      proposalId: expect.stringMatching(/^prp_/),
      status: "draft",
      priorRelatedDecisions: [],
    });

    const row = await pool.query(
      `select status, alternatives, why_now as "whyNow", cost_of_inaction as "costOfInaction",
              recommended_alternative_id as "recommendedAlternativeId"
         from proposals where id = $1`,
      [res.json().proposalId],
    );
    expect(row.rows[0].status).toBe("draft");
    expect(row.rows[0].alternatives).toEqual([
      { id: "alt-1", type: "adopt", title: "Adotar" },
      { id: "alt-2", type: "doNothing", title: "Não fazer nada" },
    ]);
    expect(row.rows[0].whyNow).toBe("Concorrente já adotou.");
    expect(row.rows[0].costOfInaction).toBe("Débito técnico crescente.");
    expect(row.rows[0].recommendedAlternativeId).toBe("alt-1");
  });

  it("a proposal with no signal and no investigationState is rejected 422", async () => {
    const res = await createProposal(projectId, {
      title: "x",
      summary: "y",
      proposalType: "adopt",
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().title).toBe("proposal_requires_evidence");
  });

  it("an explicit investigationState alone is enough to satisfy the invariant", async () => {
    const res = await createProposal(projectId, {
      title: "x",
      summary: "y",
      proposalType: "watch",
      investigationState: "investigating",
    });
    expect(res.statusCode).toBe(201);
  });

  it("a proposal referencing a signal from another project is rejected 422", async () => {
    const foreignSignal = await buildSignal(otherProjectId);
    const res = await createProposal(projectId, {
      title: "x",
      summary: "y",
      proposalType: "adopt",
      signalId: foreignSignal,
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().title).toBe("invalid_signal_reference");
  });

  it("a proposal missing required fields is rejected 422", async () => {
    const res = await createProposal(projectId, { signalId });
    expect(res.statusCode).toBe(422);
  });

  it("listing returns proposals for the project", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/projects/${projectId}/proposals`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().proposals.length).toBeGreaterThanOrEqual(2);
  });

  it("proposals listing is denied cross-tenant", async () => {
    const loginB = await app.inject({
      method: "POST",
      url: "/auth/dev-login",
      payload: { email: "dev-b@evolutionos.local" },
    });
    const res = await app.inject({
      method: "GET",
      url: `/projects/${projectId}/proposals`,
      headers: { authorization: `Bearer ${loginB.json().token}` },
    });
    expect(res.statusCode).toBe(403);
  });
});
