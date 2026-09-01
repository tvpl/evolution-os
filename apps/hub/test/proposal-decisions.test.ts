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
    headers: { authorization: `Bearer ${tokenA}`, "idempotency-key": `prp-dec-${slug}` },
    payload: {
      apiVersion: "evolutionos.io/v1alpha1",
      kind: "EvolutionProject",
      metadata: { name: `Proj ${slug}`, slug, type: "idea", status: "discovery" },
      spec: { intent: { problem: "x" } },
    },
  });
  return res.json().projectId;
}

async function createDraftProposal(target: string): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: `/projects/${target}/proposals`,
    headers: { authorization: `Bearer ${tokenA}` },
    payload: { title: "x", summary: "y", proposalType: "watch", investigationState: "investigating" },
  });
  return res.json().proposalId;
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
    payload: { statement: "x", epistemicType: "fact", evidenceIds: [evidenceId] },
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

function createProposalFromSignal(target: string, signalId: string, title: string) {
  return app.inject({
    method: "POST",
    url: `/projects/${target}/proposals`,
    headers: { authorization: `Bearer ${tokenA}` },
    payload: { title, summary: "y", proposalType: "adopt", signalId },
  });
}

function decide(target: string, body: Record<string, unknown>) {
  return app.inject({
    method: "POST",
    url: `/projects/${target}/decisions`,
    headers: { authorization: `Bearer ${tokenA}` },
    payload: body,
  });
}

beforeAll(async () => {
  pool = await freshDb("evoos_test_proposal_decisions");
  await seedDevData(pool);
  await seedDevGrants(pool);
  app = buildServer({ pool });
  const login = await app.inject({
    method: "POST",
    url: "/auth/dev-login",
    payload: { email: "dev-a@evolutionos.local" },
  });
  tokenA = login.json().token;
  projectId = await registerProject("proj-prp-dec");
  otherProjectId = await registerProject("proj-prp-dec-other");
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

describe("decision guard extended to proposal subjects (FLOW-17/18)", () => {
  it("a reject decision on a proposal persists via the existing decision endpoint", async () => {
    const proposalId = await createDraftProposal(projectId);
    const res = await decide(projectId, {
      decision: "reject",
      rationale: "Custo maior que o benefício.",
      subjectType: "proposal",
      subjectId: proposalId,
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().decision).toMatchObject({ decision: "reject", subjectType: "proposal", subjectId: proposalId });

    const row = await pool.query("select subject_type, subject_id from decisions where subject_id = $1", [
      proposalId,
    ]);
    expect(row.rows[0]).toEqual({ subject_type: "proposal", subject_id: proposalId });
  });

  it("a later decision on the same proposal surfaces the prior rejected decision in priorRelatedDecisions", async () => {
    const proposalId = await createDraftProposal(projectId);
    await decide(projectId, {
      decision: "reject",
      rationale: "Não é prioridade agora.",
      subjectType: "proposal",
      subjectId: proposalId,
    });

    const res = await decide(projectId, {
      decision: "investigate",
      rationale: "Revisitando com novos dados.",
      subjectType: "proposal",
      subjectId: proposalId,
    });
    expect(res.statusCode).toBe(201);
    const prior = res.json().priorRelatedDecisions;
    expect(prior).toHaveLength(1);
    expect(prior[0]).toMatchObject({ decision: "reject", subjectId: proposalId });
  });

  it("a decision referencing a proposal from another project is rejected 422", async () => {
    const foreignProposalId = await createDraftProposal(otherProjectId);
    const res = await decide(projectId, {
      decision: "reject",
      rationale: "x",
      subjectType: "proposal",
      subjectId: foreignProposalId,
    });
    expect(res.statusCode).toBe(422);
  });

  it("creating a new proposal from a signal whose prior proposal was rejected surfaces that rejection, but not an unrelated accept (FLOW-18)", async () => {
    const signalId = await buildSignal(projectId);
    const firstRes = await createProposalFromSignal(projectId, signalId, "Primeira tentativa");
    const firstProposalId = firstRes.json().proposalId;
    expect(firstRes.json().priorRelatedDecisions).toEqual([]);

    await decide(projectId, {
      decision: "reject",
      rationale: "Ainda não é prioridade.",
      subjectType: "proposal",
      subjectId: firstProposalId,
    });

    const acceptedRes = await createProposalFromSignal(projectId, signalId, "Aceita à parte");
    const acceptedProposalId = acceptedRes.json().proposalId;
    await decide(projectId, {
      decision: "accept",
      rationale: "Essa outra foi aceita.",
      subjectType: "proposal",
      subjectId: acceptedProposalId,
    });

    const thirdRes = await createProposalFromSignal(projectId, signalId, "Terceira tentativa");
    expect(thirdRes.statusCode).toBe(201);
    const prior = thirdRes.json().priorRelatedDecisions;
    expect(prior).toHaveLength(1);
    expect(prior.map((d: { decision: string }) => d.decision)).toEqual(["reject"]);
    expect(prior[0]).toMatchObject({ decision: "reject", subjectId: firstProposalId });
  });

  it("creating a proposal from a signal with no prior rejection returns an empty priorRelatedDecisions", async () => {
    const signalId = await buildSignal(projectId);
    const res = await createProposalFromSignal(projectId, signalId, "Sem histórico");
    expect(res.json().priorRelatedDecisions).toEqual([]);
  });

  it("decisions listing includes proposal-subject decisions", async () => {
    const proposalId = await createDraftProposal(projectId);
    await decide(projectId, {
      decision: "accept",
      rationale: "x",
      subjectType: "proposal",
      subjectId: proposalId,
    });
    const res = await app.inject({
      method: "GET",
      url: `/projects/${projectId}/decisions`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    const found = res.json().decisions.find((d: { subjectId: string }) => d.subjectId === proposalId);
    expect(found).toMatchObject({ decision: "accept", subjectType: "proposal" });
  });
});
