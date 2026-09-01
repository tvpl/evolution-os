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
    expect(body.externalRef).toBe(`mock://github/${connectionId}/issues/${body.actionId}`);

    const row = await pool.query(
      "select action_type as \"actionType\", title, connection_id as \"connectionId\", external_ref as \"externalRef\" from github_actions where id = $1",
      [body.actionId],
    );
    expect(row.rows[0]).toEqual({
      actionType: "issue",
      title: "Investigar regressão de latência",
      connectionId,
      externalRef: body.externalRef,
    });
  });

  it("creates branch and draftPr actions with an externalRef shaped for their actionType", async () => {
    const branch = await createAction("key-branch-1", { connectionId, actionType: "branch", title: "fix/latency" });
    expect(branch.statusCode).toBe(201);
    expect(branch.json().externalRef).toBe(`mock://github/${connectionId}/branches/${branch.json().actionId}`);

    const draftPr = await createAction("key-draftpr-1", { connectionId, actionType: "draftPr", title: "Draft: fix latency" });
    expect(draftPr.statusCode).toBe(201);
    expect(draftPr.json().externalRef).toBe(`mock://github/${connectionId}/pulls/${draftPr.json().actionId}`);

    expect(branch.json().externalRef).not.toBe(draftPr.json().externalRef);
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

  it("without the connector.github.write grant is denied 403 capability_denied (deny-by-default)", async () => {
    await pool.query(
      "delete from capability_grants where org_id = 'org_dev_a' and capability = 'connector.github.write'",
    );
    try {
      const res = await createAction("key-no-grant", { connectionId, actionType: "issue", title: "x" });
      expect(res.statusCode).toBe(403);
      expect(res.json().title).toBe("capability_denied");
    } finally {
      await seedDevGrants(pool);
    }
  });

  it("replaying the same Idempotency-Key from a different project in the same org does not leak the other project's action", async () => {
    const otherProject = await app.inject({
      method: "POST",
      url: "/projects",
      headers: { authorization: `Bearer ${tokenA}`, "idempotency-key": "gh-action-other-project" },
      payload: {
        apiVersion: "evolutionos.io/v1alpha1",
        kind: "EvolutionProject",
        metadata: { name: "Other Proj", slug: "proj-gh-action-other", type: "idea", status: "discovery" },
        spec: { intent: { problem: "x" } },
      },
    });
    const otherProjectId = otherProject.json().projectId;
    const otherConnected = await app.inject({
      method: "POST",
      url: `/projects/${otherProjectId}/connectors/github`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { owner: "acme", repo: "other-repo" },
    });
    const otherConnectionId = otherConnected.json().connectionId;

    const first = await createAction("key-cross-project", { connectionId, actionType: "issue", title: "x" });
    expect(first.statusCode).toBe(201);

    const secondRes = await app.inject({
      method: "POST",
      url: `/projects/${otherProjectId}/connectors/github/actions`,
      headers: { authorization: `Bearer ${tokenA}`, "idempotency-key": "key-cross-project" },
      payload: { connectionId: otherConnectionId, actionType: "issue", title: "x" },
    });
    // The digest includes projectId, so the same key reused from a different
    // project never replays the first project's response (which would leak
    // its actionId/externalRef) — it is a distinct request under an
    // already-used key, so it conflicts rather than silently succeeding.
    expect(secondRes.statusCode).toBe(409);
    expect(secondRes.json().title).toBe("idempotency_conflict");

    const rows = await pool.query("select count(*)::int as n from github_actions where project_id = $1", [
      otherProjectId,
    ]);
    expect(rows.rows[0].n).toBe(0);
  });

  it("a conflict varying actionType or connectionId under the same key is rejected 409", async () => {
    await createAction("key-conflict-fields", { connectionId, actionType: "issue", title: "Same title" });

    const differentType = await createAction("key-conflict-fields", {
      connectionId,
      actionType: "branch",
      title: "Same title",
    });
    expect(differentType.statusCode).toBe(409);
    expect(differentType.json().title).toBe("idempotency_conflict");

    const secondConnection = await app.inject({
      method: "POST",
      url: `/projects/${projectId}/connectors/github`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { owner: "acme", repo: "second-repo" },
    });
    const differentConnection = await createAction("key-conflict-fields", {
      connectionId: secondConnection.json().connectionId,
      actionType: "issue",
      title: "Same title",
    });
    expect(differentConnection.statusCode).toBe(409);
    expect(differentConnection.json().title).toBe("idempotency_conflict");
  });

  it("the same Idempotency-Key under a different org (tenant) creates independently, not a replay or conflict", async () => {
    const projectB = await app.inject({
      method: "POST",
      url: "/projects",
      headers: { authorization: `Bearer ${tokenB}`, "idempotency-key": "gh-action-org-b-setup" },
      payload: {
        apiVersion: "evolutionos.io/v1alpha1",
        kind: "EvolutionProject",
        metadata: { name: "Proj B", slug: "proj-gh-action-org-b", type: "idea", status: "discovery" },
        spec: { intent: { problem: "x" } },
      },
    });
    const projectBId = projectB.json().projectId;
    const connectedB = await app.inject({
      method: "POST",
      url: `/projects/${projectBId}/connectors/github`,
      headers: { authorization: `Bearer ${tokenB}` },
      payload: { owner: "acme", repo: "org-b-repo" },
    });
    const connectionBId = connectedB.json().connectionId;

    const forOrgA = await createAction("key-shared-across-orgs", { connectionId, actionType: "issue", title: "x" });
    expect(forOrgA.statusCode).toBe(201);

    const forOrgB = await app.inject({
      method: "POST",
      url: `/projects/${projectBId}/connectors/github/actions`,
      headers: { authorization: `Bearer ${tokenB}`, "idempotency-key": "key-shared-across-orgs" },
      payload: { connectionId: connectionBId, actionType: "issue", title: "x" },
    });
    expect(forOrgB.statusCode).toBe(201);
    expect(forOrgB.json().actionId).not.toBe(forOrgA.json().actionId);
  });
});
