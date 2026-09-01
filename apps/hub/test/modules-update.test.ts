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
  const slug = `modules-update-${Math.random().toString(36).slice(2)}`;
  const res = await app.inject({
    method: "POST",
    url: "/projects",
    headers: { authorization: `Bearer ${tokenA}`, "idempotency-key": `modules-update-setup-${slug}` },
    payload: {
      apiVersion: "evolutionos.io/v1alpha1",
      kind: "EvolutionProject",
      metadata: { name: "Modules Update", slug, type: "idea", status: "discovery" },
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

function update(projectId: string, moduleId: string, version: string, token = tokenA) {
  return app.inject({
    method: "POST",
    url: `/projects/${projectId}/modules/${moduleId}/update`,
    headers: { authorization: `Bearer ${token}` },
    payload: { version },
  });
}

async function grantCapability(capability: string) {
  await pool.query(
    `insert into capability_grants (id, org_id, workspace_id, principal, capability)
     values ($1, 'org_dev_a', 'ws_dev_a', '*', $2)
     on conflict (org_id, workspace_id, principal, capability) do nothing`,
    [`grant_test_${capability}`, capability],
  );
}

async function revokeCapability(capability: string) {
  await pool.query(`delete from capability_grants where org_id = 'org_dev_a' and capability = $1`, [capability]);
}

function manifestV1(moduleId: string) {
  return {
    id: moduleId,
    version: "1.0.0",
    publisher: "io.evolutionos.foundation",
    name: "Update Test",
    components: [{ id: "sensor-a", type: "sensor", capabilities: ["module-test.base.read"] }],
  };
}

function manifestV2(moduleId: string, extraCapabilities: string[] = [], dropBase = false) {
  return {
    id: moduleId,
    version: "2.0.0",
    publisher: "io.evolutionos.foundation",
    name: "Update Test",
    components: [
      { id: "sensor-a", type: "sensor", capabilities: dropBase ? [] : ["module-test.base.read"] },
      ...(extraCapabilities.length ? [{ id: "sensor-b", type: "sensor", capabilities: extraCapabilities }] : []),
    ],
  };
}

beforeAll(async () => {
  pool = await freshDb("evoos_test_modules_update");
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

describe("update a module with a blocking permission diff (MODL-12/13/14)", () => {
  it("updates when the new version's capabilities are all already granted, returning the diff", async () => {
    await grantCapability("module-test.base.read");
    const moduleId = "io.evolutionos.modules.update-ok";
    await publish(manifestV1(moduleId));
    await publish(manifestV2(moduleId));
    const projectId = await registerProject();
    await install(projectId, moduleId, "1.0.0");

    const res = await update(projectId, moduleId, "2.0.0");
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      installationId: expect.any(String),
      moduleId,
      version: "2.0.0",
      digest: expect.any(String),
      status: "active",
      permissionDiff: { added: [], removed: [] },
    });

    const lock = await app.inject({
      method: "GET",
      url: `/projects/${projectId}/modules/lockfile`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(lock.json().lockfile[0].version).toBe("2.0.0");
  });

  it("succeeds even if an unchanged, already-locked capability's grant was later revoked - only added capabilities gate the update", async () => {
    await grantCapability("module-test.base.read");
    const moduleId = "io.evolutionos.modules.update-unchanged-cap-revoked";
    await publish(manifestV1(moduleId));
    await publish(manifestV2(moduleId));
    const projectId = await registerProject();
    await install(projectId, moduleId, "1.0.0");

    // module-test.base.read is present in both v1 and v2 - it is not part of the
    // permission diff for this update, so revoking it after install must not block.
    await revokeCapability("module-test.base.read");

    const res = await update(projectId, moduleId, "2.0.0");
    expect(res.statusCode).toBe(200);
    expect(res.json().permissionDiff).toEqual({ added: [], removed: [] });
  });

  it("reports a removed capability in the diff when the new version drops one", async () => {
    await grantCapability("module-test.base.read");
    const moduleId = "io.evolutionos.modules.update-removed";
    await publish(manifestV1(moduleId));
    await publish(manifestV2(moduleId, [], true));
    const projectId = await registerProject();
    await install(projectId, moduleId, "1.0.0");

    const res = await update(projectId, moduleId, "2.0.0");
    expect(res.statusCode).toBe(200);
    expect(res.json().permissionDiff).toEqual({ added: [], removed: ["module-test.base.read"] });
  });

  it("rejects an update introducing an ungranted capability with 422, leaving the lockfile on the prior version", async () => {
    await grantCapability("module-test.base.read");
    await revokeCapability("module-test.new.write");
    const moduleId = "io.evolutionos.modules.update-blocked";
    await publish(manifestV1(moduleId));
    await publish(manifestV2(moduleId, ["module-test.new.write"]));
    const projectId = await registerProject();
    await install(projectId, moduleId, "1.0.0");

    const res = await update(projectId, moduleId, "2.0.0");
    expect(res.statusCode).toBe(422);
    expect(res.json().title).toBe("module_requires_capability_grant");
    expect(res.json().added).toEqual(["module-test.new.write"]);

    const lock = await app.inject({
      method: "GET",
      url: `/projects/${projectId}/modules/lockfile`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(lock.json().lockfile[0].version).toBe("1.0.0");
  });

  it("succeeds once the missing capability is granted and the same update is retried", async () => {
    await grantCapability("module-test.base.read");
    await revokeCapability("module-test.retry.write");
    const moduleId = "io.evolutionos.modules.update-retry";
    await publish(manifestV1(moduleId));
    await publish(manifestV2(moduleId, ["module-test.retry.write"]));
    const projectId = await registerProject();
    await install(projectId, moduleId, "1.0.0");

    const blocked = await update(projectId, moduleId, "2.0.0");
    expect(blocked.statusCode).toBe(422);

    await grantCapability("module-test.retry.write");
    const res = await update(projectId, moduleId, "2.0.0");
    expect(res.statusCode).toBe(200);
    expect(res.json().version).toBe("2.0.0");
  });

  it("rejects updating an installation that was never installed with 409", async () => {
    const moduleId = "io.evolutionos.modules.update-never-installed";
    await publish(manifestV1(moduleId));
    const projectId = await registerProject();
    const res = await update(projectId, moduleId, "1.0.0");
    expect(res.statusCode).toBe(409);
    expect(res.json().title).toBe("invalid_transition");
  });

  it("rejects updating to an unknown version with 404", async () => {
    await grantCapability("module-test.base.read");
    const moduleId = "io.evolutionos.modules.update-unknown-version";
    await publish(manifestV1(moduleId));
    const projectId = await registerProject();
    await install(projectId, moduleId, "1.0.0");
    const res = await update(projectId, moduleId, "9.9.9");
    expect(res.statusCode).toBe(404);
  });

  it("is denied cross-tenant", async () => {
    await grantCapability("module-test.base.read");
    const moduleId = "io.evolutionos.modules.update-cross-tenant";
    await publish(manifestV1(moduleId));
    await publish(manifestV2(moduleId));
    const projectId = await registerProject();
    await install(projectId, moduleId, "1.0.0");
    const loginB = await app.inject({
      method: "POST",
      url: "/auth/dev-login",
      payload: { email: "dev-b@evolutionos.local" },
    });
    const res = await update(projectId, moduleId, "2.0.0", loginB.json().token);
    expect(res.statusCode).toBe(403);
  });
});
