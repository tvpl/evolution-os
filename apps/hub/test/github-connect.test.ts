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

async function registerProject(): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/projects",
    headers: { authorization: `Bearer ${tokenA}`, "idempotency-key": "gh-connect-setup" },
    payload: {
      apiVersion: "evolutionos.io/v1alpha1",
      kind: "EvolutionProject",
      metadata: { name: "Proj GitHub Connect", slug: "proj-gh-connect", type: "idea", status: "discovery" },
      spec: { intent: { problem: "x" } },
    },
  });
  return res.json().projectId;
}

function connect(body: Record<string, unknown>) {
  return app.inject({
    method: "POST",
    url: `/projects/${projectId}/connectors/github`,
    headers: { authorization: `Bearer ${tokenA}` },
    payload: body,
  });
}

beforeAll(async () => {
  pool = await freshDb("evoos_test_github_connect");
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
  projectId = await registerProject();
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

describe("connect a GitHub repo (GH-01/02/03)", () => {
  it("connecting owner/repo persists status=connected and returns a webhook secret", async () => {
    const res = await connect({ owner: "acme", repo: "widgets" });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.status).toBe("connected");
    expect(typeof body.webhookSecret).toBe("string");
    expect(body.webhookSecret.length).toBeGreaterThanOrEqual(32);

    const row = await pool.query(
      "select owner, repo, status, webhook_secret as \"webhookSecret\" from github_connections where id = $1",
      [body.connectionId],
    );
    expect(row.rows[0]).toEqual({
      owner: "acme",
      repo: "widgets",
      status: "connected",
      webhookSecret: body.webhookSecret,
    });
  });

  it("connecting the same owner/repo twice in the same project is rejected 409", async () => {
    await connect({ owner: "acme", repo: "duplicate-check" });
    const res = await connect({ owner: "acme", repo: "duplicate-check" });
    expect(res.statusCode).toBe(409);
    expect(res.json().title).toBe("already_connected");
  });

  it("connecting without owner is rejected 422", async () => {
    const res = await connect({ repo: "widgets" });
    expect(res.statusCode).toBe(422);
    expect(res.json().title).toBe("invalid_connection");
  });

  it("connecting without repo is rejected 422", async () => {
    const res = await connect({ owner: "acme" });
    expect(res.statusCode).toBe(422);
    expect(res.json().title).toBe("invalid_connection");
  });

  it("is denied cross-tenant", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/projects/${projectId}/connectors/github`,
      headers: { authorization: `Bearer ${tokenB}` },
      payload: { owner: "acme", repo: "cross-tenant" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("returns 404 for an unknown project", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/projects/prj_unknown/connectors/github",
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { owner: "acme", repo: "widgets" },
    });
    expect(res.statusCode).toBe(404);
  });
});
