import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
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
let nodeId: string;
let nodeToken: string;

function manifestEntry(location: string, ecosystem = "npm") {
  return { ecosystem, location, name: `pkg-${location}` };
}

async function sync(body: Record<string, unknown>) {
  return app.inject({
    method: "POST",
    url: `/projects/${projectId}/snapshots`,
    headers: { "x-node-id": nodeId, "x-node-token": nodeToken },
    payload: body,
  });
}

beforeAll(async () => {
  pool = await freshDb("evoos_test_snapshots");
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
    headers: { authorization: `Bearer ${tokenA}`, "idempotency-key": "snap-setup" },
    payload: {
      apiVersion: "evolutionos.io/v1alpha1",
      kind: "EvolutionProject",
      metadata: { name: "Proj Snapshot", slug: "proj-snap", type: "service", status: "discovery" },
      spec: { intent: { problem: "x" } },
    },
  });
  projectId = reg.json().projectId;

  const enroll = await app.inject({
    method: "POST",
    url: "/nodes/enroll",
    headers: { authorization: `Bearer ${tokenA}` },
    payload: { name: "node-snap" },
  });
  nodeId = enroll.json().nodeId;
  nodeToken = enroll.json().token;
});

beforeEach(async () => {
  await pool.query("delete from candidates");
  await pool.query("delete from snapshots");
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

describe("snapshot ingestion and cartographer (TWIN-01/03/05/06/08/09/13)", () => {
  it("a single manifest coherent with the declared type proposes no candidates", async () => {
    const res = await sync({
      branch: "main",
      commitSha: "a".repeat(40),
      manifests: [manifestEntry(".")],
      languages: { TypeScript: 10 },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ candidatesProposed: 0 });
  });

  it("a snapshot with 3 manifests proposes exactly 3 pending component+contains candidates", async () => {
    const res = await sync({
      branch: "main",
      commitSha: "b".repeat(40),
      manifests: [manifestEntry("packages/a"), manifestEntry("packages/b"), manifestEntry("packages/c")],
      languages: {},
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().candidatesProposed).toBe(6); // 3 component + 3 contains

    const candidates = await pool.query(
      "select kind, location, status, payload->>'ecosystem' as ecosystem from candidates where project_id = $1 order by location, kind",
      [projectId],
    );
    expect(candidates.rowCount).toBe(6);
    for (const row of candidates.rows as Array<{ status: string }>) {
      expect(row.status).toBe("pending");
    }
  });

  it("resyncing the same manifests does not duplicate pending candidates", async () => {
    const manifests = [manifestEntry("packages/x"), manifestEntry("packages/y")];
    await sync({ manifests, languages: {} });
    const before = await pool.query("select count(*)::int as n from candidates where project_id = $1", [
      projectId,
    ]);
    const second = await sync({ manifests, languages: {} });
    expect(second.json().candidatesProposed).toBe(0);
    const after = await pool.query("select count(*)::int as n from candidates where project_id = $1", [
      projectId,
    ]);
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });

  it("concurrent snapshots for the same project are both stored as distinct versions", async () => {
    const [r1, r2] = await Promise.all([
      sync({ manifests: [manifestEntry(".")], languages: {} }),
      sync({ manifests: [manifestEntry(".")], languages: {} }),
    ]);
    expect(r1.statusCode).toBe(201);
    expect(r2.statusCode).toBe(201);
    expect(r1.json().snapshotId).not.toBe(r2.json().snapshotId);
    const rows = await pool.query("select count(*)::int as n from snapshots where project_id = $1", [
      projectId,
    ]);
    expect(rows.rows[0].n).toBe(2);
  });

  it("listing snapshots returns most-recent-first", async () => {
    await sync({ manifests: [], languages: {} });
    await sync({ manifests: [], languages: {} });
    const list = await app.inject({
      method: "GET",
      url: `/projects/${projectId}/snapshots`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(list.statusCode).toBe(200);
    const { snapshots } = list.json();
    const dates = snapshots.map((s: { observedAt: string }) => s.observedAt);
    expect(dates).toEqual([...dates].sort().reverse());
  });

  it("sync without a valid node token is rejected 401", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/projects/${projectId}/snapshots`,
      headers: { "x-node-id": nodeId, "x-node-token": "forged" },
      payload: { manifests: [], languages: {} },
    });
    expect(res.statusCode).toBe(401);
  });

  it("sync with an invalid payload shape is rejected 422", async () => {
    const res = await sync({ manifests: "not-an-array", languages: {} });
    expect(res.statusCode).toBe(422);
  });
});
