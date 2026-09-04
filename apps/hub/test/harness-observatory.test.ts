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
  const slug = `harness-observatory-${Math.random().toString(36).slice(2)}`;
  const res = await app.inject({
    method: "POST",
    url: "/projects",
    headers: { authorization: `Bearer ${tokenA}`, "idempotency-key": `harness-observatory-setup-${slug}` },
    payload: {
      apiVersion: "evolutionos.io/v1alpha1",
      kind: "EvolutionProject",
      metadata: { name: "Harness Observatory", slug, type: "harness", status: "active" },
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

async function runEval(projectId: string) {
  return app.inject({
    method: "POST",
    url: `/projects/${projectId}/harness/eval-runs`,
    headers: { authorization: `Bearer ${tokenA}` },
  });
}

function observatory(projectId: string) {
  return app.inject({
    method: "GET",
    url: `/projects/${projectId}/harness/observatory`,
    headers: { authorization: `Bearer ${tokenA}` },
  });
}

beforeAll(async () => {
  pool = await freshDb("evoos_test_harness_observatory");
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

describe("Harness Observatory (HRN-13/14)", () => {
  it("shows an explicit absence marker before any eval run exists", async () => {
    const projectId = await registerHarness();
    await declareInventory(projectId, { skills: [{ id: "triage", name: "Triage", version: "1.0.0" }] });
    await declareCase(projectId, { name: "x", invariantType: "requires_skill", params: { skillId: "triage" } });

    const res = await observatory(projectId);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      inventory: {
        version: 1,
        skills: [{ id: "triage", name: "Triage", version: "1.0.0" }],
        mcps: [],
        models: [],
        createdAt: expect.any(String),
      },
      evalCaseCount: 1,
      latestRun: null,
    });
  });

  it("shows the latest run's score alongside inventory and eval case count after a run", async () => {
    const projectId = await registerHarness();
    await declareInventory(projectId, { skills: [{ id: "triage", name: "Triage", version: "1.0.0" }] });
    await declareCase(projectId, { name: "x", invariantType: "requires_skill", params: { skillId: "triage" } });
    await declareCase(projectId, { name: "y", invariantType: "requires_skill", params: { skillId: "missing" } });
    const ran = await runEval(projectId);
    const runId = ran.json().runId;

    const res = await observatory(projectId);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.evalCaseCount).toBe(2);
    expect(body.latestRun).toEqual({ runId, score: { passed: 1, total: 2 }, createdAt: expect.any(String) });
  });

  it("reflects only the most recent run when multiple runs exist", async () => {
    const projectId = await registerHarness();
    await declareInventory(projectId, {});
    await declareCase(projectId, { name: "x", invariantType: "requires_mcp", params: { mcpId: "gov" } });
    const firstRun = await runEval(projectId);
    await declareInventory(projectId, { mcps: [{ id: "gov", name: "Gov", version: "1.0.0" }] });
    const secondRun = await runEval(projectId);

    const res = await observatory(projectId);
    const body = res.json();
    expect(body.latestRun.runId).toBe(secondRun.json().runId);
    expect(body.latestRun.runId).not.toBe(firstRun.json().runId);
    expect(body.latestRun.score).toEqual({ passed: 1, total: 1 });
    expect(body.inventory.version).toBe(2);
  });

  it("shows no inventory declared as null when only eval cases exist", async () => {
    const projectId = await registerHarness();
    await declareCase(projectId, { name: "x", invariantType: "requires_mcp", params: { mcpId: "gov" } });

    const res = await observatory(projectId);
    expect(res.json()).toEqual({ inventory: null, evalCaseCount: 1, latestRun: null });
  });

  it("is rejected 404 for an unknown project", async () => {
    const res = await observatory("prj_unknown");
    expect(res.statusCode).toBe(404);
  });

  it("is denied cross-tenant", async () => {
    const projectId = await registerHarness();
    const loginB = await app.inject({
      method: "POST",
      url: "/auth/dev-login",
      payload: { email: "dev-b@evolutionos.local" },
    });
    const res = await app.inject({
      method: "GET",
      url: `/projects/${projectId}/harness/observatory`,
      headers: { authorization: `Bearer ${loginB.json().token}` },
    });
    expect(res.statusCode).toBe(403);
  });
});
