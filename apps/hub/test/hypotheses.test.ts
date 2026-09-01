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

function manifest(
  slug: string,
  hypotheses?: Array<Record<string, unknown>>,
): Record<string, unknown> {
  return {
    apiVersion: "evolutionos.io/v1alpha1",
    kind: "EvolutionProject",
    metadata: { name: `Projeto ${slug}`, slug, type: "idea", status: "discovery" },
    spec: {
      intent: { problem: "Problema de teste" },
      ...(hypotheses ? { hypotheses } : {}),
    },
  };
}

async function register(key: string, body: Record<string, unknown>) {
  return app.inject({
    method: "POST",
    url: "/projects",
    headers: { authorization: `Bearer ${tokenA}`, "idempotency-key": key },
    payload: body,
  });
}

beforeAll(async () => {
  pool = await freshDb("evoos_test_hypotheses");
  await seedDevData(pool);
  await seedDevGrants(pool);
  app = buildServer({ pool });
  const res = await app.inject({
    method: "POST",
    url: "/auth/dev-login",
    payload: { email: "dev-a@evolutionos.local" },
  });
  tokenA = res.json().token;
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

describe("hypotheses persisted on registration (IDEA-01/02/03/04)", () => {
  it("registration with two hypotheses persists both with authority declared", async () => {
    const res = await register(
      "hyp-key-1",
      manifest("proj-hyp-1", [
        { id: "hyp-a", statement: "Hipótese A", type: "desirability", evidenceState: "untested", status: "active" },
        { id: "hyp-b", statement: "Hipótese B", type: "viability", evidenceState: "untested", status: "active" },
      ]),
    );
    expect(res.statusCode).toBe(201);
    const { projectId } = res.json();

    const list = await app.inject({
      method: "GET",
      url: `/projects/${projectId}/hypotheses`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(list.statusCode).toBe(200);
    const { hypotheses } = list.json();
    expect(hypotheses).toHaveLength(2);
    expect(hypotheses[0]).toMatchObject({ id: "hyp-a", statement: "Hipótese A", authority: "declared" });
    expect(hypotheses[1]).toMatchObject({ id: "hyp-b", authority: "declared" });
  });

  it("duplicate hypothesis id in the manifest is rejected 422 without persisting anything", async () => {
    const before = await pool.query("select count(*)::int as n from projects");
    const res = await register(
      "hyp-key-dup",
      manifest("proj-hyp-dup", [
        { id: "hyp-x", statement: "X", type: "desirability", evidenceState: "untested", status: "active" },
        { id: "hyp-x", statement: "X again", type: "desirability", evidenceState: "untested", status: "active" },
      ]),
    );
    expect(res.statusCode).toBe(422);
    expect(res.json().title).toBe("duplicate_hypothesis_id");
    expect(res.json().detail).toContain("hyp-x");
    const after = await pool.query("select count(*)::int as n from projects");
    expect(after.rows[0].n).toBe(before.rows[0].n);
    const orphanProject = await pool.query(
      "select 1 from projects where manifest->'metadata'->>'slug' = 'proj-hyp-dup'",
    );
    expect(orphanProject.rowCount).toBe(0);
  });

  it("two different projects may each declare a hypothesis with the same manifest-local id", async () => {
    const h = [{ id: "hyp-shared", statement: "Compartilhada", type: "desirability", evidenceState: "untested", status: "active" }];
    const r1 = await register("hyp-key-shared-1", manifest("proj-shared-1", h));
    const r2 = await register("hyp-key-shared-2", manifest("proj-shared-2", h));
    expect(r1.statusCode).toBe(201);
    expect(r2.statusCode).toBe(201);
  });

  it("registration without spec.hypotheses succeeds with an empty hypothesis list", async () => {
    const res = await register("hyp-key-none", manifest("proj-hyp-none"));
    expect(res.statusCode).toBe(201);
    const { projectId } = res.json();
    const list = await app.inject({
      method: "GET",
      url: `/projects/${projectId}/hypotheses`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(list.json().hypotheses).toEqual([]);
  });

  it("hypotheses list is denied cross-tenant", async () => {
    const res = await register("hyp-key-xt", manifest("proj-hyp-xt"));
    const { projectId } = res.json();
    const loginB = await app.inject({
      method: "POST",
      url: "/auth/dev-login",
      payload: { email: "dev-b@evolutionos.local" },
    });
    const tokenB = loginB.json().token;
    const list = await app.inject({
      method: "GET",
      url: `/projects/${projectId}/hypotheses`,
      headers: { authorization: `Bearer ${tokenB}` },
    });
    expect(list.statusCode).toBe(403);
  });

  it("hypotheses list requires authentication", async () => {
    const res = await app.inject({ method: "GET", url: "/projects/prj_x/hypotheses" });
    expect(res.statusCode).toBe(401);
  });
});
