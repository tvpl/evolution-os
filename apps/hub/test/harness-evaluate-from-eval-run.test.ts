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

async function registerHarness(): Promise<string> {
  const slug = `harness-eval-from-run-${Math.random().toString(36).slice(2)}`;
  const res = await app.inject({
    method: "POST",
    url: "/projects",
    headers: { authorization: `Bearer ${tokenA}`, "idempotency-key": `harness-eval-from-run-setup-${slug}` },
    payload: {
      apiVersion: "evolutionos.io/v1alpha1",
      kind: "EvolutionProject",
      metadata: { name: "Harness Evaluate From Eval Run", slug, type: "harness", status: "active" },
      spec: { intent: { problem: "manter o harness relevante" } },
    },
  });
  return res.json().projectId;
}

async function declareInventory(projectId: string, body: Record<string, unknown>) {
  return app.inject({
    method: "POST",
    url: `/projects/${projectId}/harness/inventory`,
    headers: { authorization: `Bearer ${tokenA}` },
    payload: { skills: [], mcps: [], models: [], ...body },
  });
}

async function declareCase(projectId: string, body: Record<string, unknown>) {
  return app.inject({
    method: "POST",
    url: `/projects/${projectId}/harness/eval-cases`,
    headers: { authorization: `Bearer ${tokenA}` },
    payload: body,
  });
}

