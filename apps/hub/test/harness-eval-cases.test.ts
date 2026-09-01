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

async function registerHarness(): Promise<string> {
  const slug = `harness-eval-cases-${Math.random().toString(36).slice(2)}`;
  const res = await app.inject({
    method: "POST",
    url: "/projects",
    headers: { authorization: `Bearer ${tokenA}`, "idempotency-key": `harness-eval-cases-setup-${slug}` },
    payload: {
      apiVersion: "evolutionos.io/v1alpha1",
      kind: "EvolutionProject",
      metadata: { name: "Harness Eval Cases", slug, type: "harness", status: "active" },
      spec: { intent: { problem: "manter o harness relevante" } },
    },
  });
  return res.json().projectId;
}

function declareCase(body: Record<string, unknown>) {
  return app.inject({
    method: "POST",
    url: `/projects/${projectId}/harness/eval-cases`,
    headers: { authorization: `Bearer ${tokenA}` },
    payload: body,
  });
}

beforeAll(async () => {
  pool = await freshDb("evoos_test_harness_eval_cases");
  await seedDevData(pool);
  await seedDevGrants(pool);
  app = buildServer({ pool });
  const login = await app.inject({
    method: "POST",
    url: "/auth/dev-login",
    payload: { email: "dev-a@evolutionos.local" },
  });
  tokenA = login.json().token;
  projectId = await registerHarness();
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

describe("harness eval dataset (HRN-04/05/06)", () => {
  it("declares a requires_skill case", async () => {
    const res = await declareCase({
      name: "Precisa da skill de triagem",
      invariantType: "requires_skill",
      params: { skillId: "triage" },
    });
    expect(res.statusCode).toBe(201);
    expect(typeof res.json().caseId).toBe("string");
  });

  it("declares a min_component_count case", async () => {
    const res = await declareCase({
      name: "Pelo menos 2 skills",
      invariantType: "min_component_count",
      params: { category: "skills", min: 2 },
    });
    expect(res.statusCode).toBe(201);
  });

  it("declares requires_mcp and forbids_mcp cases", async () => {
    const requires = await declareCase({
      name: "Precisa do MCP de governança",
      invariantType: "requires_mcp",
      params: { mcpId: "governance" },
    });
    expect(requires.statusCode).toBe(201);
    const forbids = await declareCase({
      name: "Não pode ter o MCP legado",
      invariantType: "forbids_mcp",
      params: { mcpId: "legacy" },
    });
    expect(forbids.statusCode).toBe(201);
  });

  it("rejects an unknown invariantType", async () => {
    const res = await declareCase({ name: "x", invariantType: "does_not_exist", params: {} });
    expect(res.statusCode).toBe(422);
    expect(res.json().title).toBe("invalid_eval_case");
  });

  it("rejects requires_skill missing skillId", async () => {
    const res = await declareCase({ name: "x", invariantType: "requires_skill", params: {} });
    expect(res.statusCode).toBe(422);
  });

  it("rejects min_component_count with an invalid category", async () => {
    const res = await declareCase({
      name: "x",
      invariantType: "min_component_count",
      params: { category: "widgets", min: 1 },
    });
    expect(res.statusCode).toBe(422);
  });

  it("rejects min_component_count missing min", async () => {
    const res = await declareCase({
      name: "x",
      invariantType: "min_component_count",
      params: { category: "skills" },
    });
    expect(res.statusCode).toBe(422);
  });

  it("lists every declared case", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/projects/${projectId}/harness/eval-cases`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().evalCases.length).toBeGreaterThanOrEqual(4);
    for (const c of res.json().evalCases) {
      expect(c).toHaveProperty("invariantType");
      expect(c).toHaveProperty("params");
    }
  });

  it("is denied cross-tenant", async () => {
    const loginB = await app.inject({
      method: "POST",
      url: "/auth/dev-login",
      payload: { email: "dev-b@evolutionos.local" },
    });
    const res = await app.inject({
      method: "GET",
      url: `/projects/${projectId}/harness/eval-cases`,
      headers: { authorization: `Bearer ${loginB.json().token}` },
    });
    expect(res.statusCode).toBe(403);
  });
});
