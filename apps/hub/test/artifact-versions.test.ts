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
let artifactId: string;

beforeAll(async () => {
  pool = await freshDb("evoos_test_artifact_versions");
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
    headers: { authorization: `Bearer ${tokenA}`, "idempotency-key": "artv-setup" },
    payload: {
      apiVersion: "evolutionos.io/v1alpha1",
      kind: "EvolutionProject",
      metadata: { name: "Proj ArtVersions", slug: "proj-artv", type: "product", status: "discovery" },
      spec: { intent: { problem: "x" } },
    },
  });
  projectId = reg.json().projectId;
  const created = await app.inject({
    method: "POST",
    url: `/projects/${projectId}/artifacts`,
    headers: { authorization: `Bearer ${tokenA}` },
    payload: { type: "prd", title: "PRD", content: "v1 content" },
  });
  artifactId = created.json().artifactId;
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

describe("artifact versioning (IDEA-09/11)", () => {
  it("two new versions increment current_version to 3 preserving prior versions", async () => {
    const v2 = await app.inject({
      method: "POST",
      url: `/projects/${projectId}/artifacts/${artifactId}/versions`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { content: "v2 content" },
    });
    expect(v2.statusCode).toBe(201);
    expect(v2.json()).toEqual({ artifactId, version: 2 });

    const v3 = await app.inject({
      method: "POST",
      url: `/projects/${projectId}/artifacts/${artifactId}/versions`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { content: "v3 content" },
    });
    expect(v3.statusCode).toBe(201);
    expect(v3.json()).toEqual({ artifactId, version: 3 });

    const list = await app.inject({
      method: "GET",
      url: `/projects/${projectId}/artifacts`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    const found = list.json().artifacts.find((a: { id: string }) => a.id === artifactId);
    expect(found).toMatchObject({ currentVersion: 3, versionCount: 3 });

    const rows = await pool.query(
      "select version, content from artifact_versions where artifact_id = $1 order by version",
      [artifactId],
    );
    expect(rows.rows).toEqual([
      { version: 1, content: "v1 content" },
      { version: 2, content: "v2 content" },
      { version: 3, content: "v3 content" },
    ]);
  });

  it("reading version 1 explicitly returns the original content, not the current one", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/projects/${projectId}/artifacts/${artifactId}/versions/1`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ version: 1, content: "v1 content" });
  });

  it("adding a version without reference or content is rejected 422 without creating a row", async () => {
    const before = await pool.query(
      "select count(*)::int as n from artifact_versions where artifact_id = $1",
      [artifactId],
    );
    const res = await app.inject({
      method: "POST",
      url: `/projects/${projectId}/artifacts/${artifactId}/versions`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: {},
    });
    expect(res.statusCode).toBe(422);
    const after = await pool.query(
      "select count(*)::int as n from artifact_versions where artifact_id = $1",
      [artifactId],
    );
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });

  it("reading a non-existent version returns 404", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/projects/${projectId}/artifacts/${artifactId}/versions/99`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(res.statusCode).toBe(404);
  });
});
