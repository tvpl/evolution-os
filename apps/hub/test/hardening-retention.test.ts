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

async function registerProject(slug: string): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/projects",
    headers: { authorization: `Bearer ${tokenA}`, "idempotency-key": `retention-${slug}` },
    payload: {
      apiVersion: "evolutionos.io/v1alpha1",
      kind: "EvolutionProject",
      metadata: { name: slug, slug, type: "idea", status: "discovery" },
      spec: { intent: { problem: "x" } },
    },
  });
  return res.json().projectId;
}

async function createEvidence(statement: string): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: `/projects/${projectId}/evidence`,
    headers: { authorization: `Bearer ${tokenA}` },
    payload: { type: "humanStatement", statement },
  });
  expect(res.statusCode).toBe(201);
  return res.json().evidenceId as string;
}

async function activateEvidence(evidenceId: string) {
  const res = await app.inject({
    method: "POST",
    url: `/projects/${projectId}/evidence/${evidenceId}/activate`,
    headers: { authorization: `Bearer ${tokenA}` },
  });
  expect(res.statusCode).toBe(200);
}

async function setRetention(token: string, evidenceRetentionDays: unknown) {
  return app.inject({
    method: "POST",
    url: "/orgs/current/retention",
    headers: { authorization: `Bearer ${token}` },
    payload: { evidenceRetentionDays },
  });
}

async function sweep(token: string) {
  return app.inject({
    method: "POST",
    url: "/orgs/current/retention/sweep",
    headers: { authorization: `Bearer ${token}` },
  });
}

async function backdate(evidenceId: string, daysAgo: number) {
  await pool.query(
    `update evidence set created_at = now() - make_interval(days => $2) where id = $1`,
    [evidenceId, daysAgo],
  );
}

beforeAll(async () => {
  pool = await freshDb("evoos_test_hardening_retention");
  await seedDevData(pool);
  await seedDevGrants(pool);
  app = buildServer({ pool });
  const loginA = await app.inject({ method: "POST", url: "/auth/dev-login", payload: { email: "dev-a@evolutionos.local" } });
  tokenA = loginA.json().token;
  const loginB = await app.inject({ method: "POST", url: "/auth/dev-login", payload: { email: "dev-b@evolutionos.local" } });
  tokenB = loginB.json().token;
  projectId = await registerProject("retention-proj");
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

describe("Evidence retention policy and sweep (HARD-12..17)", () => {
  it("persists a positive integer retention window (HARD-12)", async () => {
    const res = await setRetention(tokenA, 90);
    expect(res.statusCode).toBe(200);
    const row = await pool.query("select evidence_retention_days as days from org_retention_policies where org_id = 'org_dev_a'");
    expect(row.rows[0].days).toBe(90);
  });

  it("rejects a non-positive or non-integer window with 422 (HARD-13)", async () => {
    for (const bad of [0, -1, 1.5, "30", null, undefined]) {
      const res = await setRetention(tokenB, bad);
      expect(res.statusCode).toBe(422);
      expect(res.json().title).toBe("invalid_retention_window");
    }
  });

  it("rejects a sweep before any retention window is configured (HARD-14)", async () => {
    const res = await sweep(tokenB);
    expect(res.statusCode).toBe(422);
    expect(res.json().title).toBe("retention_not_configured");
  });

  it("redacts evidence older than the window without deleting it, leaves in-window evidence untouched, and preserves referencing claim lineage (HARD-15/16/17)", async () => {
    await setRetention(tokenA, 30);

    const oldId = await createEvidence("evidência antiga, deve ser redigida");
    await backdate(oldId, 45);
    const freshId = await createEvidence("evidência recente, deve ficar intocada");

    await activateEvidence(oldId);
    const claimRes = await app.inject({
      method: "POST",
      url: `/projects/${projectId}/claims`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { statement: "claim sobre evidência antiga", epistemicType: "fact", evidenceIds: [oldId] },
    });
    expect(claimRes.statusCode).toBe(201);

    const before = await pool.query(
      "select content_digest, content_excerpt from evidence where id = $1",
      [oldId],
    );
    const digestBefore = before.rows[0].content_digest;

    const res = await sweep(tokenA);
    expect(res.statusCode).toBe(200);
    expect(res.json().redactedCount).toBe(1);

    const oldRow = await pool.query(
      "select content_excerpt, content_digest, redacted_at from evidence where id = $1",
      [oldId],
    );
    expect(oldRow.rows[0].content_excerpt).toBeNull();
    expect(oldRow.rows[0].content_digest).toBe(digestBefore);
    expect(oldRow.rows[0].redacted_at).not.toBeNull();

    const freshRow = await pool.query(
      "select content_excerpt, redacted_at from evidence where id = $1",
      [freshId],
    );
    expect(freshRow.rows[0].content_excerpt).toBe("evidência recente, deve ficar intocada");
    expect(freshRow.rows[0].redacted_at).toBeNull();

    const claimRow = await pool.query("select statement from claims where id = $1", [claimRes.json().claimId]);
    expect(claimRow.rows[0].statement).toBe("claim sobre evidência antiga");
    const linkRow = await pool.query(
      "select count(*)::int as n from claim_evidence where claim_id = $1 and evidence_id = $2",
      [claimRes.json().claimId, oldId],
    );
    expect(linkRow.rows[0].n).toBe(1);
  });

  it("returns count 0 when no evidence is eligible for redaction (re-running a sweep with nothing new to redact)", async () => {
    const res = await sweep(tokenA);
    expect(res.statusCode).toBe(200);
    expect(res.json().redactedCount).toBe(0);
  });
});
