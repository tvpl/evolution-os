import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { EVENT_TYPES } from "@evolution-os/contracts";
import { freshDb } from "./helpers.js";
import { buildServer } from "../src/server.js";
import { seedDevData } from "../src/identity/seed.js";
import { seedDevGrants } from "../src/policy/policy.js";
import { defaultRouter, EventRouter, runDispatcherOnce } from "../src/platform/outbox.js";
import type { DbPool } from "../src/platform/db.js";

let pool: DbPool;
let app: FastifyInstance;
let tokenA: string;
let tokenB: string;

function manifest(slug: string): Record<string, unknown> {
  return {
    apiVersion: "evolutionos.io/v1alpha1",
    kind: "EvolutionProject",
    metadata: { name: `Projeto ${slug}`, slug, type: "product", status: "discovery" },
    spec: { intent: { problem: "Problema" } },
  };
}

async function register(token: string, key: string, slug: string): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/projects",
    headers: { authorization: `Bearer ${token}`, "idempotency-key": key },
    payload: manifest(slug),
  });
  expect(res.statusCode).toBe(201);
  return res.json().projectId;
}

async function listProjects(token: string): Promise<Array<{ project_id: string }>> {
  const res = await app.inject({
    method: "GET",
    url: "/projects",
    headers: { authorization: `Bearer ${token}` },
  });
  expect(res.statusCode).toBe(200);
  return res.json().projects;
}

beforeAll(async () => {
  pool = await freshDb("evoos_test_outbox");
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

beforeEach(async () => {
  await pool.query("delete from inbox");
  await pool.query("delete from projects_view");
  await pool.query("delete from outbox");
  await pool.query("delete from projects");
  await pool.query("delete from idempotency_keys");
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

describe("outbox dispatcher and projection (TRUST-02)", () => {
  it("pending event becomes a projection row served by GET /projects", async () => {
    const projectId = await register(tokenA, "k1", "proj-flow");
    expect(await listProjects(tokenA)).toEqual([]);

    const stats = await runDispatcherOnce(pool, defaultRouter());
    expect(stats).toEqual({ delivered: 1, deduplicated: 0, failed: 0 });

    const projects = await listProjects(tokenA);
    expect(projects).toHaveLength(1);
    expect(projects[0]).toMatchObject({ project_id: projectId, name: "Projeto proj-flow" });
  });

  it("duplicate delivery of the same event is a no-op via inbox dedup", async () => {
    const projectId = await register(tokenA, "k2", "proj-dup");
    await runDispatcherOnce(pool, defaultRouter());
    // Simula redelivery at-least-once: evento volta a pendente.
    await pool.query("update outbox set dispatched_at = null where project_id = $1", [projectId]);
    const stats = await runDispatcherOnce(pool, defaultRouter());
    expect(stats).toEqual({ delivered: 0, deduplicated: 1, failed: 0 });
    const view = await pool.query("select count(*)::int as n from projects_view");
    expect(view.rows[0].n).toBe(1);
  });

  it("dispatcher downtime leaves the event pending and delivers it after recovery", async () => {
    const projectId = await register(tokenA, "k3", "proj-down");
    const pending = await pool.query(
      "select dispatched_at from outbox where project_id = $1",
      [projectId],
    );
    expect(pending.rows[0].dispatched_at).toBeNull();
    expect(await listProjects(tokenA)).toEqual([]);

    await runDispatcherOnce(pool, defaultRouter());
    const dispatched = await pool.query(
      "select dispatched_at from outbox where project_id = $1",
      [projectId],
    );
    expect(dispatched.rows[0].dispatched_at).not.toBeNull();
    expect(await listProjects(tokenA)).toHaveLength(1);
  });

  it("a failing consumer keeps the event pending for retry (at-least-once)", async () => {
    await register(tokenA, "k4", "proj-retry");
    const failing = new EventRouter().on(
      EVENT_TYPES.PROJECT_REGISTERED,
      "broken-consumer",
      async () => {
        throw new Error("consumer down");
      },
    );
    const stats = await runDispatcherOnce(pool, failing);
    expect(stats.failed).toBe(1);
    const pending = await pool.query(
      "select count(*)::int as n from outbox where dispatched_at is null",
    );
    expect(pending.rows[0].n).toBe(1);

    const recovered = await runDispatcherOnce(pool, defaultRouter());
    expect(recovered.delivered).toBe(1);
    expect(await listProjects(tokenA)).toHaveLength(1);
  });

  it("already dispatched events are not re-processed", async () => {
    await register(tokenA, "k5", "proj-once");
    await runDispatcherOnce(pool, defaultRouter());
    const again = await runDispatcherOnce(pool, defaultRouter());
    expect(again).toEqual({ delivered: 0, deduplicated: 0, failed: 0 });
  });

  it("projection listing is tenant-scoped: tenant B does not see tenant A projects", async () => {
    await register(tokenA, "k6", "proj-scope");
    await runDispatcherOnce(pool, defaultRouter());
    expect(await listProjects(tokenA)).toHaveLength(1);
    expect(await listProjects(tokenB)).toEqual([]);
  });
});
