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

beforeAll(async () => {
  pool = await freshDb("evoos_test_artifacts");
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
    headers: { authorization: `Bearer ${tokenA}`, "idempotency-key": "artifacts-setup" },
    payload: {
      apiVersion: "evolutionos.io/v1alpha1",
      kind: "EvolutionProject",
      metadata: { name: "Proj Artifacts", slug: "proj-artifacts", type: "product", status: "discovery" },
      spec: { intent: { problem: "x" } },
    },
  });
  projectId = reg.json().projectId;
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

function createArtifact(body: Record<string, unknown>) {
  return app.inject({
    method: "POST",
    url: `/projects/${projectId}/artifacts`,
    headers: { authorization: `Bearer ${tokenA}` },
    payload: body,
  });
}

describe("artifacts creation and listing (IDEA-08/10)", () => {
  it("creates an artifact at version 1", async () => {
    const res = await createArtifact({ type: "prd", title: "PRD", reference: "docs/prd.md" });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ artifactId: expect.stringMatching(/^art_/), version: 1 });
  });

  it("listing shows current version and version count", async () => {
    const res = await createArtifact({ type: "adr", title: "ADR", content: "conteúdo" });
    const { artifactId } = res.json();
    const list = await app.inject({
      method: "GET",
      url: `/projects/${projectId}/artifacts`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(list.statusCode).toBe(200);
    const found = list.json().artifacts.find((a: { id: string }) => a.id === artifactId);
    expect(found).toMatchObject({ type: "adr", title: "ADR", currentVersion: 1, versionCount: 1 });
  });

  it("creation without reference or content is rejected 422 without persisting anything", async () => {
    const before = await pool.query("select count(*)::int as n from artifacts where project_id = $1", [
      projectId,
    ]);
    const res = await createArtifact({ type: "diagram", title: "Sem conteúdo" });
    expect(res.statusCode).toBe(422);
    const after = await pool.query("select count(*)::int as n from artifacts where project_id = $1", [
      projectId,
    ]);
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });

  it("creation without type or title is rejected 422", async () => {
    const res = await createArtifact({ reference: "x" });
    expect(res.statusCode).toBe(422);
  });

  it("artifacts routes are denied cross-tenant", async () => {
    const loginB = await app.inject({
      method: "POST",
      url: "/auth/dev-login",
      payload: { email: "dev-b@evolutionos.local" },
    });
    const tokenB = loginB.json().token;
    const res = await app.inject({
      method: "GET",
      url: `/projects/${projectId}/artifacts`,
      headers: { authorization: `Bearer ${tokenB}` },
    });
    expect(res.statusCode).toBe(403);
  });
});