async function createRunningExperiment(projectId: string, threshold = 0.5, comparison: "gte" | "lte" = "gte"): Promise<string> {
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

function evaluateFromEvalRun(projectId: string, experimentId: string) {
  return app.inject({
    method: "POST",
    url: `/projects/${projectId}/harness/experiments/${experimentId}/evaluate-from-eval-run`,
    headers: { authorization: `Bearer ${tokenA}` },
  });
}

beforeAll(async () => {
  pool = await freshDb("evoos_test_harness_evaluate_from_eval_run");
  await seedDevData(pool);
  await seedDevGrants(pool);
  app = buildServer({ pool });
  const login = await app.inject({
    method: "POST",
    url: "/auth/dev-login",
    payload: { email: "dev-a@evolutionos.local" },
  });
  tokenA = login.json().token;
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

describe("evaluate an experiment from a harness eval run (HRN-10/11/12)", () => {
  it("evaluates a running experiment from the eval run score, moving it to evaluated with a verdict", async () => {
    const projectId = await registerHarness();
    await declareInventory(projectId, { skills: [{ id: "triage", name: "Triage", version: "1.0.0" }] });
    await declareCase(projectId, {
      name: "Precisa da skill de triagem",
      invariantType: "requires_skill",
      params: { skillId: "triage" },
    });
    const experimentId = await createRunningExperiment(projectId, 0.5, "gte");

    const res = await evaluateFromEvalRun(projectId, experimentId);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toEqual({
      experimentId,
      status: "evaluated",
      runId: expect.any(String),
      score: { passed: 1, total: 1 },
      verdict: "hypothesis_met",
      rationale: expect.any(String),
    });

    const row = await pool.query(
      "select status, verdict, observed_value as \"observedValue\" from experiments where id = $1",
      [experimentId],
    );
    expect(row.rows[0].status).toBe("evaluated");
    expect(row.rows[0].verdict).toBe("hypothesis_met");
    expect(row.rows[0].observedValue).toBe(1);

    const runRow = await pool.query(
      "select score_passed as \"scorePassed\", score_total as \"scoreTotal\" from harness_eval_runs where id = $1",
      [body.runId],
    );
    expect(runRow.rows[0]).toEqual({ scorePassed: 1, scoreTotal: 1 });
  });

  it("computes hypothesis_not_met when the score misses the threshold", async () => {
    const projectId = await registerHarness();
    await declareInventory(projectId, {});
    await declareCase(projectId, {
      name: "Skill inexistente",
      invariantType: "requires_skill",
      params: { skillId: "does-not-exist" },
    });
    const experimentId = await createRunningExperiment(projectId, 0.5, "gte");

    const res = await evaluateFromEvalRun(projectId, experimentId);
    expect(res.statusCode).toBe(200);
    expect(res.json().verdict).toBe("hypothesis_not_met");
    expect(res.json().score).toEqual({ passed: 0, total: 1 });
  });

  it("rejects running without an inventory declared with 422", async () => {
    const projectId = await registerHarness();
    await declareCase(projectId, { name: "x", invariantType: "requires_mcp", params: { mcpId: "x" } });
    const experimentId = await createRunningExperiment(projectId);
    const res = await evaluateFromEvalRun(projectId, experimentId);
    expect(res.statusCode).toBe(422);
    expect(res.json().title).toBe("harness_requires_inventory");
  });

  it("rejects running without eval cases declared with 422", async () => {
    const projectId = await registerHarness();
    await declareInventory(projectId, {});
    const experimentId = await createRunningExperiment(projectId);
    const res = await evaluateFromEvalRun(projectId, experimentId);
    expect(res.statusCode).toBe(422);
    expect(res.json().title).toBe("harness_requires_eval_cases");
  });

  it("evaluating an experiment from another project is rejected 404", async () => {
    const projectA = await registerHarness();
    const projectB = await registerHarness();
    await declareInventory(projectA, {});
    await declareCase(projectA, { name: "x", invariantType: "requires_mcp", params: { mcpId: "x" } });
    await declareInventory(projectB, {});
    await declareCase(projectB, { name: "y", invariantType: "requires_mcp", params: { mcpId: "y" } });
    const experimentOnA = await createRunningExperiment(projectA);

    const res = await evaluateFromEvalRun(projectB, experimentOnA);
    expect(res.statusCode).toBe(404);
    expect(res.json().title).toBe("not_found");
  });

  it("evaluating an experiment that is not running is rejected 409", async () => {
    const projectId = await registerHarness();
    await declareInventory(projectId, {});
    await declareCase(projectId, { name: "x", invariantType: "requires_mcp", params: { mcpId: "x" } });
    const experimentId = await createRunningExperiment(projectId);
    await evaluateFromEvalRun(projectId, experimentId);
    const res = await evaluateFromEvalRun(projectId, experimentId);
    expect(res.statusCode).toBe(409);
    expect(res.json().title).toBe("invalid_transition");
  });

  it("is gated specifically by experiment.write, not harness.write", async () => {
    const projectId = await registerHarness();
    await declareInventory(projectId, { skills: [{ id: "triage", name: "Triage", version: "1.0.0" }] });
    await declareCase(projectId, {
      name: "Precisa da skill de triagem",
      invariantType: "requires_skill",
      params: { skillId: "triage" },
    });
    const experimentId = await createRunningExperiment(projectId);

    await pool.query(
      "delete from capability_grants where org_id = $1 and workspace_id = $2 and capability = $3",
      ["org_dev_a", "ws_dev_a", "experiment.write"],
    );
    try {
      const denied = await evaluateFromEvalRun(projectId, experimentId);
      expect(denied.statusCode).toBe(403);
      expect(denied.json().title).toBe("capability_denied");
    } finally {
      await pool.query(
        `insert into capability_grants (id, org_id, workspace_id, principal, capability)
         values ($1, $2, $3, '*', $4)
         on conflict (org_id, workspace_id, principal, capability) do nothing`,
        ["grant_org_dev_a_experiment.write", "org_dev_a", "ws_dev_a", "experiment.write"],
      );
    }

    const allowed = await evaluateFromEvalRun(projectId, experimentId);
    expect(allowed.statusCode).toBe(200);
  });

  it("is denied cross-tenant", async () => {
    const projectId = await registerHarness();
    await declareInventory(projectId, {});
    await declareCase(projectId, { name: "x", invariantType: "requires_mcp", params: { mcpId: "x" } });
    const experimentId = await createRunningExperiment(projectId);
    const loginB = await app.inject({
      method: "POST",
      url: "/auth/dev-login",
      payload: { email: "dev-b@evolutionos.local" },
    });
    const res = await app.inject({
      method: "POST",
      url: `/projects/${projectId}/harness/experiments/${experimentId}/evaluate-from-eval-run`,
      headers: { authorization: `Bearer ${loginB.json().token}` },
    });
    expect(res.statusCode).toBe(403);
  });
});
