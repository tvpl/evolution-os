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

async function registerProject(name: string): Promise<string> {
  const slug = `portfolio-progress-${name}-${Math.random().toString(36).slice(2)}`;
  const res = await app.inject({
    method: "POST",
    url: "/projects",
    headers: { authorization: `Bearer ${tokenA}`, "idempotency-key": `portfolio-progress-setup-${slug}` },
    payload: {
      apiVersion: "evolutionos.io/v1alpha1",
      kind: "EvolutionProject",
      metadata: { name, slug, type: "idea", status: "discovery" },
      spec: { intent: { problem: "x" } },
    },
  });
  return res.json().projectId;
}

async function createCampaign(portfolioId: string, waves: string[][]) {
  const res = await app.inject({
    method: "POST",
    url: `/projects/${portfolioId}/campaigns`,
    headers: { authorization: `Bearer ${tokenA}` },
    payload: { finding: "shared finding", waves: waves.map((targetProjectIds) => ({ targetProjectIds })) },
  });
  return res.json().campaignId as string;
}

function getProgress(portfolioId: string, campaignId: string, token = tokenA) {
  return app.inject({
    method: "GET",
    url: `/projects/${portfolioId}/campaigns/${campaignId}/progress`,
    headers: { authorization: `Bearer ${token}` },
  });
}

beforeAll(async () => {
  pool = await freshDb("evoos_test_portfolio_progress");
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

describe("campaign progress without a ranking field (PORT-16/17)", () => {
  it("returns items ordered by wave with exactly projectId/wave/status, no other field", async () => {
    const portfolioId = await registerProject("shape");
    const memberA = await registerProject("shape-a");
    const memberB = await registerProject("shape-b");
    const campaignId = await createCampaign(portfolioId, [[memberA], [memberB]]);

    const res = await getProgress(portfolioId, campaignId);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      items: [
        { projectId: memberA, wave: 1, status: "pending" },
        { projectId: memberB, wave: 2, status: "pending" },
      ],
    });
  });

  it("rejects progress for an unknown campaign with 404", async () => {
    const portfolioId = await registerProject("unknown");
    const res = await getProgress(portfolioId, "cam_does_not_exist");
    expect(res.statusCode).toBe(404);
  });

  it("rejects progress for a campaign belonging to another portfolio project with 404", async () => {
    const portfolioId = await registerProject("wrong-portfolio");
    const otherPortfolioId = await registerProject("wrong-portfolio-other");
    const memberA = await registerProject("wrong-portfolio-a");
    const campaignId = await createCampaign(portfolioId, [[memberA]]);

    const res = await getProgress(otherPortfolioId, campaignId);
    expect(res.statusCode).toBe(404);
  });

  it("is denied cross-tenant", async () => {
    const portfolioId = await registerProject("cross-tenant");
    const memberA = await registerProject("cross-tenant-a");
    const campaignId = await createCampaign(portfolioId, [[memberA]]);
    const loginB = await app.inject({
      method: "POST",
      url: "/auth/dev-login",
      payload: { email: "dev-b@evolutionos.local" },
    });
    const res = await getProgress(portfolioId, campaignId, loginB.json().token);
    expect(res.statusCode).toBe(403);
  });
});
