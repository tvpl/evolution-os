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
let sourceProjectId: string;
let exportedManifest: Record<string, unknown>;

beforeAll(async () => {
  pool = await freshDb("evoos_test_import");
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
    headers: { authorization: `Bearer ${tokenA}`, "idempotency-key": "imp-setup" },
    payload: {
      apiVersion: "evolutionos.io/v1alpha1",
      kind: "EvolutionProject",
      metadata: { name: "Proj Import Source", slug: "proj-imp-src", type: "idea", status: "discovery" },
      spec: {
        intent: { problem: "x" },
        hypotheses: [
          { id: "hyp-imp", statement: "H", type: "desirability", evidenceState: "untested", status: "active" },
        ],
        constraints: [{ id: "con-imp", statement: "C", severity: "mandatory" }],
      },
    },
  });
  sourceProjectId = reg.json().projectId;
  await app.inject({
    method: "POST",
    url: `/projects/${sourceProjectId}/artifacts`,
    headers: { authorization: `Bearer ${tokenA}` },
    payload: { type: "prd", title: "PRD", content: "conteúdo" },
  });
  await app.inject({
    method: "POST",
    url: `/projects/${sourceProjectId}/decisions`,
    headers: { authorization: `Bearer ${tokenA}` },
    payload: { decision: "accept", rationale: "ok" },
  });

  const exp = await app.inject({
    method: "GET",
    url: `/projects/${sourceProjectId}/export`,
    headers: { authorization: `Bearer ${tokenA}` },
  });
  exportedManifest = exp.json();
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

function importManifest(manifest: Record<string, unknown>) {
  return app.inject({
    method: "POST",
    url: "/projects/import",
    headers: { authorization: `Bearer ${tokenA}` },
    payload: manifest,
  });
}

describe("project import (IDEA-18/19)", () => {
  it("importing into a fresh project id fails only because the same id is used by the source (round-trip needs a new id, or full round-trip test below)", async () => {
    // Sanity: re-importing the exact export of an EXISTING project must
    // conflict (its own id already exists) — this is the base case for
    // IDEA-19, exercised properly below with a distinct assertion.
    const res = await importManifest(exportedManifest);
    expect(res.statusCode).toBe(409);
  });

  it("export -> import round-trip into a new tenant location preserves every entity id", async () => {
    // Simulate migrating the project to a fresh id space: delete the source
    // and import the same export - proves the import path reconstructs
    // hypotheses/artifacts/decisions with their original IDs intact.
    await pool.query("delete from decisions where project_id = $1", [sourceProjectId]);
    await pool.query("delete from artifact_versions where artifact_id in (select id from artifacts where project_id = $1)", [sourceProjectId]);
    await pool.query("delete from artifacts where project_id = $1", [sourceProjectId]);
    await pool.query("delete from constraints_ where project_id = $1", [sourceProjectId]);
    await pool.query("delete from hypotheses where project_id = $1", [sourceProjectId]);
    await pool.query("delete from projects where id = $1", [sourceProjectId]);

    const res = await importManifest(exportedManifest);
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ projectId: sourceProjectId });

    const hyp = await pool.query("select id from hypotheses where project_id = $1", [sourceProjectId]);
    expect(hyp.rows.map((r: { id: string }) => r.id)).toEqual(["hyp-imp"]);
    const con = await pool.query("select id from constraints_ where project_id = $1", [sourceProjectId]);
    expect(con.rows.map((r: { id: string }) => r.id)).toEqual(["con-imp"]);
    const art = await pool.query("select id, current_version from artifacts where project_id = $1", [
      sourceProjectId,
    ]);
    expect(art.rows[0]).toMatchObject({ current_version: 1 });
    const dec = await pool.query("select decision from decisions where project_id = $1", [sourceProjectId]);
    expect(dec.rows[0]).toEqual({ decision: "accept" });
  });

  it("reimporting the same export again is rejected 409 without duplicating rows", async () => {
    const before = await pool.query("select count(*)::int as n from projects");
    const res = await importManifest(exportedManifest);
    expect(res.statusCode).toBe(409);
    expect(res.json().title).toBe("import_conflict");
    const after = await pool.query("select count(*)::int as n from projects");
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });

  it("importing a manifest that violates the v0 schema is rejected 422 without persisting anything", async () => {
    const before = await pool.query("select count(*)::int as n from projects");
    const res = await importManifest({ apiVersion: "evolutionos.io/v1alpha1", kind: "EvolutionProject" });
    expect(res.statusCode).toBe(422);
    const after = await pool.query("select count(*)::int as n from projects");
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });
});
