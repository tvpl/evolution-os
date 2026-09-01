import { validateProject } from "@evolution-os/contracts";
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
  pool = await freshDb("evoos_test_export");
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
    headers: { authorization: `Bearer ${tokenA}`, "idempotency-key": "exp-setup" },
    payload: {
      apiVersion: "evolutionos.io/v1alpha1",
      kind: "EvolutionProject",
      metadata: { name: "Proj Export", slug: "proj-exp", type: "idea", status: "discovery" },
      spec: {
        intent: { problem: "x" },
        hypotheses: [
          { id: "hyp-exp", statement: "H", type: "desirability", evidenceState: "untested", status: "active" },
        ],
        constraints: [{ id: "con-exp", statement: "C", severity: "mandatory" }],
      },
    },
  });
  projectId = reg.json().projectId;

  await app.inject({
    method: "POST",
    url: `/projects/${projectId}/artifacts`,
    headers: { authorization: `Bearer ${tokenA}` },
    payload: { type: "prd", title: "PRD", content: "conteúdo" },
  });
  await app.inject({
    method: "POST",
    url: `/projects/${projectId}/decisions`,
    headers: { authorization: `Bearer ${tokenA}` },
    payload: { decision: "accept", rationale: "ok" },
  });
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

describe("project export (IDEA-17)", () => {
  it("export passes the v0 project schema", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/projects/${projectId}/export`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(res.statusCode).toBe(200);
    const manifest = res.json();
    expect(validateProject(manifest)).toEqual({ ok: true, errors: [] });
  });

  it("export omits null category rather than emitting an invalid null (schema types it as string)", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/projects/${projectId}/export`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    const manifest = res.json();
    expect(manifest.spec.constraints[0]).not.toHaveProperty("category");
  });

  it("export preserves original hypothesis, artifact and decision IDs", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/projects/${projectId}/export`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    const manifest = res.json();
    expect(manifest.metadata.id).toBe(projectId);
    expect(manifest.spec.hypotheses[0].id).toBe("hyp-exp");
    expect(manifest.spec.constraints[0].id).toBe("con-exp");
    expect(manifest.spec.artifacts[0]).toMatchObject({ type: "prd", title: "PRD", version: 1 });
    expect(manifest.spec.decisions[0]).toMatchObject({ decision: "accept" });
  });

  it("export is denied cross-tenant", async () => {
    const loginB = await app.inject({
      method: "POST",
      url: "/auth/dev-login",
      payload: { email: "dev-b@evolutionos.local" },
    });
    const tokenB = loginB.json().token;
    const res = await app.inject({
      method: "GET",
      url: `/projects/${projectId}/export`,
      headers: { authorization: `Bearer ${tokenB}` },
    });
    expect(res.statusCode).toBe(403);
  });
});
