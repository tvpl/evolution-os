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

function manifest(slug: string): Record<string, unknown> {
  return {
    apiVersion: "evolutionos.io/v1alpha1",
    kind: "EvolutionProject",
    metadata: { name: `Projeto ${slug}`, slug, type: "idea", status: "discovery" },
    spec: {
      intent: { problem: "Problema de teste" },
      hypotheses: [
        { id: "hyp-1", statement: "H1", type: "desirability", evidenceState: "untested", status: "active" },
      ],
      constraints: [{ id: "con-1", statement: "C1", severity: "mandatory" }],
    },
  };
}

async function register(token: string, key: string, slug: string) {
  return app.inject({
    method: "POST",
    url: "/projects",
    headers: { authorization: `Bearer ${token}`, "idempotency-key": key },
    payload: manifest(slug),
  });
}

beforeAll(async () => {
  pool = await freshDb("evoos_test_overview");
  await seedDevData(pool);
  await seedDevGrants(pool);
  app = buildServer({ pool });
  for (const [email, setter] of [
    ["dev-a@evolutionos.local", (t: string) => (tokenA = t)],
    ["dev-b@evolutionos.local", (t: string) => (tokenB = t)],
  ] as const) {
    const res = await app.inject({ method: "POST", url: "/auth/dev-login", payload: { email } });
    setter(res.json().token);
  }
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

describe("project overview (IDEA-05/06)", () => {
  it("returns identity, intent, hypotheses, constraints and counts in one response", async () => {
    const reg = await register(tokenA, "ov-key-1", "proj-ov-1");
    const { projectId } = reg.json();
    const res = await app.inject({
      method: "GET",
      url: `/projects/${projectId}/overview`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({
      projectId,
      type: "idea",
      status: "discovery",
      intent: { problem: "Problema de teste" },
      artifactCount: 0,
      decisionCount: 0,
    });
    expect(body.hypotheses).toHaveLength(1);
    expect(body.constraints).toHaveLength(1);
  });

  it("overview of a project with zero hypotheses/constraints/artifacts/decisions returns empty arrays, not an error", async () => {
    const reg = await register(tokenA, "ov-key-empty", "proj-ov-empty-src");
    // Register a project without hypotheses/constraints to prove the empty path.
    const emptyManifest = {
      apiVersion: "evolutionos.io/v1alpha1",
      kind: "EvolutionProject",
      metadata: { name: "Vazio", slug: "proj-ov-empty", type: "idea", status: "discovery" },
      spec: { intent: { problem: "x" } },
    };
    const empty = await app.inject({
      method: "POST",
      url: "/projects",
      headers: { authorization: `Bearer ${tokenA}`, "idempotency-key": "ov-key-empty-2" },
      payload: emptyManifest,
    });
    const { projectId } = empty.json();
    const res = await app.inject({
      method: "GET",
      url: `/projects/${projectId}/overview`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ hypotheses: [], constraints: [], artifactCount: 0, decisionCount: 0 });
    expect(reg.statusCode).toBe(201);
  });

  it("cross-tenant overview is denied and audited", async () => {
    const reg = await register(tokenA, "ov-key-xt", "proj-ov-xt");
    const { projectId } = reg.json();
    const res = await app.inject({
      method: "GET",
      url: `/projects/${projectId}/overview`,
      headers: { authorization: `Bearer ${tokenB}`, "x-correlation-id": "req_ov_xt" },
    });
    expect(res.statusCode).toBe(403);
    const audit = await pool.query(
      "select action, outcome, reason from audit_log where correlation_id = 'req_ov_xt'",
    );
    expect(audit.rows[0]).toEqual({
      action: "project.overview.read",
      outcome: "denied",
      reason: "cross-tenant access",
    });
  });

  it("overview of an unknown project returns 404", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/projects/prj_does_not_exist/overview",
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it("overview requires authentication", async () => {
    const res = await app.inject({ method: "GET", url: "/projects/prj_x/overview" });
    expect(res.statusCode).toBe(401);
  });
});
