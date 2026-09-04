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
  pool = await freshDb("evoos_test_timeline");
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
    headers: { authorization: `Bearer ${tokenA}`, "idempotency-key": "tl-setup" },
    payload: {
      apiVersion: "evolutionos.io/v1alpha1",
      kind: "EvolutionProject",
      metadata: { name: "Proj Timeline", slug: "proj-tl", type: "idea", status: "discovery" },
      spec: {
        intent: { problem: "x" },
        hypotheses: [
          { id: "hyp-tl", statement: "H", type: "desirability", evidenceState: "untested", status: "active" },
        ],
      },
    },
  });
  projectId = reg.json().projectId;

  const artifact = await app.inject({
    method: "POST",
    url: `/projects/${projectId}/artifacts`,
    headers: { authorization: `Bearer ${tokenA}` },
    payload: { type: "prd", title: "PRD TL", content: "x" },
  });
  const { artifactId } = artifact.json();
  await app.inject({
    method: "POST",
    url: `/projects/${projectId}/artifacts/${artifactId}/versions`,
    headers: { authorization: `Bearer ${tokenA}` },
    payload: { content: "y" },
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

describe("project timeline (IDEA-16)", () => {
  it("merges hypothesis, artifact version and decision events ordered desc", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/projects/${projectId}/timeline`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(res.statusCode).toBe(200);
    const { timeline } = res.json();
    const kinds = timeline.map((e: { kind: string }) => e.kind);
    expect(kinds).toEqual(expect.arrayContaining(["hypothesis", "artifact_version", "decision"]));
    // Two artifact_version events (v1 create + v2 append).
    expect(kinds.filter((k: string) => k === "artifact_version")).toHaveLength(2);

    const dates = timeline.map((e: { occurredAt: string }) => e.occurredAt);
    const sorted = [...dates].sort().reverse();
    expect(dates).toEqual(sorted);
  });

  it("timeline is denied cross-tenant", async () => {
    const loginB = await app.inject({
      method: "POST",
      url: "/auth/dev-login",
      payload: { email: "dev-b@evolutionos.local" },
    });
    const tokenB = loginB.json().token;
    const res = await app.inject({
      method: "GET",
      url: `/projects/${projectId}/timeline`,
      headers: { authorization: `Bearer ${tokenB}` },
    });
    expect(res.statusCode).toBe(403);
  });
});
