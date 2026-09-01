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
  const slug = `portfolio-items-${name}-${Math.random().toString(36).slice(2)}`;
  const res = await app.inject({
    method: "POST",
    url: "/projects",
    headers: { authorization: `Bearer ${tokenA}`, "idempotency-key": `portfolio-items-setup-${slug}` },
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

function completeItem(portfolioId: string, campaignId: string, itemId: string, body: Record<string, unknown> = {}, token = tokenA) {
  return app.inject({
    method: "POST",
    url: `/projects/${portfolioId}/campaigns/${campaignId}/items/${itemId}/complete`,
    headers: { authorization: `Bearer ${token}` },
    payload: body,
  });
}

function grantException(portfolioId: string, campaignId: string, itemId: string, body: Record<string, unknown>, token = tokenA) {
  return app.inject({
    method: "POST",
    url: `/projects/${portfolioId}/campaigns/${campaignId}/items/${itemId}/exception`,
    headers: { authorization: `Bearer ${token}` },
    payload: body,
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

beforeAll(async () => {
  pool = await freshDb("evoos_test_portfolio_items");
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

describe("gate campaign wave progression behind full resolution (PORT-10/11/12/13/14/15)", () => {
  it("completes an item in wave 1 (no prior wave to resolve)", async () => {
    const portfolioId = await registerProject("wave1-basic");
    const memberA = await registerProject("wave1-basic-a");
    const campaignId = await createCampaign(portfolioId, [[memberA]]);
    const itemId = (await getWaveItemIds(portfolioId, campaignId, 1))[0]!;

    const res = await completeItem(portfolioId, campaignId, itemId);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ itemId, status: "completed" });
  });

  it("completes an item with a linked proposal belonging to the same target project", async () => {
    const portfolioId = await registerProject("wave1-proposal");
    const memberA = await registerProject("wave1-proposal-a");
    const proposalId = await createProposal(memberA);
    const campaignId = await createCampaign(portfolioId, [[memberA]]);
    const itemId = (await getWaveItemIds(portfolioId, campaignId, 1))[0]!;

    const res = await completeItem(portfolioId, campaignId, itemId, { proposalId });
    expect(res.statusCode).toBe(200);

    const row = await pool.query(`select proposal_id as "proposalId" from campaign_items where id = $1`, [itemId]);
    expect(row.rows[0].proposalId).toBe(proposalId);
  });

  it("rejects completing an item with a proposalId from a different project with 422", async () => {
    const portfolioId = await registerProject("wave1-bad-proposal");
    const memberA = await registerProject("wave1-bad-proposal-a");
    const otherProject = await registerProject("wave1-bad-proposal-other");
    const proposalId = await createProposal(otherProject);
    const campaignId = await createCampaign(portfolioId, [[memberA]]);
    const itemId = (await getWaveItemIds(portfolioId, campaignId, 1))[0]!;

    const res = await completeItem(portfolioId, campaignId, itemId, { proposalId });
    expect(res.statusCode).toBe(422);
    expect(res.json().title).toBe("invalid_proposal_reference");
  });

  it("rejects completing a wave-2 item while wave 1 still has a pending item, with 409", async () => {
    const portfolioId = await registerProject("gate-blocks");
    const memberA = await registerProject("gate-blocks-a");
    const memberB = await registerProject("gate-blocks-b");
    const campaignId = await createCampaign(portfolioId, [[memberA], [memberB]]);
    const wave2ItemId = (await getWaveItemIds(portfolioId, campaignId, 2))[0]!;

    const res = await completeItem(portfolioId, campaignId, wave2ItemId);
    expect(res.statusCode).toBe(409);
    expect(res.json().title).toBe("wave_not_resolved");
  });

  it("allows completing a wave-2 item once every wave-1 item is completed", async () => {
    const portfolioId = await registerProject("gate-unlocks");
    const memberA = await registerProject("gate-unlocks-a");
    const memberB = await registerProject("gate-unlocks-b");
    const campaignId = await createCampaign(portfolioId, [[memberA], [memberB]]);
    const wave1ItemId = (await getWaveItemIds(portfolioId, campaignId, 1))[0]!;
    const wave2ItemId = (await getWaveItemIds(portfolioId, campaignId, 2))[0]!;

    await completeItem(portfolioId, campaignId, wave1ItemId);
    const res = await completeItem(portfolioId, campaignId, wave2ItemId);
    expect(res.statusCode).toBe(200);
  });

  it("rejects an exception without a justification with 422", async () => {
    const portfolioId = await registerProject("exception-no-just");
    const memberA = await registerProject("exception-no-just-a");
    const campaignId = await createCampaign(portfolioId, [[memberA]]);
    const itemId = (await getWaveItemIds(portfolioId, campaignId, 1))[0]!;

    const res = await grantException(portfolioId, campaignId, itemId, {});
    expect(res.statusCode).toBe(422);
    expect(res.json().title).toBe("justification_required");
  });

  it("grants an exception with a justification, setting status to exempted and persisting it", async () => {
    const portfolioId = await registerProject("exception-ok");
    const memberA = await registerProject("exception-ok-a");
    const campaignId = await createCampaign(portfolioId, [[memberA]]);
    const itemId = (await getWaveItemIds(portfolioId, campaignId, 1))[0]!;

    const res = await grantException(portfolioId, campaignId, itemId, { justification: "not applicable to this stack" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ itemId, status: "exempted" });

    const row = await pool.query(`select exception_reason as "exceptionReason" from campaign_items where id = $1`, [itemId]);
    expect(row.rows[0].exceptionReason).toBe("not applicable to this stack");
  });

  it("unlocks the next wave when a wave mixes completed and exempted items", async () => {
    const portfolioId = await registerProject("mixed-wave");
    const memberA = await registerProject("mixed-wave-a");
    const memberB = await registerProject("mixed-wave-b");
    const memberC = await registerProject("mixed-wave-c");
    const campaignId = await createCampaign(portfolioId, [[memberA, memberB], [memberC]]);
    const wave1Items = await getWaveItemIds(portfolioId, campaignId, 1);
    const wave1ItemA = wave1Items[0]!;
    const wave1ItemB = wave1Items[1]!;
    const wave2Item = (await getWaveItemIds(portfolioId, campaignId, 2))[0]!;

    await completeItem(portfolioId, campaignId, wave1ItemA);
    await grantException(portfolioId, campaignId, wave1ItemB, { justification: "local exception" });

    const res = await completeItem(portfolioId, campaignId, wave2Item);
    expect(res.statusCode).toBe(200);
  });

  it("rejects completing or excepting an already-terminal item with 409", async () => {
    const portfolioId = await registerProject("terminal");
    const memberA = await registerProject("terminal-a");
    const campaignId = await createCampaign(portfolioId, [[memberA]]);
    const itemId = (await getWaveItemIds(portfolioId, campaignId, 1))[0]!;

    await completeItem(portfolioId, campaignId, itemId);
    const completeAgain = await completeItem(portfolioId, campaignId, itemId);
    expect(completeAgain.statusCode).toBe(409);
    expect(completeAgain.json().title).toBe("invalid_transition");

    const exceptAfter = await grantException(portfolioId, campaignId, itemId, { justification: "x" });
    expect(exceptAfter.statusCode).toBe(409);
    expect(exceptAfter.json().title).toBe("invalid_transition");
  });

  it("is denied cross-tenant for both completing and excepting items", async () => {
    const portfolioId = await registerProject("cross-tenant");
    const memberA = await registerProject("cross-tenant-a");
    const campaignId = await createCampaign(portfolioId, [[memberA]]);
    const itemId = (await getWaveItemIds(portfolioId, campaignId, 1))[0]!;
    const loginB = await app.inject({
      method: "POST",
      url: "/auth/dev-login",
      payload: { email: "dev-b@evolutionos.local" },
    });
    const tokenB = loginB.json().token;

    const completeRes = await completeItem(portfolioId, campaignId, itemId, {}, tokenB);
    expect(completeRes.statusCode).toBe(403);
    const exceptionRes = await grantException(portfolioId, campaignId, itemId, { justification: "x" }, tokenB);
    expect(exceptionRes.statusCode).toBe(403);
  });
});
