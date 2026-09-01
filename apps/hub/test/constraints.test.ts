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

function manifest(slug: string, constraints?: Array<Record<string, unknown>>): Record<string, unknown> {
  return {
    apiVersion: "evolutionos.io/v1alpha1",
    kind: "EvolutionProject",
    metadata: { name: `Projeto ${slug}`, slug, type: "product", status: "discovery" },
    spec: {
      intent: { problem: "Problema de teste" },
      ...(constraints ? { constraints } : {}),
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
  pool = await freshDb("evoos_test_constraints");
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

describe("constraints persisted on registration (IDEA-01/02)", () => {
  it("registration with a constraint persists it with authority declared", async () => {
    const res = await register(
      "con-key-1",
      manifest("proj-con-1", [
        { id: "con-1", category: "privacy", statement: "Dados restritos não saem do ambiente.", severity: "mandatory" },
      ]),
    );
    expect(res.statusCode).toBe(201);
    const { projectId } = res.json();
    const row = await pool.query(
      "select id, category, statement, severity, authority from constraints_ where project_id = $1",
      [projectId],
    );
    expect(row.rows[0]).toEqual({
      id: "con-1",
      category: "privacy",
      statement: "Dados restritos não saem do ambiente.",
      severity: "mandatory",
      authority: "declared",
    });
  });

  it("registration without constraints succeeds with no constraint rows", async () => {
    const res = await register("con-key-none", manifest("proj-con-none"));
    expect(res.statusCode).toBe(201);
    const { projectId } = res.json();
    const row = await pool.query("select count(*)::int as n from constraints_ where project_id = $1", [
      projectId,
    ]);
    expect(row.rows[0].n).toBe(0);
  });

  it("multiple constraints are all persisted", async () => {
    const res = await register(
      "con-key-multi",
      manifest("proj-con-multi", [
        { id: "con-a", statement: "A", severity: "mandatory" },
        { id: "con-b", statement: "B", severity: "preferred" },
      ]),
    );
    expect(res.statusCode).toBe(201);
    const { projectId } = res.json();
    const rows = await pool.query(
      "select count(*)::int as n from constraints_ where project_id = $1",
      [projectId],
    );
    expect(rows.rows[0].n).toBe(2);
  });
});
