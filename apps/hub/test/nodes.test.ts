import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { freshDb } from "./helpers.js";
import { buildServer } from "../src/server.js";
import { seedDevData } from "../src/identity/seed.js";
import { seedDevGrants } from "../src/policy/policy.js";
import type { DbPool } from "../src/platform/db.js";

let pool: DbPool;
let app: FastifyInstance;
let token: string;

const DUMMY_CONTENT = "dummy-artifact-content";
const DUMMY_DIGEST = `sha256:${createHash("sha256").update(DUMMY_CONTENT).digest("hex")}`;

beforeAll(async () => {
  pool = await freshDb("evoos_test_nodes");
  await seedDevData(pool);
  await seedDevGrants(pool);
  app = buildServer({ pool });
  const res = await app.inject({
    method: "POST",
    url: "/auth/dev-login",
    payload: { email: "dev-a@evolutionos.local" },
  });
  token = res.json().token;
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

async function enroll(name = "node-local"): Promise<{ nodeId: string; token: string }> {
  const res = await app.inject({
    method: "POST",
    url: "/nodes/enroll",
    headers: { authorization: `Bearer ${token}` },
    payload: { name },
  });
  expect(res.statusCode).toBe(201);
  return res.json();
}

describe("node enroll and dummy sync (TRUST-12/13/14)", () => {
  it("enroll registers the node identity and acknowledges with a one-time token", async () => {
    const ack = await enroll("node-enroll-test");
    expect(ack).toMatchObject({
      nodeId: expect.stringMatching(/^node_/),
      token: expect.stringMatching(/^nodetok_/),
    });
    const row = await pool.query(
      "select org_id, workspace_id, name, token_hash, revoked_at from node_agents where id = $1",
      [ack.nodeId],
    );
    expect(row.rows[0]).toMatchObject({
      org_id: "org_dev_a",
      workspace_id: "ws_dev_a",
      name: "node-enroll-test",
      revoked_at: null,
    });
    // Só o hash persiste — nunca o token em claro.
    expect(row.rows[0].token_hash).not.toContain(ack.token);
  });

  it("enroll without an operator session is rejected with 401", async () => {
    const res = await app.inject({ method: "POST", url: "/nodes/enroll", payload: { name: "x" } });
    expect(res.statusCode).toBe(401);
  });

  it("sync from an enrolled node records the artifact with its content digest", async () => {
    const { nodeId, token: nodeToken } = await enroll();
    const res = await app.inject({
      method: "POST",
      url: `/nodes/${nodeId}/artifacts`,
      headers: { "x-node-token": nodeToken },
      payload: { name: "dummy.txt", digest: DUMMY_DIGEST, content: DUMMY_CONTENT },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ digest: DUMMY_DIGEST, recorded: true });
    const row = await pool.query("select name, digest from node_artifacts where node_id = $1", [
      nodeId,
    ]);
    expect(row.rows[0]).toEqual({ name: "dummy.txt", digest: DUMMY_DIGEST });
  });

  it("sync with a content that does not match the declared digest is rejected", async () => {
    const { nodeId, token: nodeToken } = await enroll();
    const res = await app.inject({
      method: "POST",
      url: `/nodes/${nodeId}/artifacts`,
      headers: { "x-node-token": nodeToken },
      payload: { name: "dummy.txt", digest: DUMMY_DIGEST, content: "tampered" },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().title).toBe("digest_mismatch");
  });

  it("sync without a valid token is rejected with 401 (non-enrolled node)", async () => {
    const { nodeId } = await enroll();
    for (const headers of [{}, { "x-node-token": "nodetok_forged" }]) {
      const res = await app.inject({
        method: "POST",
        url: `/nodes/${nodeId}/artifacts`,
        headers,
        payload: { name: "dummy.txt", digest: DUMMY_DIGEST },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().title).toBe("node_unauthorized");
    }
  });

  it("sync to an unknown node id is rejected with 401", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/nodes/node_desconhecido/artifacts",
      headers: { "x-node-token": "nodetok_x" },
      payload: { name: "dummy.txt", digest: DUMMY_DIGEST },
    });
    expect(res.statusCode).toBe(401);
  });
});
