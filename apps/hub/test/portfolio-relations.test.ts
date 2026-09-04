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

async function registerProject(name: string): Promise<string> {
  const slug = `portfolio-rel-${name}-${Math.random().toString(36).slice(2)}`;
  const res = await app.inject({
    method: "POST",
    url: "/projects",
    headers: { authorization: `Bearer ${tokenA}`, "idempotency-key": `portfolio-rel-setup-${slug}` },
    payload: {
      apiVersion: "evolutionos.io/v1alpha1",
      kind: "EvolutionProject",
      metadata: { name, slug, type: "portfolio", status: "active" },
      spec: { intent: { problem: "x" } },
    },
  });
  return res.json().projectId;
}

async function registerProjectAs(token: string, name: string): Promise<string> {
  const slug = `portfolio-rel-${name}-${Math.random().toString(36).slice(2)}`;
  const res = await app.inject({
    method: "POST",
    url: "/projects",
    headers: { authorization: `Bearer ${token}`, "idempotency-key": `portfolio-rel-setup-${slug}` },
    payload: {
      apiVersion: "evolutionos.io/v1alpha1",
      kind: "EvolutionProject",
      metadata: { name, slug, type: "idea", status: "discovery" },
      spec: { intent: { problem: "x" } },
    },
  });
  return res.json().projectId;
}

function declareRelation(sourceId: string, targetId: string, type: string, token = tokenA) {
  return app.inject({
    method: "POST",
    url: `/projects/${sourceId}/relations`,
    headers: { authorization: `Bearer ${token}` },
    payload: { targetProjectId: targetId, type },
  });
}

function getRelations(projectId: string, token = tokenA) {
  return app.inject({
    method: "GET",
    url: `/projects/${projectId}/relations`,
    headers: { authorization: `Bearer ${token}` },
  });
}

beforeAll(async () => {
  pool = await freshDb("evoos_test_portfolio_relations");
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
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

describe("declare and list typed project relations (PORT-01/02/03/04)", () => {
  it("declares a composition relation, visible in the source's outbound and the target's inbound", async () => {
    const portfolioId = await registerProject("declare-basic");
    const memberId = await registerProject("declare-basic-member");

    const res = await declareRelation(portfolioId, memberId, "composition");
    expect(res.statusCode).toBe(201);
    expect(typeof res.json().relationId).toBe("string");

    const outbound = await getRelations(portfolioId);
    expect(outbound.json().outbound).toEqual([
      { id: res.json().relationId, sourceProjectId: portfolioId, targetProjectId: memberId, type: "composition", createdAt: expect.any(String) },
    ]);

    const inbound = await getRelations(memberId);
    expect(inbound.json().inbound).toEqual([
      { id: res.json().relationId, sourceProjectId: portfolioId, targetProjectId: memberId, type: "composition", createdAt: expect.any(String) },
    ]);
  });

  it("rejects a relation type outside the closed set with 422", async () => {
    const portfolioId = await registerProject("bad-type");
    const memberId = await registerProject("bad-type-member");
    const res = await declareRelation(portfolioId, memberId, "friendship");
    expect(res.statusCode).toBe(422);
    expect(res.json().title).toBe("invalid_relation_type");
  });

  it("rejects a relation to an unknown target project with 404", async () => {
    const portfolioId = await registerProject("unknown-target");
    const res = await declareRelation(portfolioId, "prj_does_not_exist", "composition");
    expect(res.statusCode).toBe(404);
  });

  it("rejects a relation to a target project belonging to another org with 404", async () => {
    const portfolioId = await registerProject("other-org-target");
    const otherOrgProjectId = await registerProjectAs(tokenB, "other-org-target-member");
    const res = await declareRelation(portfolioId, otherOrgProjectId, "composition");
    expect(res.statusCode).toBe(404);
  });

  it("rejects a self-relation with 422", async () => {
    const projectId = await registerProject("self-relation");
    const res = await declareRelation(projectId, projectId, "composition");
    expect(res.statusCode).toBe(422);
    expect(res.json().title).toBe("self_relation");
  });

  it("is idempotent when declaring the exact same (source,target,type) relation twice", async () => {
    const portfolioId = await registerProject("idempotent");
    const memberId = await registerProject("idempotent-member");
    const first = await declareRelation(portfolioId, memberId, "composition");
    const second = await declareRelation(portfolioId, memberId, "composition");
    expect(second.statusCode).toBe(201);
    expect(second.json().relationId).toBe(first.json().relationId);

    const rows = await pool.query(
      `select count(*)::int as n from project_relations where source_project_id = $1 and target_project_id = $2 and type = 'composition'`,
      [portfolioId, memberId],
    );
    expect(rows.rows[0].n).toBe(1);
  });

  it("is denied cross-tenant for both declaring and listing relations", async () => {
    const portfolioId = await registerProject("cross-tenant");
    const memberId = await registerProject("cross-tenant-member");
    const declareRes = await declareRelation(portfolioId, memberId, "composition", tokenB);
    expect(declareRes.statusCode).toBe(403);
    const listRes = await getRelations(portfolioId, tokenB);
    expect(listRes.statusCode).toBe(403);
  });
});
