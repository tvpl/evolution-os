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
let otherProjectId: string;
let hypothesisId: string;

beforeAll(async () => {
  pool = await freshDb("evoos_test_decisions");
  await seedDevData(pool);
  await seedDevGrants(pool);
  app = buildServer({ pool });
  const login = await app.inject({
    method: "POST",
    url: "/auth/dev-login",
    payload: { email: "dev-a@evolutionos.local" },
  });
  tokenA = login.json().token;

  const reg = await app.inject({
    method: "POST",
    url: "/projects",
    headers: { authorization: `Bearer ${tokenA}`, "idempotency-key": "dec-setup-1" },
    payload: {
      apiVersion: "evolutionos.io/v1alpha1",
      kind: "EvolutionProject",
      metadata: { name: "Proj Decisions", slug: "proj-dec", type: "idea", status: "discovery" },
      spec: {
        intent: { problem: "x" },
        hypotheses: [
          { id: "hyp-dec", statement: "H", type: "desirability", evidenceState: "untested", status: "active" },
        ],
      },
    },
  });
  projectId = reg.json().projectId;
  hypothesisId = "hyp-dec";

  const reg2 = await app.inject({
    method: "POST",
    url: "/projects",
    headers: { authorization: `Bearer ${tokenA}`, "idempotency-key": "dec-setup-2" },
    payload: {
      apiVersion: "evolutionos.io/v1alpha1",
      kind: "EvolutionProject",
      metadata: { name: "Outro Proj", slug: "proj-dec-other", type: "idea", status: "discovery" },
      spec: { intent: { problem: "x" } },
    },
  });
  otherProjectId = reg2.json().projectId;
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

function recordDecision(body: Record<string, unknown>) {
  return app.inject({
    method: "POST",
    url: `/projects/${projectId}/decisions`,
    headers: { authorization: `Bearer ${tokenA}` },
    payload: body,
  });
}

describe("decisions with subject validation and guard (IDEA-12/13/14/15)", () => {
  it("records a decision with rationale, alternatives and review trigger", async () => {
    const res = await recordDecision({
      decision: "experiment",
      rationale: "Pilotar preserva reversibilidade.",
      alternatives: [{ id: "opt-hold", title: "Manter" }, { id: "opt-pilot", title: "Pilotar" }],
      reviewTrigger: "after-pilot-window",
    });
    expect(res.statusCode).toBe(201);
    const { decision } = res.json();
    expect(decision).toMatchObject({
      decision: "experiment",
      actor: "user_dev_a",
      rationale: "Pilotar preserva reversibilidade.",
      reviewTrigger: "after-pilot-window",
      reviewTriggerStatus: "pending",
    });
    expect(decision.alternatives).toEqual([
      { id: "opt-hold", title: "Manter" },
      { id: "opt-pilot", title: "Pilotar" },
    ]);
  });

  it("decision referencing a hypothesis links it and is retrievable via list", async () => {
    const res = await recordDecision({
      decision: "reject",
      rationale: "Evidência insuficiente.",
      subjectType: "hypothesis",
      subjectId: hypothesisId,
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().decision.subjectId).toBe(hypothesisId);

    const list = await app.inject({
      method: "GET",
      url: `/projects/${projectId}/decisions`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    const found = list.json().decisions.find((d: { subjectId: string }) => d.subjectId === hypothesisId);
    expect(found).toBeDefined();
  });

  it("decision without a review trigger lists with status 'none'", async () => {
    await recordDecision({ decision: "defer", rationale: "Aguardando." });
    const list = await app.inject({
      method: "GET",
      url: `/projects/${projectId}/decisions`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    const found = list.json().decisions.find((d: { decision: string }) => d.decision === "defer");
    expect(found.reviewTriggerStatus).toBe("none");
  });

  it("decisions list is ordered most-recent-first", async () => {
    const list = await app.inject({
      method: "GET",
      url: `/projects/${projectId}/decisions`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    const dates = list.json().decisions.map((d: { decidedAt: string }) => d.decidedAt);
    const sorted = [...dates].sort().reverse();
    expect(dates).toEqual(sorted);
  });

  it("a second decision on the same subject surfaces the prior rejected decision (guard)", async () => {
    const second = await recordDecision({
      decision: "experiment",
      rationale: "Nova evidência mudou o quadro.",
      subjectType: "hypothesis",
      subjectId: hypothesisId,
    });
    expect(second.statusCode).toBe(201);
    const { priorRelatedDecisions } = second.json();
    expect(priorRelatedDecisions).toHaveLength(1);
    expect(priorRelatedDecisions[0]).toMatchObject({ decision: "reject", subjectId: hypothesisId });
  });

  it("decision referencing a subject from another project is rejected 422", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/projects/${otherProjectId}/decisions`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { decision: "reject", rationale: "x", subjectType: "hypothesis", subjectId: hypothesisId },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().title).toBe("invalid_subject_reference");
  });

  it("recording without decision or rationale is rejected 422", async () => {
    const res = await recordDecision({ decision: "reject" });
    expect(res.statusCode).toBe(422);
  });
});
