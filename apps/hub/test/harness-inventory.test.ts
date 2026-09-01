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
let tokenB: string;
let projectId: string;

async function registerHarness(slug = `harness-inventory-${Math.random().toString(36).slice(2)}`): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/projects",
    headers: { authorization: `Bearer ${tokenA}`, "idempotency-key": `harness-inventory-setup-${slug}` },
    payload: {
      apiVersion: "evolutionos.io/v1alpha1",
      kind: "EvolutionProject",
      metadata: { name: "Harness A", slug, type: "harness", status: "active" },
      spec: { intent: { problem: "manter o harness relevante" } },
    },
  });
  return res.json().projectId;
}

function declare(body: Record<string, unknown>) {
  return app.inject({
    method: "POST",
    url: `/projects/${projectId}/harness/inventory`,
    headers: { authorization: `Bearer ${tokenA}` },
    payload: body,
  });
}

function getInventory(token = tokenA) {
  return app.inject({
    method: "GET",
    url: `/projects/${projectId}/harness/inventory`,
    headers: { authorization: `Bearer ${token}` },
  });
}

const skillA = { id: "skill-a", name: "Skill A", version: "1.0.0" };
const mcpA = { id: "mcp-a", name: "MCP A", version: "1.0.0" };

beforeAll(async () => {
  pool = await freshDb("evoos_test_harness_inventory");
  await seedDevData(pool);
  await seedDevGrants(pool);
  app = buildServer({ pool });
  const loginA = await app.inject({
    method: "POST",
    url: "/auth/dev-login",
    payload: { email: "dev-a@evolutionos.local" },
  });
  tokenA = loginA.json().token;
  const loginB = await app.inject({
    method: "POST",
    url: "/auth/dev-login",
    payload: { email: "dev-b@evolutionos.local" },
  });
  tokenB = loginB.json().token;
  projectId = await registerHarness();
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

describe("harness inventory (HRN-01/02/03)", () => {
  it("returns 404 before any inventory is declared", async () => {
    const res = await getInventory();
    expect(res.statusCode).toBe(404);
  });

  it("declaring an inventory persists it as version 1 and it becomes current", async () => {
    const res = await declare({ skills: [skillA], mcps: [mcpA], models: [] });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ version: 1, status: "declared" });

    const current = await getInventory();
    expect(current.statusCode).toBe(200);
    expect(current.json()).toMatchObject({ version: 1, skills: [skillA], mcps: [mcpA], models: [] });
  });

  it("declaring a second inventory becomes the new current version, not the first", async () => {
    const skillB = { id: "skill-b", name: "Skill B", version: "1.0.0" };
    const res = await declare({ skills: [skillB], mcps: [], models: [] });
    expect(res.json().version).toBe(2);

    const current = await getInventory();
    expect(current.json()).toMatchObject({ version: 2, skills: [skillB], mcps: [], models: [] });
  });

  it("an empty inventory is a valid declared state, distinct from no inventory at all", async () => {
    const projectWithEmpty = await registerHarness();
    const res = await app.inject({
      method: "POST",
      url: `/projects/${projectWithEmpty}/harness/inventory`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { skills: [], mcps: [], models: [] },
    });
    expect(res.statusCode).toBe(201);
    const current = await app.inject({
      method: "GET",
      url: `/projects/${projectWithEmpty}/harness/inventory`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(current.statusCode).toBe(200);
    expect(current.json()).toMatchObject({ version: 1, skills: [], mcps: [], models: [] });
  });

  it("declaring with a malformed component is rejected 422", async () => {
    const res = await declare({ skills: [{ id: "x" }], mcps: [], models: [] });
    expect(res.statusCode).toBe(422);
    expect(res.json().title).toBe("invalid_inventory");
  });

  it("declaring for an unknown project is rejected 404", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/projects/prj_unknown/harness/inventory",
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { skills: [], mcps: [], models: [] },
    });
    expect(res.statusCode).toBe(404);
  });

  it("is denied cross-tenant", async () => {
    const res = await getInventory(tokenB);
    expect(res.statusCode).toBe(403);
  });
});
