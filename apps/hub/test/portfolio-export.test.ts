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
  const slug = `portfolio-export-${name}-${Math.random().toString(36).slice(2)}`;
  const res = await app.inject({
    method: "POST",
    url: "/projects",
    headers: { authorization: `Bearer ${tokenA}`, "idempotency-key": `portfolio-export-setup-${slug}` },
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

async function getWaveItemIds(portfolioId: string, campaignId: string, waveSeq: number): Promise<string[]> {
  const res = await app.inject({
    method: "GET",
    url: `/projects/${portfolioId}/campaigns/${campaignId}`,
    headers: { authorization: `Bearer ${tokenA}` },
  });
  const waves = res.json().waves as { seq: number; items: { id: string }[] }[];
  const wave = waves.find((w) => w.seq === waveSeq);
  if (!wave) throw new Error(`wave ${waveSeq} not found`);
  return wave.items.map((i) => i.id);
}

function completeItem(portfolioId: string, campaignId: string, itemId: string, body: Record<string, unknown> = {}) {
  return app.inject({
    method: "POST",
    url: `/projects/${portfolioId}/campaigns/${campaignId}/items/${itemId}/complete`,
    headers: { authorization: `Bearer ${tokenA}` },
    payload: body,
  });
}

function grantException(portfolioId: string, campaignId: string, itemId: string, justification: string) {
  return app.inject({
    method: "POST",
    url: `/projects/${portfolioId}/campaigns/${campaignId}/items/${itemId}/exception`,
    headers: { authorization: `Bearer ${tokenA}` },
    payload: { justification },
  });
}

async function createProposal(projectId: string): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: `/projects/${projectId}/proposals`,
    headers: { authorization: `Bearer ${tokenA}` },
    payload: { title: "x", summary: "y", proposalType: "improvement", investigationState: "investigating" },
  });
  return res.json().proposalId;
}

async function recordDecision(projectId: string, proposalId: string, decision: string) {
  await app.inject({
    method: "POST",
    url: `/projects/${projectId}/decisions`,
    headers: { authorization: `Bearer ${tokenA}` },
    payload: { decision, rationale: "because evidence supports it", subjectType: "proposal", subjectId: proposalId },
  });
}

function exportCampaign(portfolioId: string, campaignId: string, token = tokenA) {
  return app.inject({
    method: "GET",
    url: `/projects/${portfolioId}/campaigns/${campaignId}/export`,
    headers: { authorization: `Bearer ${token}` },
  });
}

beforeAll(async () => {
  pool = await freshDb("evoos_test_portfolio_export");
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

describe("export campaign audit trail with linked decisions (PORT-18/19)", () => {
  it("exports a completed item's linked proposal decisions and an exempted item's justification", async () => {
    const portfolioId = await registerProject("full");
    const memberA = await registerProject("full-a");
    const memberB = await registerProject("full-b");
    const proposalId = await createProposal(memberA);
    await recordDecision(memberA, proposalId, "approve");
    const campaignId = await createCampaign(portfolioId, [[memberA, memberB]]);
    const [itemA, itemB] = await getWaveItemIds(portfolioId, campaignId, 1);

    await completeItem(portfolioId, campaignId, itemA!, { proposalId });
    await grantException(portfolioId, campaignId, itemB!, "not applicable here");

    const res = await exportCampaign(portfolioId, campaignId);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      finding: "shared finding",
      waves: [
        {
          seq: 1,
          items: [
            {
              targetProjectId: memberA,
              status: "completed",
              exceptionReason: null,
              proposalId,
              decisions: [
                {
                  id: expect.any(String),
                  decision: "approve",
                  actor: expect.any(String),
                  rationale: "because evidence supports it",
                  decidedAt: expect.any(String),
                },
              ],
            },
            {
              targetProjectId: memberB,
              status: "exempted",
              exceptionReason: "not applicable here",
              proposalId: null,
              decisions: [],
            },
          ],
        },
      ],
    });
  });

  it("returns an empty decisions array for a pending item with no linked proposal", async () => {
    const portfolioId = await registerProject("no-proposal");
    const memberA = await registerProject("no-proposal-a");
    const campaignId = await createCampaign(portfolioId, [[memberA]]);

    const res = await exportCampaign(portfolioId, campaignId);
    expect(res.json().waves[0].items[0].decisions).toEqual([]);
    expect(res.json().waves[0].items[0].proposalId).toBeNull();
  });

  it("rejects exporting an unknown campaign with 404", async () => {
    const portfolioId = await registerProject("unknown");
    const res = await exportCampaign(portfolioId, "cam_does_not_exist");
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
    const res = await exportCampaign(portfolioId, campaignId, loginB.json().token);
    expect(res.statusCode).toBe(403);
  });
});
