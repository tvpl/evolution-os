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

async function registerProject(slug: string): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/projects",
    headers: { authorization: `Bearer ${tokenA}`, "idempotency-key": `xpr-art-${slug}` },
    payload: {
      apiVersion: "evolutionos.io/v1alpha1",
      kind: "EvolutionProject",
      metadata: { name: `Proj ${slug}`, slug, type: "idea", status: "discovery" },
      spec: { intent: { problem: "x" } },
    },
  });
  return res.json().projectId;
}

async function createRunningExperiment(target: string): Promise<string> {
  const created = await app.inject({
    method: "POST",
    url: `/projects/${target}/proposals`,
    headers: { authorization: `Bearer ${tokenA}` },
    payload: { title: "x", summary: "y", proposalType: "experiment", investigationState: "investigating" },
  });
  const { proposalId } = created.json();
  await app.inject({
    method: "POST",
    url: `/projects/${target}/proposals/${proposalId}/ready`,
    headers: { authorization: `Bearer ${tokenA}` },
  });
  const started = await app.inject({
    method: "POST",
    url: `/projects/${target}/proposals/${proposalId}/experiments`,
    headers: { authorization: `Bearer ${tokenA}` },
    payload: {
      variants: [
        { id: "control", name: "Baseline" },
        { id: "candidate", name: "Nova" },
      ],
      verificationPlan: {
        hypothesis: "x",
        baselineMetric: "latency_ms",
        threshold: 100,
        comparison: "lte",
        observationWindow: "7d",
      },
    },
  });
  return started.json().experimentId;
}

async function createArtifact(target: string): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: `/projects/${target}/artifacts`,
    headers: { authorization: `Bearer ${tokenA}` },
    payload: { type: "report", title: "Resultado do experimento", content: "dados observados" },
  });
  return res.json().artifactId;
}

function attach(target: string, experimentId: string, artifactId: string) {
  return app.inject({
    method: "POST",
    url: `/projects/${target}/experiments/${experimentId}/artifacts`,
    headers: { authorization: `Bearer ${tokenA}` },
    payload: { artifactId },
  });
}

beforeAll(async () => {
  pool = await freshDb("evoos_test_experiments_artifacts");
  await seedDevData(pool);
  await seedDevGrants(pool);
  app = buildServer({ pool });
  const login = await app.inject({
    method: "POST",
    url: "/auth/dev-login",
    payload: { email: "dev-a@evolutionos.local" },
  });
  tokenA = login.json().token;
  projectId = await registerProject("proj-xpr-art");
  otherProjectId = await registerProject("proj-xpr-art-other");
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

describe("experiment proof artifacts (EXP-05/06/07)", () => {
  it("attaching an existing project artifact links it to the running experiment", async () => {
    const experimentId = await createRunningExperiment(projectId);
    const artifactId = await createArtifact(projectId);

    const res = await attach(projectId, experimentId, artifactId);
    expect(res.statusCode).toBe(201);

    const row = await pool.query(
      "select count(*)::int as n from experiment_artifacts where experiment_id = $1 and artifact_id = $2",
      [experimentId, artifactId],
    );
    expect(row.rows[0].n).toBe(1);
  });

  it("attaching the same artifact twice does not create a duplicate link", async () => {
    const experimentId = await createRunningExperiment(projectId);
    const artifactId = await createArtifact(projectId);

    await attach(projectId, experimentId, artifactId);
    const second = await attach(projectId, experimentId, artifactId);
    expect(second.statusCode).toBe(201);

    const row = await pool.query(
      "select count(*)::int as n from experiment_artifacts where experiment_id = $1 and artifact_id = $2",
      [experimentId, artifactId],
    );
    expect(row.rows[0].n).toBe(1);
  });

  it("attaching an artifact from another project is rejected 422", async () => {
    const experimentId = await createRunningExperiment(projectId);
    const foreignArtifactId = await createArtifact(otherProjectId);

    const res = await attach(projectId, experimentId, foreignArtifactId);
    expect(res.statusCode).toBe(422);
    expect(res.json().title).toBe("invalid_artifact_reference");
  });

  it("attaching to an unknown experiment returns 404", async () => {
    const artifactId = await createArtifact(projectId);
    const res = await attach(projectId, "xpr_unknown", artifactId);
    expect(res.statusCode).toBe(404);
  });

  it("listing returns every attached artifact", async () => {
    const experimentId = await createRunningExperiment(projectId);
    const a1 = await createArtifact(projectId);
    const a2 = await createArtifact(projectId);
    await attach(projectId, experimentId, a1);
    await attach(projectId, experimentId, a2);

    const res = await app.inject({
      method: "GET",
      url: `/projects/${projectId}/experiments/${experimentId}/artifacts`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(res.statusCode).toBe(200);
    const ids = res.json().artifacts.map((a: { id: string }) => a.id);
    expect(ids.sort()).toEqual([a1, a2].sort());
  });
});
