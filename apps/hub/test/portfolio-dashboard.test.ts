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
  const slug = `portfolio-dash-${name}-${Math.random().toString(36).slice(2)}`;
  const res = await app.inject({
    method: "POST",
    url: "/projects",
    headers: { authorization: `Bearer ${tokenA}`, "idempotency-key": `portfolio-dash-setup-${slug}` },
    payload: {
      apiVersion: "evolutionos.io/v1alpha1",
      kind: "EvolutionProject",
      metadata: { name, slug, type: "idea", status: "discovery" },
      spec: { intent: { problem: "x" } },
    },
  });
  return res.json().projectId;
}

function declareComposition(portfolioId: string, memberId: string) {
  return app.inject({
    method: "POST",
    url: `/projects/${portfolioId}/relations`,
    headers: { authorization: `Bearer ${tokenA}` },
    payload: { targetProjectId: memberId, type: "composition" },
  });
}

function getDashboard(projectId: string, token = tokenA) {
  return app.inject({
    method: "GET",
    url: `/projects/${projectId}/portfolio/dashboard`,
    headers: { authorization: `Bearer ${token}` },
  });
}

async function createOpenProposal(projectId: string) {
  const res = await app.inject({
    method: "POST",
    url: `/projects/${projectId}/proposals`,
    headers: { authorization: `Bearer ${tokenA}` },
    payload: { title: "x", summary: "y", proposalType: "improvement", investigationState: "investigating" },
  });
  if (res.statusCode !== 201) {
    throw new Error(`createOpenProposal failed: ${res.statusCode} ${res.body}`);
  }
}

async function createRejectedDecision(projectId: string) {
  await app.inject({
    method: "POST",
    url: `/projects/${projectId}/decisions`,
    headers: { authorization: `Bearer ${tokenA}` },
    payload: { decision: "reject", rationale: "not aligned" },
  });
}

async function createRunningExperiment(projectId: string) {
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
  await app.inject({
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
        threshold: 100,
        comparison: "lte",
        observationWindow: "7d",
      },
    },
  });
}

beforeAll(async () => {
  pool = await freshDb("evoos_test_portfolio_dashboard");
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

describe("deterministic portfolio dashboard (PORT-05/06/07)", () => {
  it("aggregates exact open-proposal, rejected-decision, and running-experiment counts per composition member", async () => {
    const portfolioId = await registerProject("agg");
    const memberA = await registerProject("agg-a");
    const memberB = await registerProject("agg-b");
    await declareComposition(portfolioId, memberA);
    await declareComposition(portfolioId, memberB);

    await createOpenProposal(memberA);
    await createRejectedDecision(memberA);
    await createRunningExperiment(memberB);

    const res = await getDashboard(portfolioId);
    expect(res.statusCode).toBe(200);
    const members = res.json().members;
    expect(members).toEqual([
      { projectId: memberA, openProposalsCount: 1, rejectedDecisionsCount: 1, runningExperimentsCount: 0 },
      // Starting an experiment moves its proposal to status='executing' (experiments.ts),
      // so it correctly no longer counts as "open".
      { projectId: memberB, openProposalsCount: 0, rejectedDecisionsCount: 0, runningExperimentsCount: 1 },
    ]);
  });

  it("returns an empty members list, not an error, when the portfolio has no composition relations", async () => {
    const portfolioId = await registerProject("empty");
    const res = await getDashboard(portfolioId);
    expect(res.statusCode).toBe(200);
    expect(res.json().members).toEqual([]);
  });

  it("rejects the dashboard for an unknown project with 404", async () => {
    const res = await getDashboard("prj_does_not_exist");
    expect(res.statusCode).toBe(404);
  });

  it("shows a member with no activity with all counts at 0, never omitted", async () => {
    const portfolioId = await registerProject("zero-activity");
    const memberId = await registerProject("zero-activity-member");
    await declareComposition(portfolioId, memberId);

    const res = await getDashboard(portfolioId);
    expect(res.json().members).toEqual([
      { projectId: memberId, openProposalsCount: 0, rejectedDecisionsCount: 0, runningExperimentsCount: 0 },
    ]);
  });

  it("is denied cross-tenant", async () => {
    const portfolioId = await registerProject("cross-tenant");
    const loginB = await app.inject({
      method: "POST",
      url: "/auth/dev-login",
      payload: { email: "dev-b@evolutionos.local" },
    });
    const res = await getDashboard(portfolioId, loginB.json().token);
    expect(res.statusCode).toBe(403);
  });
});
