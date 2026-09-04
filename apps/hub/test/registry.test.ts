import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { validateEvent } from "@evolution-os/contracts";
import { freshDb } from "./helpers.js";
import { buildServer } from "../src/server.js";
import { seedDevData } from "../src/identity/seed.js";
import { seedDevGrants } from "../src/policy/policy.js";
import { registerProject } from "../src/registry/registry.js";
import type { DbPool } from "../src/platform/db.js";

let pool: DbPool;
let app: FastifyInstance;
let tokenA: string;
let tokenB: string;

function manifest(slug: string, name = "Projeto Teste"): Record<string, unknown> {
  return {
    apiVersion: "evolutionos.io/v1alpha1",
    kind: "EvolutionProject",
    metadata: { name, slug, type: "product", status: "discovery" },
    spec: { intent: { problem: "Problema de teste" } },
  };
}

async function counts(): Promise<{ projects: number; outbox: number }> {
  const p = await pool.query("select count(*)::int as n from projects");
  const o = await pool.query("select count(*)::int as n from outbox");
  return { projects: p.rows[0].n, outbox: o.rows[0].n };
}

beforeAll(async () => {
  pool = await freshDb("evoos_test_registry");
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

function post(token: string, key: string, body: unknown) {
  return app.inject({
    method: "POST",
    url: "/projects",
    headers: { authorization: `Bearer ${token}`, "idempotency-key": key },
    payload: body as Record<string, unknown>,
  });
}

describe("register project command (TRUST-01/03/04/05)", () => {
  it("persists the project and emits the registration event through the outbox in one transaction", async () => {
    const res = await post(tokenA, "key-happy-1", manifest("proj-happy"));
    expect(res.statusCode).toBe(201);
    const receipt = res.json();
    expect(receipt).toEqual({ projectId: expect.stringMatching(/^prj_/), version: 1 });

    const project = await pool.query("select org_id, workspace_id from projects where id = $1", [
      receipt.projectId,
    ]);
    expect(project.rows[0]).toEqual({ org_id: "org_dev_a", workspace_id: "ws_dev_a" });

    const outbox = await pool.query(
      "select type, payload, dispatched_at from outbox where project_id = $1",
      [receipt.projectId],
    );
    expect(outbox.rowCount).toBe(1);
    expect(outbox.rows[0].type).toBe("io.evolutionos.project.project.registered.v1");
    expect(outbox.rows[0].dispatched_at).toBeNull();
  });

  it("event envelope carries the required extensions and passes the event schema (TRUST-03)", async () => {
    const res = await post(tokenA, "key-envelope-1", manifest("proj-envelope"));
    const { projectId } = res.json();
    const row = await pool.query("select payload from outbox where project_id = $1", [projectId]);
    const envelope = row.rows[0].payload;
    expect(validateEvent(envelope)).toEqual({ ok: true, errors: [] });
    expect(envelope).toMatchObject({
      tenantid: "org_dev_a",
      workspaceid: "ws_dev_a",
      projectid: projectId,
      classification: "internal",
      schemaversion: "1",
      correlationid: expect.stringMatching(/^req_/),
    });
  });

  it("same key and digest replays the prior result without a second event (TRUST-04)", async () => {
    const first = await post(tokenA, "key-replay-1", manifest("proj-replay"));
    const before = await counts();
    const replay = await post(tokenA, "key-replay-1", manifest("proj-replay"));
    expect(replay.statusCode).toBe(200);
    expect(replay.json().projectId).toBe(first.json().projectId);
    expect(await counts()).toEqual(before);
  });

  it("key reuse with a different digest is rejected as conflict adding no rows (TRUST-05)", async () => {
    await post(tokenA, "key-conflict-1", manifest("proj-conflict"));
    const before = await counts();
    const res = await post(tokenA, "key-conflict-1", manifest("proj-conflict-2", "Outro"));
    expect(res.statusCode).toBe(409);
    expect(res.json().title).toBe("idempotency_conflict");
    expect(await counts()).toEqual(before);
  });

  it("missing Idempotency-Key is rejected with 422", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/projects",
      headers: { authorization: `Bearer ${tokenA}` },
      payload: manifest("proj-nokey"),
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().title).toBe("missing_idempotency_key");
  });

  it("manifest violating the v0 schema is rejected with the schema errors and no rows", async () => {
    const before = await counts();
    const bad = manifest("proj-bad") as { metadata: Record<string, unknown> };
    delete bad.metadata["slug"];
    const res = await post(tokenA, "key-invalid-1", bad);
    expect(res.statusCode).toBe(422);
    expect(JSON.stringify(res.json().errors)).toContain("slug");
    expect(await counts()).toEqual(before);
  });

  it("an envelope that violates the event contract aborts the whole transaction", async () => {
    const before = await counts();
    await expect(
      registerProject(
        pool,
        { userId: "user_dev_a", orgId: "org_dev_a", workspaceId: "ws_dev_a" },
        {
          manifest: manifest("proj-atomic"),
          idempotencyKey: "key-atomic-1",
          // correlationid vazio viola o contrato do envelope — detectado DENTRO
          // da tx, após o insert do projeto, provando o rollback conjunto.
          correlationId: "",
        },
      ),
    ).rejects.toThrow("event envelope violates contract");
    expect(await counts()).toEqual(before);
  });

  it("concurrent registrations produce distinct project ids and lose nothing", async () => {
    const [r1, r2] = await Promise.all([
      post(tokenA, "key-conc-1", manifest("proj-conc-1")),
      post(tokenA, "key-conc-2", manifest("proj-conc-2")),
    ]);
    expect(r1.statusCode).toBe(201);
    expect(r2.statusCode).toBe(201);
    expect(r1.json().projectId).not.toBe(r2.json().projectId);
  });
});

describe("tenant isolation (TRUST-07) and policy (TRUST-08/09)", () => {
  it("a session of tenant B reading a project of tenant A is denied and audited", async () => {
    const created = await post(tokenA, "key-xt-1", manifest("proj-xt"));
    const { projectId } = created.json();
    const res = await app.inject({
      method: "GET",
      url: `/projects/${projectId}`,
      headers: { authorization: `Bearer ${tokenB}`, "x-correlation-id": "req_xt_1" },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().title).toBe("access_denied");
    const audit = await pool.query(
      "select actor, action, outcome, reason from audit_log where correlation_id = 'req_xt_1'",
    );
    expect(audit.rows[0]).toEqual({
      actor: "user_dev_b",
      action: "project.read",
      outcome: "denied",
      reason: "cross-tenant access",
    });
  });

  it("owner reads their project back from the authoritative store", async () => {
    const created = await post(tokenA, "key-own-1", manifest("proj-own"));
    const { projectId } = created.json();
    const res = await app.inject({
      method: "GET",
      url: `/projects/${projectId}`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ projectId, workspaceId: "ws_dev_a" });
  });

  it("register without the project.register grant is denied with audit (deny-by-default)", async () => {
    await pool.query(
      "delete from capability_grants where org_id = 'org_dev_b' and capability = 'project.register'",
    );
    try {
      const res = await app.inject({
        method: "POST",
        url: "/projects",
        headers: {
          authorization: `Bearer ${tokenB}`,
          "idempotency-key": "key-deny-1",
          "x-correlation-id": "req_deny_1",
        },
        payload: manifest("proj-deny"),
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().title).toBe("capability_denied");
      const audit = await pool.query(
        "select outcome from audit_log where correlation_id = 'req_deny_1'",
      );
      expect(audit.rows[0]?.outcome).toBe("denied");
    } finally {
      await seedDevGrants(pool);
    }
  });
});
