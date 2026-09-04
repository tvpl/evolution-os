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
    headers: { authorization: `Bearer ${tokenA}`, "idempotency-key": "xpr-close-setup" },
    payload: {
      apiVersion: "evolutionos.io/v1alpha1",
      kind: "EvolutionProject",
      metadata: { name: "Proj Experiment Close", slug: "proj-xpr-close", type: "idea", status: "discovery" },
      spec: { intent: { problem: "x" } },
    },
  });
  return res.json().projectId;
}

async function createRunningExperiment(): Promise<{ experimentId: string; proposalId: string }> {
  const created = await app.inject({
    method: "POST",
    url: `/projects/${projectId}/proposals`,
    headers: { authorization: `Bearer ${tokenA}` },
    payload: { title: "x", summary: "y", proposalType: "experiment", investigationState: "investigating" },
  });
  const { proposalId } = created.json();
  await app.inject({
    method: "POST",
    url: `/projects/${projectId}/proposals/${proposalId}/ready`,
    headers: { authorization: `Bearer ${tokenA}` },
  });
  const started = await app.inject({
    method: "POST",
    url: `/projects/${projectId}/proposals/${proposalId}/experiments`,
    headers: { authorization: `Bearer ${tokenA}` },
    payload: {
      variants: [
        { id: "control", name: "Baseline" },
        { id: "candidate", name: "Nova" },
      ],
      verificationPlan: {
        hypothesis: "x",
        baselineMetric: "metric",
        threshold: 100,
        comparison: "lte",
        observationWindow: "7d",
      },
    },
  });
  return { experimentId: started.json().experimentId, proposalId };
}

async function evaluated(): Promise<{ experimentId: string; proposalId: string }> {
  const { experimentId, proposalId } = await createRunningExperiment();
  await app.inject({
    method: "POST",
    url: `/projects/${projectId}/experiments/${experimentId}/evaluate`,
    headers: { authorization: `Bearer ${tokenA}` },
    payload: { observedValue: 50 },
  });
  return { experimentId, proposalId };
}

function decide(proposalId: string, body: Record<string, unknown>) {
  return app.inject({
    method: "POST",
    url: `/projects/${projectId}/decisions`,
    headers: { authorization: `Bearer ${tokenA}` },
    payload: { subjectType: "proposal", subjectId: proposalId, ...body },
  });
}

function close(experimentId: string, body: Record<string, unknown>) {
  return app.inject({
    method: "POST",
    url: `/projects/${projectId}/experiments/${experimentId}/close`,
    headers: { authorization: `Bearer ${tokenA}` },
    payload: body,
  });
}

beforeAll(async () => {
  pool = await freshDb("evoos_test_experiments_close");
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

describe("experiment closure with outcome decision (EXP-13/14/15)", () => {
  it("closing an evaluated experiment records the decision via the existing mechanism and closes both rows", async () => {
    const { experimentId, proposalId } = await evaluated();
    const res = await close(experimentId, { decision: "accept", rationale: "Hipótese confirmada." });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("closed");
    expect(res.json().decision).toMatchObject({
      decision: "accept",
      subjectType: "proposal",
      subjectId: proposalId,
    });

    const expRow = await pool.query("select status from experiments where id = $1", [experimentId]);
    expect(expRow.rows[0].status).toBe("closed");
    const propRow = await pool.query("select status from proposals where id = $1", [proposalId]);
    expect(propRow.rows[0].status).toBe("closed");

    const decisionRow = await pool.query(
      "select subject_type, subject_id from decisions where subject_id = $1",
      [proposalId],
    );
    expect(decisionRow.rows[0]).toEqual({ subject_type: "proposal", subject_id: proposalId });
  });

  it("closing a running (not yet evaluated) experiment is rejected 409", async () => {
    const { experimentId } = await createRunningExperiment();
    const res = await close(experimentId, { decision: "accept", rationale: "x" });
    expect(res.statusCode).toBe(409);
  });

  it("closing an unknown experiment returns 404", async () => {
    const res = await close("xpr_unknown", { decision: "accept", rationale: "x" });
    expect(res.statusCode).toBe(404);
  });

  it("closing without decision or rationale is rejected 422", async () => {
    const { experimentId } = await evaluated();
    const res = await close(experimentId, { decision: "accept" });
    expect(res.statusCode).toBe(422);
  });

  it("closing surfaces a decision recorded earlier on the same proposal", async () => {
    const created = await app.inject({
      method: "POST",
      url: `/projects/${projectId}/proposals`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { title: "x", summary: "y", proposalType: "experiment", investigationState: "investigating" },
    });
    const { proposalId } = created.json();
    await app.inject({
      method: "POST",
      url: `/projects/${projectId}/proposals/${proposalId}/ready`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    // A decision recorded earlier via the generic decisions endpoint (Slice 1/3) does not
    // change the proposal's status, so the experiment can still be started on it.
    await decide(proposalId, { decision: "defer", rationale: "Ainda sem contexto suficiente." });

    const started = await app.inject({
      method: "POST",
      url: `/projects/${projectId}/proposals/${proposalId}/experiments`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: {
        variants: [
          { id: "control", name: "Baseline" },
          { id: "candidate", name: "Nova" },
        ],
        verificationPlan: {
          hypothesis: "x",
          baselineMetric: "metric",
          threshold: 100,
          comparison: "lte",
          observationWindow: "7d",
        },
      },
    });
    const { experimentId } = started.json();
    await app.inject({
      method: "POST",
      url: `/projects/${projectId}/experiments/${experimentId}/evaluate`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { observedValue: 50 },
    });

    const res = await close(experimentId, { decision: "accept", rationale: "Experimento confirmou a hipótese." });
    expect(res.statusCode).toBe(200);
    const prior = res.json().priorRelatedDecisions;
    expect(prior).toHaveLength(1);
    expect(prior[0]).toMatchObject({ decision: "defer", subjectId: proposalId });
  });

  it("closing is denied cross-tenant", async () => {
    const { experimentId } = await evaluated();
    const loginB = await app.inject({
      method: "POST",
      url: "/auth/dev-login",
      payload: { email: "dev-b@evolutionos.local" },
    });
    const res = await app.inject({
      method: "POST",
      url: `/projects/${projectId}/experiments/${experimentId}/close`,
      headers: { authorization: `Bearer ${loginB.json().token}` },
      payload: { decision: "accept", rationale: "x" },
    });
    expect(res.statusCode).toBe(403);
  });
});
