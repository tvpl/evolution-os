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

async function registerProject(): Promise<string> {
  const slug = `modules-uninstall-${Math.random().toString(36).slice(2)}`;
  const res = await app.inject({
    method: "POST",
    url: "/projects",
    headers: { authorization: `Bearer ${tokenA}`, "idempotency-key": `modules-uninstall-setup-${slug}` },
    payload: {
      apiVersion: "evolutionos.io/v1alpha1",
      kind: "EvolutionProject",
      metadata: { name: "Modules Uninstall", slug, type: "idea", status: "discovery" },
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

function quarantine(projectId: string, moduleId: string) {
  return app.inject({
    method: "POST",
    url: `/projects/${projectId}/modules/${moduleId}/quarantine`,
    headers: { authorization: `Bearer ${tokenA}` },
  });
}

function uninstall(projectId: string, moduleId: string, token = tokenA) {
  return app.inject({
    method: "POST",
    url: `/projects/${projectId}/modules/${moduleId}/uninstall`,
    headers: { authorization: `Bearer ${token}` },
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

function rollback(projectId: string, moduleId: string, version: string) {
  return app.inject({
    method: "POST",
    url: `/projects/${projectId}/modules/${moduleId}/rollback`,
    headers: { authorization: `Bearer ${tokenA}` },
    payload: { version },
  });
}

function getLockfile(projectId: string, token = tokenA) {
  return app.inject({
    method: "GET",
    url: `/projects/${projectId}/modules/lockfile`,
    headers: { authorization: `Bearer ${token}` },
  });
}

function manifest(moduleId: string, version: string) {
  return {
    id: moduleId,
    version,
    publisher: "io.evolutionos.foundation",
    name: "Uninstall Test",
    components: [{ id: "sensor-a", type: "sensor", capabilities: [] }],
  };
}

beforeAll(async () => {
  pool = await freshDb("evoos_test_modules_uninstall");
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
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

describe("uninstall preserving lock history (MODL-18/19)", () => {
  it("uninstalls an active installation and removes it from the lockfile", async () => {
    const moduleId = "io.evolutionos.modules.uninstall-active";
    await publish(manifest(moduleId, "1.0.0"));
    const projectId = await registerProject();
    await install(projectId, moduleId, "1.0.0");

    const res = await uninstall(projectId, moduleId);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ installationId: expect.any(String), moduleId, status: "uninstalled" });

    const lock = await getLockfile(projectId);
    expect(lock.json().lockfile).toEqual([]);
  });

  it("uninstalls a quarantined installation", async () => {
    const moduleId = "io.evolutionos.modules.uninstall-quarantined";
    await publish(manifest(moduleId, "1.0.0"));
    const projectId = await registerProject();
    await install(projectId, moduleId, "1.0.0");
    await quarantine(projectId, moduleId);

    const res = await uninstall(projectId, moduleId);
    expect(res.statusCode).toBe(200);
  });

  it("keeps the full lock history queryable after uninstalling", async () => {
    const moduleId = "io.evolutionos.modules.uninstall-history";
    await publish(manifest(moduleId, "1.0.0"));
    await publish(manifest(moduleId, "2.0.0"));
    const projectId = await registerProject();
    await install(projectId, moduleId, "1.0.0");
    await update(projectId, moduleId, "2.0.0");
    await uninstall(projectId, moduleId);

    const history = await pool.query(
      `select action, version, status from module_installations
        where project_id = $1 and module_id = $2 order by seq`,
      [projectId, moduleId],
    );
    expect(history.rows).toEqual([
      { action: "installed", version: "1.0.0", status: "active" },
      { action: "updated", version: "2.0.0", status: "active" },
      { action: "uninstalled", version: "2.0.0", status: "uninstalled" },
    ]);
  });

  it("rejects update and rollback on an uninstalled installation with 409", async () => {
    const moduleId = "io.evolutionos.modules.uninstall-blocks-transitions";
    await publish(manifest(moduleId, "1.0.0"));
    await publish(manifest(moduleId, "2.0.0"));
    const projectId = await registerProject();
    await install(projectId, moduleId, "1.0.0");
    await uninstall(projectId, moduleId);

    const upd = await update(projectId, moduleId, "2.0.0");
    expect(upd.statusCode).toBe(409);
    expect(upd.json().title).toBe("invalid_transition");

    const rb = await rollback(projectId, moduleId, "1.0.0");
    expect(rb.statusCode).toBe(409);
    expect(rb.json().title).toBe("invalid_transition");
  });

  it("rejects uninstalling a module that was never installed with 404", async () => {
    const moduleId = "io.evolutionos.modules.uninstall-never-installed";
    await publish(manifest(moduleId, "1.0.0"));
    const projectId = await registerProject();
    const res = await uninstall(projectId, moduleId);
    expect(res.statusCode).toBe(404);
  });

  it("is denied cross-tenant across every route in this slice", async () => {
    const moduleId = "io.evolutionos.modules.slice-cross-tenant";
    await publish(manifest(moduleId, "1.0.0"));
    const projectId = await registerProject();
    await install(projectId, moduleId, "1.0.0");

    const uninstallRes = await uninstall(projectId, moduleId, tokenB);
    expect(uninstallRes.statusCode).toBe(403);

    const lockRes = await getLockfile(projectId, tokenB);
    expect(lockRes.statusCode).toBe(403);
  });
});
