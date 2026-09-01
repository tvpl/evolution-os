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
    headers: { authorization: `Bearer ${tokenA}`, "idempotency-key": "xpr-start-setup" },
    payload: {
      apiVersion: "evolutionos.io/v1alpha1",
      kind: "EvolutionProject",
      metadata: { name: "Proj Experiment Start", slug: "proj-xpr-start", type: "idea", status: "discovery" },
      spec: { intent: { problem: "x" } },
    },
  });
  return res.json().projectId;
}

async function createReadyProposal(title = "x"): Promise<string> {
  const created = await app.inject({
    method: "POST",
    url: `/projects/${projectId}/proposals`,
    headers: { authorization: `Bearer ${tokenA}` },
    payload: { title, summary: "y", proposalType: "experiment", investigationState: "investigating" },
  });
  const { proposalId } = created.json();
  await app.inject({
    method: "POST",
    url: `/projects/${projectId}/proposals/${proposalId}/ready`,
    headers: { authorization: `Bearer ${tokenA}` },
  });
  return proposalId;
}

const validVariants = [
  { id: "control", name: "Baseline atual" },
  { id: "candidate", name: "Nova abordagem" },
];
const validPlan = {
  hypothesis: "A nova abordagem reduz latência em 20%.",
  baselineMetric: "p95_latency_ms",
  threshold: 100,
  comparison: "lte",
  observationWindow: "7d",
};

function startExperiment(proposalId: string, body: Record<string, unknown>) {
  return app.inject({
    method: "POST",
    url: `/projects/${projectId}/proposals/${proposalId}/experiments`,
    headers: { authorization: `Bearer ${tokenA}` },
    payload: body,
  });
}

