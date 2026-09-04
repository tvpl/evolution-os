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

async function registerProject(): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/projects",
    headers: { authorization: `Bearer ${tokenA}`, "idempotency-key": "prp-inbox-setup" },
    payload: {
      apiVersion: "evolutionos.io/v1alpha1",
      kind: "EvolutionProject",
      metadata: { name: "Proj Inbox", slug: "proj-prp-inbox", type: "idea", status: "discovery" },
      spec: { intent: { problem: "x" } },
    },
  });
  return res.json().projectId;
}

async function createReadyProposal(title: string): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: `/projects/${projectId}/proposals`,
    headers: { authorization: `Bearer ${tokenA}` },
    payload: { title, summary: "y", proposalType: "watch", investigationState: "investigating" },
  });
  const { proposalId } = res.json();
  await app.inject({
    method: "POST",
    url: `/projects/${projectId}/proposals/${proposalId}/ready`,
    headers: { authorization: `Bearer ${tokenA}` },
  });
  return proposalId;
}

async function createDraftProposal(title: string): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: `/projects/${projectId}/proposals`,
    headers: { authorization: `Bearer ${tokenA}` },
    payload: { title, summary: "y", proposalType: "watch", investigationState: "investigating" },
  });
  return res.json().proposalId;
}

beforeAll(async () => {
  pool = await freshDb("evoos_test_proposal_inbox");
  await seedDevData(pool);
  await seedDevGrants(pool);
  app = buildServer({ pool });
  const login = await app.inject({
    method: "POST",
    url: "/auth/dev-login",
    payload: { email: "dev-a@evolutionos.local" },
  });
  tokenA = login.json().token;
  projectId = await registerProject();
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

describe("proposal inbox (FLOW-16)", () => {
  it("filtering by readyForReview returns only those proposals, with findings, ordered most-recent-first", async () => {
    const first = await createReadyProposal("Primeira");
    const draft = await createDraftProposal("Rascunho");
    const second = await createReadyProposal("Segunda");

    const res = await app.inject({
      method: "GET",
      url: `/projects/${projectId}/proposals?status=readyForReview`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(res.statusCode).toBe(200);
    const { proposals } = res.json();

    const ids = proposals.map((p: { id: string }) => p.id);
    expect(ids).not.toContain(draft);
    expect(ids).toEqual(expect.arrayContaining([first, second]));
    expect(ids.indexOf(second)).toBeLessThan(ids.indexOf(first));

    for (const p of proposals) {
      expect(p.status).toBe("readyForReview");
      expect(p.challengerFindings).toEqual(
        expect.arrayContaining([
          "missing_do_nothing_alternative",
          "single_source_evidence",
          "missing_cost_of_inaction",
        ]),
      );
    }
  });

  it("a draft proposal does not appear in the filtered inbox", async () => {
    const draftId = await createDraftProposal("Só rascunho");
    const res = await app.inject({
      method: "GET",
      url: `/projects/${projectId}/proposals?status=readyForReview`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    const ids = res.json().proposals.map((p: { id: string }) => p.id);
    expect(ids).not.toContain(draftId);
  });

  it("unfiltered listing returns proposals of every status", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/projects/${projectId}/proposals`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    const statuses = new Set(res.json().proposals.map((p: { status: string }) => p.status));
    expect(statuses.has("draft")).toBe(true);
    expect(statuses.has("readyForReview")).toBe(true);
  });
});
