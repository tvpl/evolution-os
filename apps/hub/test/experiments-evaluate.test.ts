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
    headers: { authorization: `Bearer ${tokenA}`, "idempotency-key": "xpr-eval-setup" },
    payload: {
      apiVersion: "evolutionos.io/v1alpha1",
      kind: "EvolutionProject",
      metadata: { name: "Proj Experiment Evaluate", slug: "proj-xpr-eval", type: "idea", status: "discovery" },
      spec: { intent: { problem: "x" } },
    },
  });
  return res.json().projectId;
}

async function createRunningExperiment(threshold = 100, comparison: "gte" | "lte" = "lte"): Promise<string> {
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
        threshold,
        comparison,
        observationWindow: "7d",
      },
    },
  });
  return started.json().experimentId;
}

function evaluate(experimentId: string, body: Record<string, unknown>) {
  return app.inject({
    method: "POST",
    url: `/projects/${projectId}/experiments/${experimentId}/evaluate`,
    headers: { authorization: `Bearer ${tokenA}` },
    payload: body,
  });
}

beforeAll(async () => {
  pool = await freshDb("evoos_test_experiments_evaluate");
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

describe("experiment evaluation (EXP-08/09/10/11/12)", () => {
  it("an observed value satisfying the threshold produces hypothesis_met and status=evaluated", async () => {
    const experimentId = await createRunningExperiment(100, "lte");
    const res = await evaluate(experimentId, { observedValue: 90 });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      experimentId,
      status: "evaluated",
      verdict: "hypothesis_met",
      rationale: expect.any(String),
    });

    const row = await pool.query(
      "select status, verdict, observed_value as \"observedValue\" from experiments where id = $1",
      [experimentId],
    );
    expect(row.rows[0].status).toBe("evaluated");
    expect(row.rows[0].verdict).toBe("hypothesis_met");
    expect(row.rows[0].observedValue).toBe(90);
  });

  it("an observed value violating the threshold produces hypothesis_not_met", async () => {
    const experimentId = await createRunningExperiment(100, "lte");
    const res = await evaluate(experimentId, { observedValue: 150 });
    expect(res.json().verdict).toBe("hypothesis_not_met");
  });

  it("an explicit null observed value produces inconclusive", async () => {
    const experimentId = await createRunningExperiment(100, "lte");
    const res = await evaluate(experimentId, { observedValue: null });
    expect(res.statusCode).toBe(200);
    expect(res.json().verdict).toBe("inconclusive");

    const row = await pool.query("select observed_value as \"observedValue\" from experiments where id = $1", [
      experimentId,
    ]);
    expect(row.rows[0].observedValue).toBeNull();
  });

  it("omitting the observedValue field is rejected 422 without persisting a verdict", async () => {
    const experimentId = await createRunningExperiment();
    const res = await evaluate(experimentId, {});
    expect(res.statusCode).toBe(422);
    expect(res.json().title).toBe("invalid_observation");
    const row = await pool.query("select verdict, status from experiments where id = $1", [experimentId]);
    expect(row.rows[0].verdict).toBeNull();
    expect(row.rows[0].status).toBe("running");
  });

  it("a non-numeric, non-null observedValue is rejected 422", async () => {
    const experimentId = await createRunningExperiment();
    const asString = await evaluate(experimentId, { observedValue: "90" });
    expect(asString.statusCode).toBe(422);
    const asBoolean = await evaluate(experimentId, { observedValue: true });
    expect(asBoolean.statusCode).toBe(422);
    const asObject = await evaluate(experimentId, { observedValue: { value: 90 } });
    expect(asObject.statusCode).toBe(422);
  });

  it("evaluating a non-running experiment is rejected 409", async () => {
    const experimentId = await createRunningExperiment();
    await evaluate(experimentId, { observedValue: 90 });
    const res = await evaluate(experimentId, { observedValue: 91 });
    expect(res.statusCode).toBe(409);
  });

  it("evaluating an unknown experiment returns 404", async () => {
    const res = await evaluate("xpr_unknown", { observedValue: 1 });
    expect(res.statusCode).toBe(404);
  });

  it("evaluating is denied cross-tenant", async () => {
    const experimentId = await createRunningExperiment();
    const loginB = await app.inject({
      method: "POST",
      url: "/auth/dev-login",
      payload: { email: "dev-b@evolutionos.local" },
    });
    const res = await app.inject({
      method: "POST",
      url: `/projects/${projectId}/experiments/${experimentId}/evaluate`,
      headers: { authorization: `Bearer ${loginB.json().token}` },
      payload: { observedValue: 1 },
    });
    expect(res.statusCode).toBe(403);
  });
});
