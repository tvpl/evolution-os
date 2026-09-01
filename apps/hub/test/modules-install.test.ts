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
  const slug = `modules-install-${Math.random().toString(36).slice(2)}`;
  const res = await app.inject({
    method: "POST",
    url: "/projects",
    headers: { authorization: `Bearer ${tokenA}`, "idempotency-key": `modules-install-setup-${slug}` },
    payload: {
      apiVersion: "evolutionos.io/v1alpha1",
      kind: "EvolutionProject",
      metadata: { name: "Modules Install", slug, type: "idea", status: "discovery" },
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

function install(projectId: string, moduleId: string, version: string, token = tokenA) {
  return app.inject({
    method: "POST",
    url: `/projects/${projectId}/modules/${moduleId}/install`,
    headers: { authorization: `Bearer ${token}` },
    payload: { version },
  });
}

function getLockfile(projectId: string) {
  return app.inject({
    method: "GET",
    url: `/projects/${projectId}/modules/lockfile`,
    headers: { authorization: `Bearer ${tokenA}` },
  });
}

function baseManifest(overrides: Record<string, unknown> = {}) {
  return {
    id: "io.evolutionos.modules.install-test",
    version: "1.0.0",
    publisher: "io.evolutionos.foundation",
    name: "Install Test",
    components: [{ id: "sensor-a", type: "sensor", capabilities: ["module-test.resource.read"] }],
    ...overrides,
  };
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

beforeAll(async () => {
  pool = await freshDb("evoos_test_modules_install");
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

describe("install a module with capability policy check and lockfile (MODL-07/08/09/10/11)", () => {
  it("installs when every declared capability is already granted, and appears in the lockfile", async () => {
    await grantCapability("module-test.resource.read");
    const manifest = baseManifest();
    await publish(manifest);
    const projectId = await registerProject();

    const res = await install(projectId, manifest.id, manifest.version);
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body).toEqual({
      installationId: expect.any(String),
      moduleId: manifest.id,
      version: manifest.version,
      digest: expect.any(String),
      capabilities: ["module-test.resource.read"],
      status: "active",
    });

    const lock = await getLockfile(projectId);
    expect(lock.json().lockfile).toEqual([
      {
        moduleId: manifest.id,
        version: manifest.version,
        digest: body.digest,
        capabilities: ["module-test.resource.read"],
        status: "active",
        installedAt: expect.any(String),
      },
    ]);

    const row = await pool.query(
      `select seq from module_installations where project_id = $1 and module_id = $2`,
      [projectId, manifest.id],
    );
    expect(row.rows[0].seq).toBe(1);
  });

  it("rejects install with a missing capability grant, listing exactly what is missing", async () => {
    await revokeCapability("module-test.resource.missing");
    const manifest = baseManifest({
      id: "io.evolutionos.modules.install-missing-cap",
      components: [{ id: "sensor-a", type: "sensor", capabilities: ["module-test.resource.missing"] }],
    });
    await publish(manifest);
    const projectId = await registerProject();

    const res = await install(projectId, manifest.id, manifest.version);
    expect(res.statusCode).toBe(422);
    expect(res.json().title).toBe("module_requires_capability_grant");
    expect(res.json().missing).toEqual(["module-test.resource.missing"]);

    const lock = await getLockfile(projectId);
    expect(lock.json().lockfile).toEqual([]);
  });

  it("installs without requiring any grant when the module declares zero capabilities", async () => {
    const manifest = baseManifest({ id: "io.evolutionos.modules.install-no-caps", components: [{ id: "x", type: "sensor", capabilities: [] }] });
    await publish(manifest);
    const projectId = await registerProject();

    const res = await install(projectId, manifest.id, manifest.version);
    expect(res.statusCode).toBe(201);
    expect(res.json().capabilities).toEqual([]);
  });

  it("rejects installing an unknown module with 404", async () => {
    const projectId = await registerProject();
    const res = await install(projectId, "io.evolutionos.modules.does-not-exist", "1.0.0");
    expect(res.statusCode).toBe(404);
  });

  it("rejects installing an unknown version of a known module with 404", async () => {
    await grantCapability("module-test.resource.read");
    const manifest = baseManifest({ id: "io.evolutionos.modules.install-unknown-version" });
    await publish(manifest);
    const projectId = await registerProject();
    const res = await install(projectId, manifest.id, "9.9.9");
    expect(res.statusCode).toBe(404);
  });

  it("rejects install when the signature no longer verifies with 409", async () => {
    await grantCapability("module-test.resource.read");
    const manifest = baseManifest({ id: "io.evolutionos.modules.install-tampered" });
    await publish(manifest);
    await pool.query(
      `update module_versions set manifest = manifest || '{"name": "tampered"}'::jsonb
        where module_id = $1 and version = $2`,
      [manifest.id, manifest.version],
    );
    const projectId = await registerProject();
    const res = await install(projectId, manifest.id, manifest.version);
    expect(res.statusCode).toBe(409);
    expect(res.json().title).toBe("signature_invalid");
  });

  it("rejects install when the persisted signature itself is corrupted, independent of the manifest", async () => {
    await grantCapability("module-test.resource.read");
    const manifest = baseManifest({ id: "io.evolutionos.modules.install-corrupt-signature" });
    await publish(manifest);
    // Corrupt only the signature column - manifest/digest stay exactly as signed, so this
    // exercises the actual Ed25519 verify() call rather than the digest-mismatch short-circuit.
    await pool.query(`update module_versions set signature = $1 where module_id = $2 and version = $3`, [
      Buffer.from("not-a-real-signature").toString("base64"),
      manifest.id,
      manifest.version,
    ]);
    const projectId = await registerProject();
    const res = await install(projectId, manifest.id, manifest.version);
    expect(res.statusCode).toBe(409);
    expect(res.json().title).toBe("signature_invalid");
  });

  it("is idempotent when reinstalling the exact same version already active", async () => {
    await grantCapability("module-test.resource.read");
    const manifest = baseManifest({ id: "io.evolutionos.modules.install-replay" });
    await publish(manifest);
    const projectId = await registerProject();

    const first = await install(projectId, manifest.id, manifest.version);
    const second = await install(projectId, manifest.id, manifest.version);
    expect(second.statusCode).toBe(200);
    expect(second.json()).toEqual(first.json());

    const rows = await pool.query(
      `select count(*)::int as n from module_installations where project_id = $1 and module_id = $2`,
      [projectId, manifest.id],
    );
    expect(rows.rows[0].n).toBe(1);
  });

  it("rejects installing a different version over an already-active one with 409", async () => {
    await grantCapability("module-test.resource.read");
    const manifest1 = baseManifest({ id: "io.evolutionos.modules.install-conflict", version: "1.0.0" });
    const manifest2 = baseManifest({ id: "io.evolutionos.modules.install-conflict", version: "2.0.0" });
    await publish(manifest1);
    await publish(manifest2);
    const projectId = await registerProject();

    await install(projectId, manifest1.id, "1.0.0");
    const res = await install(projectId, manifest1.id, "2.0.0");
    expect(res.statusCode).toBe(409);
    expect(res.json().title).toBe("already_installed");
    expect(res.json().currentVersion).toBe("1.0.0");
  });

  it("is denied cross-tenant", async () => {
    await grantCapability("module-test.resource.read");
    const manifest = baseManifest({ id: "io.evolutionos.modules.install-cross-tenant" });
    await publish(manifest);
    const projectId = await registerProject();
    const loginB = await app.inject({
      method: "POST",
      url: "/auth/dev-login",
      payload: { email: "dev-b@evolutionos.local" },
    });
    const res = await install(projectId, manifest.id, manifest.version, loginB.json().token);
    expect(res.statusCode).toBe(403);
  });
});