beforeAll(async () => {
  pool = await freshDb("evoos_test_experiments_start");
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

describe("start experiment from a ready-for-review proposal (EXP-01/02/03/04)", () => {
  it("starts running with 2 variants and a complete plan, capturing a digest, and moves the proposal to executing", async () => {
    const proposalId = await createReadyProposal();
    const res = await startExperiment(proposalId, { variants: validVariants, verificationPlan: validPlan });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.status).toBe("running");
    expect(body.proposalDigest).toMatch(/^sha256:/);

    const experimentRow = await pool.query("select status, proposal_digest as \"proposalDigest\" from experiments where id = $1", [
      body.experimentId,
    ]);
    expect(experimentRow.rows[0].status).toBe("running");
    expect(experimentRow.rows[0].proposalDigest).toBe(body.proposalDigest);

    const proposalRow = await pool.query("select status from proposals where id = $1", [proposalId]);
    expect(proposalRow.rows[0].status).toBe("executing");
  });

  it("rejects a variants array with fewer than 2 items, without creating a row", async () => {
    const proposalId = await createReadyProposal();
    const before = await pool.query("select count(*)::int as n from experiments where proposal_id = $1", [
      proposalId,
    ]);
    const res = await startExperiment(proposalId, {
      variants: [{ id: "only-one", name: "x" }],
      verificationPlan: validPlan,
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().title).toBe("invalid_variants");
    const after = await pool.query("select count(*)::int as n from experiments where proposal_id = $1", [
      proposalId,
    ]);
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });

  it("rejects a variants array with more than 2 items, without creating a row", async () => {
    const proposalId = await createReadyProposal();
    const res = await startExperiment(proposalId, {
      variants: [
        { id: "control", name: "Baseline" },
        { id: "candidate-a", name: "A" },
        { id: "candidate-b", name: "B" },
      ],
      verificationPlan: validPlan,
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().title).toBe("invalid_variants");
  });

  it.each(["hypothesis", "baselineMetric", "threshold", "comparison", "observationWindow"])(
    "rejects a verification plan missing '%s', without creating a row",
    async (missingField) => {
      const proposalId = await createReadyProposal();
      const incompletePlan = { ...validPlan };
      delete (incompletePlan as Record<string, unknown>)[missingField];
      const before = await pool.query("select count(*)::int as n from experiments where proposal_id = $1", [
        proposalId,
      ]);
      const res = await startExperiment(proposalId, { variants: validVariants, verificationPlan: incompletePlan });
      expect(res.statusCode).toBe(422);
      expect(res.json().title).toBe("invalid_verification_plan");
      const after = await pool.query("select count(*)::int as n from experiments where proposal_id = $1", [
        proposalId,
      ]);
      expect(after.rows[0].n).toBe(before.rows[0].n);
    },
  );

  it("rejects a verification plan with an invalid comparison value", async () => {
    const proposalId = await createReadyProposal();
    const res = await startExperiment(proposalId, {
      variants: validVariants,
      verificationPlan: { ...validPlan, comparison: "eq" },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().title).toBe("invalid_verification_plan");
  });

  it("rejects starting an experiment on a proposal that is not readyForReview", async () => {
    const draft = await app.inject({
      method: "POST",
      url: `/projects/${projectId}/proposals`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { title: "x", summary: "y", proposalType: "watch", investigationState: "investigating" },
    });
    const { proposalId } = draft.json();
    const res = await startExperiment(proposalId, { variants: validVariants, verificationPlan: validPlan });
    expect(res.statusCode).toBe(409);
  });

  it("returns 404 for a proposal that does not exist in the project", async () => {
    const res = await startExperiment("prp_unknown", { variants: validVariants, verificationPlan: validPlan });
    expect(res.statusCode).toBe(404);
  });

  it("two experiments started from different proposals with the same content produce the same digest", async () => {
    const p1 = await createReadyProposal("Mesmo conteúdo");
    const p2 = await createReadyProposal("Mesmo conteúdo");
    const r1 = await startExperiment(p1, { variants: validVariants, verificationPlan: validPlan });
    const r2 = await startExperiment(p2, { variants: validVariants, verificationPlan: validPlan });
    expect(r1.json().proposalDigest).toBe(r2.json().proposalDigest);
  });

  it("GET returns the experiment and 404s for an unknown one", async () => {
    const proposalId = await createReadyProposal();
    const started = await startExperiment(proposalId, { variants: validVariants, verificationPlan: validPlan });
    const { experimentId } = started.json();

    const res = await app.inject({
      method: "GET",
      url: `/projects/${projectId}/experiments/${experimentId}`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().proposalId).toBe(proposalId);
    expect(res.json().variants).toEqual(validVariants);
    expect(res.json().verificationPlan).toEqual(validPlan);

    const missing = await app.inject({
      method: "GET",
      url: `/projects/${projectId}/experiments/xpr_unknown`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(missing.statusCode).toBe(404);
  });

  it("starting an experiment is denied cross-tenant", async () => {
    const proposalId = await createReadyProposal();
    const loginB = await app.inject({
      method: "POST",
      url: "/auth/dev-login",
      payload: { email: "dev-b@evolutionos.local" },
    });
    const res = await app.inject({
      method: "POST",
      url: `/projects/${projectId}/proposals/${proposalId}/experiments`,
      headers: { authorization: `Bearer ${loginB.json().token}` },
      payload: { variants: validVariants, verificationPlan: validPlan },
    });
    expect(res.statusCode).toBe(403);
  });

  it("GET experiment is denied cross-tenant", async () => {
    const proposalId = await createReadyProposal();
    const started = await startExperiment(proposalId, { variants: validVariants, verificationPlan: validPlan });
    const { experimentId } = started.json();
    const loginB = await app.inject({
      method: "POST",
      url: "/auth/dev-login",
      payload: { email: "dev-b@evolutionos.local" },
    });
    const res = await app.inject({
      method: "GET",
      url: `/projects/${projectId}/experiments/${experimentId}`,
      headers: { authorization: `Bearer ${loginB.json().token}` },
    });
    expect(res.statusCode).toBe(403);
  });
});
