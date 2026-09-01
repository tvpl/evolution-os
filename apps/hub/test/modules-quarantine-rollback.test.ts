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

async function registerProject(): Promise<string> {
  const slug = `modules-qr-${Math.random().toString(36).slice(2)}`;
  const res = await app.inject({
    method: "POST",
    url: "/projects",
    headers: { authorization: `Bearer ${tokenA}`, "idempotency-key": `modules-qr-setup-${slug}` },
    payload: {
      apiVersion: "evolutionos.io/v1alpha1",
      kind: "EvolutionProject",
      metadata: { name: "Modules Quarantine Rollback", slug, type: "idea", status: "discovery" },
      spec: { intent: { problem: "x" } },
    },
  });
  return res.json().projectId;
}

function publish(manifest: Record<string, unknown>) {
  return app.inject({
    method: "POST",
    url: "/orgs/current/modules",
    headers: { authorization: `Bearer ${tokenA}` },
    payload: manifest,
  });
}

function install(projectId: string, moduleId: string, version: string) {
  return app.inject({
    method: "POST",
    url: `/projects/${projectId}/modules/${moduleId}/install`,
    headers: { authorization: `Bearer ${tokenA}` },
    payload: { version },
  });
}

function update(projectId: string, moduleId: string, version: string) {
  return app.inject({
    method: "POST",
    url: `/projects/${projectId}/modules/${moduleId}/update`,
    headers: { authorization: `Bearer ${tokenA}` },
    payload: { version },
  });
}

function quarantine(projectId: string, moduleId: string, token = tokenA) {
  return app.inject({
    method: "POST",
    url: `/projects/${projectId}/modules/${moduleId}/quarantine`,
    headers: { authorization: `Bearer ${token}` },
  });
}

function rollback(projectId: string, moduleId: string, version: string, token = tokenA) {
  return app.inject({
    method: "POST",
    url: `/projects/${projectId}/modules/${moduleId}/rollback`,
    headers: { authorization: `Bearer ${token}` },
    payload: { version },
  });
}

function historyCount(projectId: string, moduleId: string) {
  return pool.query(`select count(*)::int as n from module_installations where project_id = $1 and module_id = $2`, [
    projectId,
    moduleId,
  ]);
}

function manifest(moduleId: string, version: string) {
  return {
    id: moduleId,
    version,
    publisher: "io.evolutionos.foundation",
    name: "Quarantine Rollback Test",
    components: [{ id: "sensor-a", type: "sensor", capabilities: [] }],
  };
}

beforeAll(async () => {
  pool = await freshDb("evoos_test_modules_qr");
  await seedDevData(pool);
  await seedDevGrants(pool);
  app = buildServer({ pool });
  const login = await app.inject({
    method: "POST",
    url: "/auth/dev-login",
    payload: { email: "dev-a@evolutionos.local" },
  });
  tokenA = login.json().token;
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

describe("quarantine and rollback (MODL-15/16/17)", () => {
  it("quarantines an active installation", async () => {
    const moduleId = "io.evolutionos.modules.quarantine-basic";
    await publish(manifest(moduleId, "1.0.0"));
    const projectId = await registerProject();
    await install(projectId, moduleId, "1.0.0");

    const res = await quarantine(projectId, moduleId);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ installationId: expect.any(String), moduleId, status: "quarantined" });

    const lock = await app.inject({
      method: "GET",
      url: `/projects/${projectId}/modules/lockfile`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(lock.json().lockfile).toEqual([]);
  });

  it("rejects updating a quarantined installation with 409", async () => {
    const moduleId = "io.evolutionos.modules.quarantine-blocks-update";
    await publish(manifest(moduleId, "1.0.0"));
    await publish(manifest(moduleId, "2.0.0"));
    const projectId = await registerProject();
    await install(projectId, moduleId, "1.0.0");
    await quarantine(projectId, moduleId);

    const res = await update(projectId, moduleId, "2.0.0");
    expect(res.statusCode).toBe(409);
    expect(res.json().title).toBe("invalid_transition");
  });

  it("rolls back to a version previously locked by this project, preserving all history rows", async () => {
    const moduleId = "io.evolutionos.modules.rollback-proven";
    await publish(manifest(moduleId, "1.0.0"));
    await publish(manifest(moduleId, "2.0.0"));
    const projectId = await registerProject();
    await install(projectId, moduleId, "1.0.0");
    await update(projectId, moduleId, "2.0.0");
    await quarantine(projectId, moduleId);

    const res = await rollback(projectId, moduleId, "1.0.0");
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ moduleId, version: "1.0.0", status: "active" });

    const lock = await app.inject({
      method: "GET",
      url: `/projects/${projectId}/modules/lockfile`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(lock.json().lockfile).toEqual([
      expect.objectContaining({ moduleId, version: "1.0.0", status: "active" }),
    ]);

    const history = await historyCount(projectId, moduleId);
    expect(history.rows[0].n).toBe(4);
  });

  it("rejects rollback to a version never installed by this project with 409", async () => {
    const moduleId = "io.evolutionos.modules.rollback-unproven";
    await publish(manifest(moduleId, "1.0.0"));
    await publish(manifest(moduleId, "9.9.9"));
    const projectId = await registerProject();
    await install(projectId, moduleId, "1.0.0");

    const res = await rollback(projectId, moduleId, "9.9.9");
    expect(res.statusCode).toBe(409);
    expect(res.json().title).toBe("unproven_version");
  });

  it("rejects quarantine and rollback when the module was never installed with 404", async () => {
    const moduleId = "io.evolutionos.modules.never-installed-qr";
    await publish(manifest(moduleId, "1.0.0"));
    const projectId = await registerProject();

    const q = await quarantine(projectId, moduleId);
    expect(q.statusCode).toBe(404);
    const r = await rollback(projectId, moduleId, "1.0.0");
    expect(r.statusCode).toBe(404);
  });

  it("is denied cross-tenant for both quarantine and rollback", async () => {
    const moduleId = "io.evolutionos.modules.qr-cross-tenant";
    await publish(manifest(moduleId, "1.0.0"));
    const projectId = await registerProject();
    await install(projectId, moduleId, "1.0.0");
    const loginB = await app.inject({
      method: "POST",
      url: "/auth/dev-login",
      payload: { email: "dev-b@evolutionos.local" },
    });
    const tokenB = loginB.json().token;

    const q = await quarantine(projectId, moduleId, tokenB);
    expect(q.statusCode).toBe(403);
    const r = await rollback(projectId, moduleId, "1.0.0", tokenB);
    expect(r.statusCode).toBe(403);
  });
});
