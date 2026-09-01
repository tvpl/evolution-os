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
let connectionId: string;

async function registerProject(): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/projects",
    headers: { authorization: `Bearer ${tokenA}`, "idempotency-key": "gh-action-setup" },
    payload: {
      apiVersion: "evolutionos.io/v1alpha1",
      kind: "EvolutionProject",
      metadata: { name: "Proj GitHub Action", slug: "proj-gh-action", type: "idea", status: "discovery" },
      spec: { intent: { problem: "x" } },
    },
  });
  return res.json().projectId;
}

function createAction(idempotencyKey: string | undefined, body: Record<string, unknown>) {
  const headers: Record<string, string> = { authorization: `Bearer ${tokenA}` };
  if (idempotencyKey !== undefined) headers["idempotency-key"] = idempotencyKey;
  return app.inject({
    method: "POST",
    url: `/projects/${projectId}/connectors/github/actions`,
    headers,
    payload: body,
  });
}

beforeAll(async () => {
  pool = await freshDb("evoos_test_github_action");
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
  const connected = await app.inject({
    method: "POST",
    url: `/projects/${projectId}/connectors/github`,
    headers: { authorization: `Bearer ${tokenA}` },
    payload: { owner: "acme", repo: "widgets" },
  });
  connectionId = connected.json().connectionId;
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

describe("create controlled external actions (GH-07/08/09/10/11)", () => {
  it("creates an issue action and persists a mock externalRef", async () => {
    const res = await createAction("key-issue-1", {
      connectionId,
      actionType: "issue",
      title: "Investigar regressão de latência",
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.externalRef).toMatch(/^mock:\/\/github\//);

    const row = await pool.query(
      "select action_type as \"actionType\", title, external_ref as \"externalRef\" from github_actions where id = $1",
      [body.actionId],
    );
    expect(row.rows[0]).toEqual({ actionType: "issue", title: "Investigar regressão de latência", externalRef: body.externalRef });
  });

  it("creates branch and draftPr actions too", async () => {
    const branch = await createAction("key-branch-1", { connectionId, actionType: "branch", title: "fix/latency" });
    expect(branch.statusCode).toBe(201);
    const draftPr = await createAction("key-draftpr-1", { connectionId, actionType: "draftPr", title: "Draft: fix latency" });
    expect(draftPr.statusCode).toBe(201);
  });

  it("rejects an invalid actionType (never merge/deploy)", async () => {
    const res = await createAction("key-invalid-type", { connectionId, actionType: "merge", title: "x" });
    expect(res.statusCode).toBe(422);
    expect(res.json().title).toBe("invalid_action_type");
  });

  it("rejects creation without an Idempotency-Key header", async () => {
    const res = await createAction(undefined, { connectionId, actionType: "issue", title: "x" });
    expect(res.statusCode).toBe(422);
    expect(res.json().title).toBe("missing_idempotency_key");
  });

  it("replaying the same Idempotency-Key with the same payload returns the existing action, not a duplicate", async () => {
    const payload = { connectionId, actionType: "issue" as const, title: "Replay test" };
    const first = await createAction("key-replay", payload);
    expect(first.statusCode).toBe(201);

    const second = await createAction("key-replay", payload);
    expect(second.statusCode).toBe(200);
    expect(second.json()).toEqual(first.json());

    const row = await pool.query("select count(*)::int as n from github_actions where id = $1", [
      first.json().actionId,
    ]);
    expect(row.rows[0].n).toBe(1);
  });

  it("replaying the same Idempotency-Key with a different payload is rejected 409", async () => {
    await createAction("key-conflict", { connectionId, actionType: "issue", title: "Original" });
    const res = await createAction("key-conflict", { connectionId, actionType: "issue", title: "Different" });
    expect(res.statusCode).toBe(409);
    expect(res.json().title).toBe("idempotency_conflict");
  });

  it("rejects an unknown or foreign connectionId with 422", async () => {
    const res = await createAction("key-unknown-conn", {
      connectionId: "ghc_unknown",
      actionType: "issue",
      title: "x",
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().title).toBe("invalid_connection_reference");
  });

  it("is denied cross-tenant", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/projects/${projectId}/connectors/github/actions`,
      headers: { authorization: `Bearer ${tokenB}`, "idempotency-key": "key-cross-tenant" },
      payload: { connectionId, actionType: "issue", title: "x" },
    });
    expect(res.statusCode).toBe(403);
  });
});
