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
    headers: { authorization: `Bearer ${tokenA}`, "idempotency-key": `sig-${slug}` },
    payload: {
      apiVersion: "evolutionos.io/v1alpha1",
      kind: "EvolutionProject",
      metadata: { name: `Proj ${slug}`, slug, type: "idea", status: "discovery" },
      spec: { intent: { problem: "x" } },
    },
  });
  return res.json().projectId;
}

async function addActiveEvidence(target: string, sourceAuthority?: string): Promise<string> {
  const created = await app.inject({
    method: "POST",
    url: `/projects/${target}/evidence`,
    headers: { authorization: `Bearer ${tokenA}` },
    payload: {
      type: "humanStatement",
      statement: `Evidência ${Math.random()}`,
      ...(sourceAuthority ? { sourceAuthority } : {}),
    },
  });
  const { evidenceId } = created.json();
  await app.inject({
    method: "POST",
    url: `/projects/${target}/evidence/${evidenceId}/activate`,
    headers: { authorization: `Bearer ${tokenA}` },
  });
  return evidenceId;
}

async function addClaim(target: string, evidenceIds: string[]): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: `/projects/${target}/claims`,
    headers: { authorization: `Bearer ${tokenA}` },
    payload: { statement: "x", epistemicType: "inference", evidenceIds },
  });
  return res.json().claimId;
}

function linkSignal(target: string, claimId: string) {
  return app.inject({
    method: "POST",
    url: `/projects/${target}/signals`,
    headers: { authorization: `Bearer ${tokenA}` },
    payload: { claimId },
  });
}

beforeAll(async () => {
  pool = await freshDb("evoos_test_signals");
  await seedDevData(pool);
  await seedDevGrants(pool);
  app = buildServer({ pool });
  const login = await app.inject({
    method: "POST",
    url: "/auth/dev-login",
    payload: { email: "dev-a@evolutionos.local" },
  });
  tokenA = login.json().token;
  projectId = await registerProject("proj-sig");
  otherProjectId = await registerProject("proj-sig-other");
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

describe("signals — claim×project link with decomposed relevance (FLOW-09/10/11)", () => {
  it("linking a claim creates a signal with evidenceStrength and confidence as separate fields", async () => {
    const e1 = await addActiveEvidence(projectId, "corroborating");
    const e2 = await addActiveEvidence(projectId, "corroborating");
    const claimId = await addClaim(projectId, [e1, e2]);

    const res = await linkSignal(projectId, claimId);
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body).toHaveProperty("evidenceStrength");
    expect(body).toHaveProperty("confidence");
    expect(body.evidenceStrength).toBe("moderate");
    expect(body.confidence).toBe("medium");

    const row = await pool.query(
      "select evidence_strength as \"evidenceStrength\", confidence from signals where id = $1",
      [body.signalId],
    );
    expect(row.rows[0]).toEqual({ evidenceStrength: "moderate", confidence: "medium" });
  });

  it("relinking the same claim returns the existing signal instead of creating a duplicate", async () => {
    const e1 = await addActiveEvidence(projectId);
    const claimId = await addClaim(projectId, [e1]);

    const first = await linkSignal(projectId, claimId);
    expect(first.statusCode).toBe(201);
    const before = await pool.query("select count(*)::int as n from signals where claim_id = $1", [claimId]);

    const second = await linkSignal(projectId, claimId);
    expect(second.statusCode).toBe(200);
    expect(second.json().signalId).toBe(first.json().signalId);

    const after = await pool.query("select count(*)::int as n from signals where claim_id = $1", [claimId]);
    expect(after.rows[0].n).toBe(before.rows[0].n);
    expect(after.rows[0].n).toBe(1);
  });

  it("linking a claim from another project is rejected 422", async () => {
    const e1 = await addActiveEvidence(otherProjectId);
    const foreignClaimId = await addClaim(otherProjectId, [e1]);

    const res = await linkSignal(projectId, foreignClaimId);
    expect(res.statusCode).toBe(422);
    expect(res.json().title).toBe("invalid_claim_reference");
  });

  it("linking without claimId is rejected 422", async () => {
    const res = await linkSignal(projectId, "");
    expect(res.statusCode).toBe(422);
  });

  it("listing returns signals with evidenceStrength/confidence for the project", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/projects/${projectId}/signals`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(res.statusCode).toBe(200);
    const { signals } = res.json();
    expect(signals.length).toBeGreaterThanOrEqual(2);
    for (const s of signals) {
      expect(s).toHaveProperty("evidenceStrength");
      expect(s).toHaveProperty("confidence");
      expect(s).toHaveProperty("claimId");
    }
  });

  it("signals listing is denied cross-tenant", async () => {
    const loginB = await app.inject({
      method: "POST",
      url: "/auth/dev-login",
      payload: { email: "dev-b@evolutionos.local" },
    });
    const res = await app.inject({
      method: "GET",
      url: `/projects/${projectId}/signals`,
      headers: { authorization: `Bearer ${loginB.json().token}` },
    });
    expect(res.statusCode).toBe(403);
  });
});
