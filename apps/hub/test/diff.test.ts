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
let nodeId: string;
let nodeToken: string;

async function registerProject(slug: string, type = "service"): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/projects",
    headers: { authorization: `Bearer ${tokenA}`, "idempotency-key": `diff-${slug}` },
    payload: {
      apiVersion: "evolutionos.io/v1alpha1",
      kind: "EvolutionProject",
      metadata: { name: `Proj ${slug}`, slug, type, status: "discovery" },
      spec: { intent: { problem: "x" } },
    },
  });
  return res.json().projectId;
}

async function sync(projectId: string, manifests: Array<Record<string, unknown>>) {
  return app.inject({
    method: "POST",
    url: `/projects/${projectId}/snapshots`,
    headers: { "x-node-id": nodeId, "x-node-token": nodeToken },
    payload: { manifests, languages: {} },
  });
}

async function diff(projectId: string) {
  return app.inject({
    method: "GET",
    url: `/projects/${projectId}/diff`,
    headers: { authorization: `Bearer ${tokenA}` },
  });
}

beforeAll(async () => {
  pool = await freshDb("evoos_test_diff");
  await seedDevData(pool);
  await seedDevGrants(pool);
  app = buildServer({ pool });
  const login = await app.inject({
    method: "POST",
    url: "/auth/dev-login",
    payload: { email: "dev-a@evolutionos.local" },
  });
  tokenA = login.json().token;
  const enroll = await app.inject({
    method: "POST",
    url: "/nodes/enroll",
    headers: { authorization: `Bearer ${tokenA}` },
    payload: { name: "node-diff" },
  });
  nodeId = enroll.json().nodeId;
  nodeToken = enroll.json().token;
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

describe("declared vs observed diff (TWIN-14/15/16)", () => {
  it("a service project observed as a 3-component monorepo reports the mismatch", async () => {
    const projectId = await registerProject("diff-mismatch", "service");
    await sync(projectId, [
      { ecosystem: "npm", location: "a", name: "a" },
      { ecosystem: "npm", location: "b", name: "b" },
      { ecosystem: "npm", location: "c", name: "c" },
    ]);
    const res = await diff(projectId);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.mismatches).toEqual([
      { field: "type", declared: "service", observed: "monorepo with 3 components" },
    ]);
    expect(body.observed.snapshotId).toMatch(/^snp_/);
  });

  it("a snapshot consistent with the declared type reports an empty mismatch list", async () => {
    const projectId = await registerProject("diff-consistent", "service");
    await sync(projectId, [{ ecosystem: "npm", location: ".", name: "diff-consistent" }]);
    const res = await diff(projectId);
    expect(res.statusCode).toBe(200);
    expect(res.json().mismatches).toEqual([]);
  });

  it("a project with no snapshot yet returns observed: null instead of an error", async () => {
    const projectId = await registerProject("diff-none", "service");
    const res = await diff(projectId);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ observed: null, mismatches: [] });
  });

  it("the response cites the snapshot version used", async () => {
    const projectId = await registerProject("diff-cite", "service");
    const synced = await sync(projectId, [{ ecosystem: "npm", location: ".", name: "diff-cite" }]);
    const res = await diff(projectId);
    const row = await pool.query("select observed_at from snapshots where id = $1", [
      synced.json().snapshotId,
    ]);
    expect(new Date(res.json().observed.snapshotVersion).toISOString()).toBe(
      new Date(row.rows[0].observed_at).toISOString(),
    );
  });
});
