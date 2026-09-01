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
let projectId: string;
let nodeId: string;
let nodeToken: string;

async function syncMultiManifest(): Promise<void> {
  await app.inject({
    method: "POST",
    url: `/projects/${projectId}/snapshots`,
    headers: { "x-node-id": nodeId, "x-node-token": nodeToken },
    payload: {
      manifests: [
        { ecosystem: "npm", location: "packages/a", name: "a" },
        { ecosystem: "npm", location: "packages/b", name: "b" },
      ],
      languages: {},
    },
  });
}

async function listCandidates(token = tokenA) {
  return app.inject({
    method: "GET",
    url: `/projects/${projectId}/candidates`,
    headers: { authorization: `Bearer ${token}` },
  });
}

beforeAll(async () => {
  pool = await freshDb("evoos_test_candidates");
  await seedDevData(pool);
  await seedDevGrants(pool);
  app = buildServer({ pool });
  const loginA = await app.inject({
    method: "POST",
    url: "/auth/dev-login",
    payload: { email: "dev-a@evolutionos.local" },
  });
  tokenA = loginA.json().token;
  const loginB = await app.inject({
    method: "POST",
    url: "/auth/dev-login",
    payload: { email: "dev-b@evolutionos.local" },
  });
  tokenB = loginB.json().token;

  const reg = await app.inject({
    method: "POST",
    url: "/projects",
    headers: { authorization: `Bearer ${tokenA}`, "idempotency-key": "cand-setup" },
    payload: {
      apiVersion: "evolutionos.io/v1alpha1",
      kind: "EvolutionProject",
      metadata: { name: "Proj Candidates", slug: "proj-cand", type: "service", status: "discovery" },
      spec: { intent: { problem: "x" } },
    },
  });
  projectId = reg.json().projectId;

  const enroll = await app.inject({
    method: "POST",
    url: "/nodes/enroll",
    headers: { authorization: `Bearer ${tokenA}` },
    payload: { name: "node-cand" },
  });
  nodeId = enroll.json().nodeId;
  nodeToken = enroll.json().token;

  await syncMultiManifest();
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

async function findComponentCandidate(): Promise<{ id: string }> {
  const list = await listCandidates();
  const found = list
    .json()
    .candidates.find((c: { kind: string; status: string }) => c.kind === "component" && c.status === "pending");
  return found;
}

describe("candidate confirmation and rejection (TWIN-07/10/11/12)", () => {
  it("lists candidates as pending with inferred payload", async () => {
    const res = await listCandidates();
    expect(res.statusCode).toBe(200);
    const { candidates } = res.json();
    expect(candidates.length).toBe(4); // 2 manifests × (component + contains)
    for (const c of candidates) {
      expect(c.status).toBe("pending");
    }
  });

  it("confirming a component candidate creates a declared artifact and preserves the inferred record unchanged", async () => {
    const candidate = await findComponentCandidate();
    const before = await pool.query(
      "select kind, location, payload, snapshot_id as \"snapshotId\" from candidates where id = $1",
      [candidate.id],
    );

    const res = await app.inject({
      method: "POST",
      url: `/projects/${projectId}/candidates/${candidate.id}/confirm`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(res.statusCode).toBe(200);
    const { candidate: confirmed } = res.json();
    expect(confirmed.status).toBe("confirmed");
    expect(confirmed.confirmedEntityId).toMatch(/^art_/);

    const artifact = await pool.query(
      "select type from artifacts where id = $1",
      [confirmed.confirmedEntityId],
    );
    expect(artifact.rows[0]).toEqual({ type: "component" });

    // TWIN-10: o registro inferred original (kind/location/payload/snapshot_id)
    // fica byte-a-byte igual — só status/confirmed_entity_id/decided_at mudam.
    const after = await pool.query(
      "select kind, location, payload, snapshot_id as \"snapshotId\" from candidates where id = $1",
      [candidate.id],
    );
    expect(after.rows[0]).toEqual(before.rows[0]);
  });

  it("rejecting a candidate preserves the record with a reason instead of deleting it", async () => {
    const list = await listCandidates();
    const pendingContains = list
      .json()
      .candidates.find((c: { kind: string; status: string }) => c.kind === "contains" && c.status === "pending");
    const res = await app.inject({
      method: "POST",
      url: `/projects/${projectId}/candidates/${pendingContains.id}/reject`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { reason: "duplicado com outro pacote" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().candidate).toMatchObject({ status: "rejected", reason: "duplicado com outro pacote" });

    const still = await pool.query("select status from candidates where id = $1", [pendingContains.id]);
    expect(still.rowCount).toBe(1);
    expect(still.rows[0].status).toBe("rejected");
  });

  it("confirming an already-decided candidate returns 409 without changing it", async () => {
    const list = await listCandidates();
    const confirmed = list.json().candidates.find((c: { status: string }) => c.status === "confirmed");
    const before = await pool.query("select decided_at from candidates where id = $1", [confirmed.id]);
    const res = await app.inject({
      method: "POST",
      url: `/projects/${projectId}/candidates/${confirmed.id}/confirm`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(res.statusCode).toBe(409);
    const after = await pool.query("select decided_at from candidates where id = $1", [confirmed.id]);
    expect(after.rows[0].decided_at).toEqual(before.rows[0].decided_at);
  });

  it("rejecting an already-decided candidate returns 409 without changing it (TWIN-12 symmetric case)", async () => {
    const list = await listCandidates();
    const rejected = list.json().candidates.find((c: { status: string }) => c.status === "rejected");
    const before = await pool.query("select reason, decided_at from candidates where id = $1", [
      rejected.id,
    ]);
    const res = await app.inject({
      method: "POST",
      url: `/projects/${projectId}/candidates/${rejected.id}/reject`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { reason: "outra tentativa" },
    });
    expect(res.statusCode).toBe(409);
    const after = await pool.query("select reason, decided_at from candidates where id = $1", [
      rejected.id,
    ]);
    expect(after.rows[0]).toEqual(before.rows[0]);
  });

  it("a candidate remains confirmable after its originating snapshot is superseded by a newer one", async () => {
    const pendingBefore = await listCandidates();
    const stillPending = pendingBefore
      .json()
      .candidates.find((c: { status: string; kind: string }) => c.status === "pending" && c.kind === "contains");
    // Um novo snapshot idêntico não deve mexer no candidate pendente restante.
    await syncMultiManifest();
    const res = await app.inject({
      method: "POST",
      url: `/projects/${projectId}/candidates/${stillPending.id}/confirm`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().candidate.status).toBe("confirmed");
  });

  it("rejecting an unknown candidate returns 404", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/projects/${projectId}/candidates/cand_unknown/reject`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it("candidates listing is denied cross-tenant", async () => {
    const res = await listCandidates(tokenB);
    expect(res.statusCode).toBe(403);
  });
});
