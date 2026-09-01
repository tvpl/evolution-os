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
  const slug = `portfolio-camp-${name}-${Math.random().toString(36).slice(2)}`;
  const res = await app.inject({
    method: "POST",
    url: "/projects",
    headers: { authorization: `Bearer ${tokenA}`, "idempotency-key": `portfolio-camp-setup-${slug}` },
    payload: {
      apiVersion: "evolutionos.io/v1alpha1",
      kind: "EvolutionProject",
      metadata: { name, slug, type: "idea", status: "discovery" },
      spec: { intent: { problem: "x" } },
    },
  });
  return res.json().projectId;
}

async function registerProjectAs(token: string, name: string): Promise<string> {
  const slug = `portfolio-camp-${name}-${Math.random().toString(36).slice(2)}`;
  const res = await app.inject({
    method: "POST",
    url: "/projects",
    headers: { authorization: `Bearer ${token}`, "idempotency-key": `portfolio-camp-setup-${slug}` },
    payload: {
      apiVersion: "evolutionos.io/v1alpha1",
      kind: "EvolutionProject",
      metadata: { name, slug, type: "idea", status: "discovery" },
      spec: { intent: { problem: "x" } },
    },
  });
  return res.json().projectId;
}

function createCampaign(portfolioId: string, body: Record<string, unknown>, token = tokenA) {
  return app.inject({
    method: "POST",
    url: `/projects/${portfolioId}/campaigns`,
    headers: { authorization: `Bearer ${token}` },
    payload: body,
  });
}

function getCampaign(portfolioId: string, campaignId: string, token = tokenA) {
  return app.inject({
    method: "GET",
    url: `/projects/${portfolioId}/campaigns/${campaignId}`,
    headers: { authorization: `Bearer ${token}` },
  });
}

beforeAll(async () => {
  pool = await freshDb("evoos_test_portfolio_campaigns");
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

describe("create a campaign organized into sequential waves (PORT-08/09)", () => {
  it("creates a campaign with 2 waves, persisting waves and pending items in order", async () => {
    const portfolioId = await registerProject("create-basic");
    const memberA = await registerProject("create-basic-a");
    const memberB = await registerProject("create-basic-b");

    const created = await createCampaign(portfolioId, {
      finding: "shared outdated dependency",
      waves: [{ targetProjectIds: [memberA] }, { targetProjectIds: [memberB] }],
    });
    expect(created.statusCode).toBe(201);
    const campaignId = created.json().campaignId;

    const res = await getCampaign(portfolioId, campaignId);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      id: campaignId,
      finding: "shared outdated dependency",
      waves: [
        {
          id: expect.any(String),
          seq: 1,
          name: null,
          items: [
            { id: expect.any(String), targetProjectId: memberA, status: "pending", proposalId: null, exceptionReason: null },
          ],
        },
        {
          id: expect.any(String),
          seq: 2,
          name: null,
          items: [
            { id: expect.any(String), targetProjectId: memberB, status: "pending", proposalId: null, exceptionReason: null },
          ],
        },
      ],
    });
  });

  it("rejects creation with an empty wave, persisting nothing", async () => {
    const portfolioId = await registerProject("empty-wave");
    const memberA = await registerProject("empty-wave-a");
    const res = await createCampaign(portfolioId, {
      finding: "x",
      waves: [{ targetProjectIds: [memberA] }, { targetProjectIds: [] }],
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().title).toBe("invalid_wave");

    const rows = await pool.query(`select count(*)::int as n from campaigns where portfolio_project_id = $1`, [
      portfolioId,
    ]);
    expect(rows.rows[0].n).toBe(0);
  });

  it("rejects creation with zero waves", async () => {
    const portfolioId = await registerProject("zero-waves");
    const res = await createCampaign(portfolioId, { finding: "x", waves: [] });
    expect(res.statusCode).toBe(422);
    expect(res.json().title).toBe("invalid_wave");
  });

  it("rejects creation referencing an unknown target project, persisting nothing", async () => {
    const portfolioId = await registerProject("unknown-target");
    const res = await createCampaign(portfolioId, {
      finding: "x",
      waves: [{ targetProjectIds: ["prj_does_not_exist"] }],
    });
    expect(res.statusCode).toBe(404);

    const rows = await pool.query(`select count(*)::int as n from campaigns where portfolio_project_id = $1`, [
      portfolioId,
    ]);
    expect(rows.rows[0].n).toBe(0);
  });

  it("rejects creation with an invalid target in a LATER wave (not just the first), persisting nothing", async () => {
    const portfolioId = await registerProject("bad-target-later-wave");
    const memberA = await registerProject("bad-target-later-wave-a");
    const res = await createCampaign(portfolioId, {
      finding: "x",
      waves: [{ targetProjectIds: [memberA] }, { targetProjectIds: ["prj_does_not_exist"] }],
    });
    expect(res.statusCode).toBe(404);

    const rows = await pool.query(`select count(*)::int as n from campaigns where portfolio_project_id = $1`, [
      portfolioId,
    ]);
    expect(rows.rows[0].n).toBe(0);
  });

  it("rejects creation referencing a target project from another org, persisting nothing", async () => {
    const portfolioId = await registerProject("other-org-target");
    const otherOrgProjectId = await registerProjectAs(tokenB, "other-org-target-member");
    const res = await createCampaign(portfolioId, {
      finding: "x",
      waves: [{ targetProjectIds: [otherOrgProjectId] }],
    });
    expect(res.statusCode).toBe(404);
  });

  it("rejects reading an unknown campaign with 404", async () => {
    const portfolioId = await registerProject("unknown-campaign");
    const res = await getCampaign(portfolioId, "cam_does_not_exist");
    expect(res.statusCode).toBe(404);
  });

  it("rejects reading a campaign belonging to another portfolio project with 404", async () => {
    const portfolioId = await registerProject("wrong-portfolio");
    const otherPortfolioId = await registerProject("wrong-portfolio-other");
    const memberA = await registerProject("wrong-portfolio-a");
    const created = await createCampaign(portfolioId, { finding: "x", waves: [{ targetProjectIds: [memberA] }] });

    const res = await getCampaign(otherPortfolioId, created.json().campaignId);
    expect(res.statusCode).toBe(404);
  });

  it("is denied cross-tenant for both creating and reading campaigns", async () => {
    const portfolioId = await registerProject("cross-tenant");
    const memberA = await registerProject("cross-tenant-a");
    const created = await createCampaign(portfolioId, { finding: "x", waves: [{ targetProjectIds: [memberA] }] });

    const createRes = await createCampaign(portfolioId, { finding: "y", waves: [{ targetProjectIds: [memberA] }] }, tokenB);
    expect(createRes.statusCode).toBe(403);

    const readRes = await getCampaign(portfolioId, created.json().campaignId, tokenB);
    expect(readRes.statusCode).toBe(403);
  });
});
