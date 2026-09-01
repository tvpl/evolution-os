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
  const slug = `harness-eval-runs-${Math.random().toString(36).slice(2)}`;
  const res = await app.inject({
    method: "POST",
    url: "/projects",
    headers: { authorization: `Bearer ${tokenA}`, "idempotency-key": `harness-eval-runs-setup-${slug}` },
    payload: {
      apiVersion: "evolutionos.io/v1alpha1",
      kind: "EvolutionProject",
      metadata: { name: "Harness Eval Runs", slug, type: "harness", status: "active" },
      spec: { intent: { problem: "manter o harness relevante" } },
    },
  });
  return res.json().projectId;
}

function runEval(projectId: string) {
  return app.inject({
    method: "POST",
    url: `/projects/${projectId}/harness/eval-runs`,
    headers: { authorization: `Bearer ${tokenA}` },
  });
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

beforeAll(async () => {
  pool = await freshDb("evoos_test_harness_eval_runs");
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

describe("run the harness eval dataset (HRN-07/08/09)", () => {
  it("rejects running without an inventory declared", async () => {
    const projectId = await registerHarness();
    await declareCase(projectId, { name: "x", invariantType: "requires_skill", params: { skillId: "x" } });
    const res = await runEval(projectId);
    expect(res.statusCode).toBe(422);
    expect(res.json().title).toBe("harness_requires_inventory");
  });

  it("rejects running without eval cases declared", async () => {
    const projectId = await registerHarness();
    await declareInventory(projectId, {});
    const res = await runEval(projectId);
    expect(res.statusCode).toBe(422);
    expect(res.json().title).toBe("harness_requires_eval_cases");
  });

  it("rejects running with neither inventory nor eval cases declared, checking inventory first", async () => {
    const projectId = await registerHarness();
    const res = await runEval(projectId);
    expect(res.statusCode).toBe(422);
    expect(res.json().title).toBe("harness_requires_inventory");
  });

  it("runs the dataset against the current inventory, persisting a run with score and results", async () => {
    const projectId = await registerHarness();
    await declareInventory(projectId, { skills: [{ id: "triage", name: "Triage", version: "1.0.0" }] });
    await declareCase(projectId, {
      name: "Precisa da skill de triagem",
      invariantType: "requires_skill",
      params: { skillId: "triage" },
    });
    await declareCase(projectId, {
      name: "Precisa de skill inexistente",
      invariantType: "requires_skill",
      params: { skillId: "does-not-exist" },
    });

    const res = await runEval(projectId);
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.score).toEqual({ passed: 1, total: 2 });
    expect(body.results).toHaveLength(2);

    const row = await pool.query(
      "select score_passed as \"scorePassed\", score_total as \"scoreTotal\", inventory_version as \"inventoryVersion\" from harness_eval_runs where id = $1",
      [body.runId],
    );
    expect(row.rows[0]).toEqual({ scorePassed: 1, scoreTotal: 2, inventoryVersion: 1 });
  });

  it("persists a run with score 0/total without erroring when every case fails", async () => {
    const projectId = await registerHarness();
    await declareInventory(projectId, {});
    await declareCase(projectId, {
      name: "Skill que nunca existe",
      invariantType: "requires_skill",
      params: { skillId: "ghost" },
    });

    const res = await runEval(projectId);
    expect(res.statusCode).toBe(201);
    expect(res.json().score).toEqual({ passed: 0, total: 1 });
  });

  it("is denied cross-tenant", async () => {
    const projectId = await registerHarness();
    await declareInventory(projectId, {});
    await declareCase(projectId, { name: "x", invariantType: "requires_mcp", params: { mcpId: "x" } });
    const loginB = await app.inject({
      method: "POST",
      url: "/auth/dev-login",
      payload: { email: "dev-b@evolutionos.local" },
    });
    const res = await app.inject({
      method: "POST",
      url: `/projects/${projectId}/harness/eval-runs`,
      headers: { authorization: `Bearer ${loginB.json().token}` },
    });
    expect(res.statusCode).toBe(403);
  });
});
