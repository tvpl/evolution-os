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
let connectionId: string;

async function registerProject(): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/projects",
    headers: { authorization: `Bearer ${tokenA}`, "idempotency-key": "gh-ci-setup" },
    payload: {
      apiVersion: "evolutionos.io/v1alpha1",
      kind: "EvolutionProject",
      metadata: { name: "Proj GitHub CI", slug: "proj-gh-ci", type: "idea", status: "discovery" },
      spec: { intent: { problem: "x" } },
    },
  });
  return res.json().projectId;
}

async function createAction(idempotencyKey: string, body: Record<string, unknown>) {
  const res = await app.inject({
    method: "POST",
    url: `/projects/${projectId}/connectors/github/actions`,
    headers: { authorization: `Bearer ${tokenA}`, "idempotency-key": idempotencyKey },
    payload: { connectionId, actionType: "draftPr", title: "Draft: x", ...body },
  });
  return res.json().actionId;
}

async function createRunningExperiment(): Promise<string> {
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
  const started = await app.inject({
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
  return started.json().experimentId;
}

function recordCiStatus(actionId: string, body: Record<string, unknown>) {
  return app.inject({
    method: "POST",
    url: `/projects/${projectId}/connectors/github/actions/${actionId}/ci-status`,
    headers: { authorization: `Bearer ${tokenA}` },
    payload: body,
  });
}

beforeAll(async () => {
  pool = await freshDb("evoos_test_github_ci_status");
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
  const connected = await app.inject({
    method: "POST",
    url: `/projects/${projectId}/connectors/github`,
    headers: { authorization: `Bearer ${tokenA}` },
    payload: { owner: "acme", repo: "widgets" },
  });
  connectionId = connected.json().connectionId;
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

describe("ci status becomes automatic proof artifact (GH-12/13/14)", () => {
  it("records a CI status persisted and linked to the action", async () => {
    const actionId = await createAction("key-ci-basic", {});
    const res = await recordCiStatus(actionId, { context: "ci/build", state: "success", targetUrl: "https://ci.example/1" });
    expect(res.statusCode).toBe(201);

    const row = await pool.query(
      "select context, state, target_url as \"targetUrl\" from github_action_ci_statuses where action_id = $1",
      [actionId],
    );
    expect(row.rows[0]).toEqual({ context: "ci/build", state: "success", targetUrl: "https://ci.example/1" });
  });

  it("a CI status for an action with an experimentId auto-creates and attaches a proof artifact", async () => {
    const experimentId = await createRunningExperiment();
    const actionId = await createAction("key-ci-with-experiment", { experimentId });

    const before = await app.inject({
      method: "GET",
      url: `/projects/${projectId}/experiments/${experimentId}/artifacts`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    const beforeCount = before.json().artifacts.length;

    const res = await recordCiStatus(actionId, { context: "ci/tests", state: "success" });
    expect(res.statusCode).toBe(201);
    expect(res.json().artifactAttached).toBe(true);

    const after = await app.inject({
      method: "GET",
      url: `/projects/${projectId}/experiments/${experimentId}/artifacts`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(after.json().artifacts.length).toBe(beforeCount + 1);
    const newest = after.json().artifacts.find((a: { type: string }) => a.type === "ci_status");
    expect(newest.title).toBe("CI: ci/tests — success");
  });

  it("a CI status for an action with no experimentId persists without attempting to attach anything", async () => {
    const actionId = await createAction("key-ci-no-experiment", {});
    const res = await recordCiStatus(actionId, { context: "ci/lint", state: "pending" });
    expect(res.statusCode).toBe(201);
    expect(res.json().artifactAttached).toBe(false);
  });

  it("a CI status for an action whose experiment is no longer running still succeeds, without attaching", async () => {
    const experimentId = await createRunningExperiment();
    await app.inject({
      method: "POST",
      url: `/projects/${projectId}/experiments/${experimentId}/evaluate`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { observedValue: 50 },
    });
    const actionId = await createAction("key-ci-not-running", { experimentId });

    const res = await recordCiStatus(actionId, { context: "ci/late", state: "success" });
    expect(res.statusCode).toBe(201);
    expect(res.json().artifactAttached).toBe(false);
  });

  it("returns 404 for an unknown action", async () => {
    const res = await recordCiStatus("gha_unknown", { context: "ci/build", state: "success" });
    expect(res.statusCode).toBe(404);
  });

  it("rejects a CI status update without context or state", async () => {
    const actionId = await createAction("key-ci-invalid", {});
    const res = await recordCiStatus(actionId, { state: "success" });
    expect(res.statusCode).toBe(422);
  });

  it("is denied cross-tenant", async () => {
    const actionId = await createAction("key-ci-cross-tenant", {});
    const loginB = await app.inject({
      method: "POST",
      url: "/auth/dev-login",
      payload: { email: "dev-b@evolutionos.local" },
    });
    const res = await app.inject({
      method: "POST",
      url: `/projects/${projectId}/connectors/github/actions/${actionId}/ci-status`,
      headers: { authorization: `Bearer ${loginB.json().token}` },
      payload: { context: "ci/build", state: "success" },
    });
    expect(res.statusCode).toBe(403);
  });
});
