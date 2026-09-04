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
let tokenB: string;

beforeAll(async () => {
  pool = await freshDb("evoos_test_hardening_nodes");
  await seedDevData(pool);
  await seedDevGrants(pool);
  app = buildServer({ pool });
  const loginA = await app.inject({ method: "POST", url: "/auth/dev-login", payload: { email: "dev-a@evolutionos.local" } });
  tokenA = loginA.json().token;
  const loginB = await app.inject({ method: "POST", url: "/auth/dev-login", payload: { email: "dev-b@evolutionos.local" } });
  tokenB = loginB.json().token;
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

async function enroll(token: string, name: string): Promise<{ nodeId: string; token: string }> {
  const res = await app.inject({
    method: "POST",
    url: "/nodes/enroll",
    headers: { authorization: `Bearer ${token}` },
    payload: { name },
  });
  expect(res.statusCode).toBe(201);
  return res.json();
}

async function sync(nodeId: string, nodeToken: string) {
  return app.inject({
    method: "POST",
    url: `/nodes/${nodeId}/artifacts`,
    headers: { "x-node-token": nodeToken },
    payload: { name: "x.txt", digest: "sha256:deadbeef" },
  });
}

async function revoke(nodeId: string, token: string) {
  return app.inject({
    method: "POST",
    url: `/orgs/current/nodes/${nodeId}/revoke`,
    headers: { authorization: `Bearer ${token}` },
  });
}

async function listFleet(token: string) {
  return app.inject({
    method: "GET",
    url: "/orgs/current/nodes",
    headers: { authorization: `Bearer ${token}` },
  });
}

describe("Node fleet kill switch (HARD-01..05)", () => {
  it("revokes a node and denies its subsequent authentication (HARD-01)", async () => {
    const { nodeId, token: nodeToken } = await enroll(tokenA, "node-revoke-target");
    const before = await sync(nodeId, nodeToken);
    expect(before.statusCode).toBe(201);

    const res = await revoke(nodeId, tokenA);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ nodeId, revoked: true });

    const after = await sync(nodeId, nodeToken);
    expect(after.statusCode).toBe(401);
    expect(after.json().title).toBe("node_unauthorized");
  });

  it("lists the org's fleet with exact revoked status (HARD-02)", async () => {
    const { nodeId: activeId } = await enroll(tokenA, "node-fleet-active");
    const { nodeId: revokedId } = await enroll(tokenA, "node-fleet-revoked");
    await revoke(revokedId, tokenA);

    const res = await listFleet(tokenA);
    expect(res.statusCode).toBe(200);
    const fleet = res.json().fleet as Array<{ id: string; revokedAt: string | null }>;
    const active = fleet.find((n) => n.id === activeId);
    const revoked = fleet.find((n) => n.id === revokedId);
    expect(active?.revokedAt).toBeNull();
    expect(revoked?.revokedAt).not.toBeNull();
  });

  it("rejects revoking an unknown node with 404 (HARD-03)", async () => {
    const res = await revoke("node_does_not_exist", tokenA);
    expect(res.statusCode).toBe(404);
  });

  it("rejects revoking a node from another org with 404, never confirming existence (HARD-03)", async () => {
    const { nodeId } = await enroll(tokenB, "node-other-org");
    const res = await revoke(nodeId, tokenA);
    expect(res.statusCode).toBe(404);
  });

  it("is idempotent when revoking an already-revoked node (HARD-04)", async () => {
    const { nodeId } = await enroll(tokenA, "node-idempotent-revoke");
    const first = await revoke(nodeId, tokenA);
    expect(first.statusCode).toBe(200);
    const row1 = await pool.query("select revoked_at from node_agents where id = $1", [nodeId]);
    const revokedAt1 = row1.rows[0].revoked_at;

    const second = await revoke(nodeId, tokenA);
    expect(second.statusCode).toBe(200);
    const row2 = await pool.query("select revoked_at from node_agents where id = $1", [nodeId]);
    expect(row2.rows[0].revoked_at).toEqual(revokedAt1);
  });

  it("rejects revoke without the admin.write capability with 403 (HARD-05)", async () => {
    const { nodeId } = await enroll(tokenB, "node-no-capability");
    await pool.query("delete from capability_grants where org_id = 'org_dev_b' and capability = 'admin.write'");
    const res = await revoke(nodeId, tokenB);
    expect(res.statusCode).toBe(403);
    expect(res.json().title).toBe("capability_denied");
    await pool.query(
      `insert into capability_grants (id, org_id, workspace_id, principal, capability)
       values ('grant_org_dev_b_admin.write', 'org_dev_b', 'ws_dev_b', '*', 'admin.write')
       on conflict (org_id, workspace_id, principal, capability) do nothing`,
    );
  });

  it("never leaks another org's nodes through the fleet listing", async () => {
    const { nodeId: nodeIdA } = await enroll(tokenA, "node-isolation-a");
    const { nodeId: nodeIdB } = await enroll(tokenB, "node-isolation-b");
    const listA = await listFleet(tokenA);
    const listB = await listFleet(tokenB);
    const idsA = (listA.json().fleet as Array<{ id: string }>).map((n) => n.id);
    const idsB = (listB.json().fleet as Array<{ id: string }>).map((n) => n.id);
    expect(idsA).toContain(nodeIdA);
    expect(idsA).not.toContain(nodeIdB);
    expect(idsB).toContain(nodeIdB);
    expect(idsB).not.toContain(nodeIdA);
  });
});
