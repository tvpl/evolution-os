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

function publish(token: string, manifest: Record<string, unknown>) {
  return app.inject({
    method: "POST",
    url: "/orgs/current/modules",
    headers: { authorization: `Bearer ${token}` },
    payload: manifest,
  });
}

function readVersion(token: string, moduleId: string, version: string) {
  return app.inject({
    method: "GET",
    url: `/orgs/current/modules/${moduleId}/versions/${version}`,
    headers: { authorization: `Bearer ${token}` },
  });
}

function listRegistry(token: string) {
  return app.inject({
    method: "GET",
    url: "/orgs/current/modules",
    headers: { authorization: `Bearer ${token}` },
  });
}

function baseManifest(overrides: Record<string, unknown> = {}) {
  return {
    id: "io.evolutionos.modules.verify-test",
    version: "1.0.0",
    publisher: "io.evolutionos.foundation",
    name: "Verify Test",
    components: [{ id: "sensor-a", type: "sensor", capabilities: [] }],
    ...overrides,
  };
}

beforeAll(async () => {
  pool = await freshDb("evoos_test_modules_verify");
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

describe("verify module signatures on read and list the registry (MODL-05/06/20)", () => {
  it("returns signatureValid: true for a freshly published version", async () => {
    const manifest = baseManifest();
    await publish(tokenA, manifest);
    const res = await readVersion(tokenA, manifest.id, manifest.version);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.moduleId).toBe(manifest.id);
    expect(body.version).toBe(manifest.version);
    expect(body.signatureValid).toBe(true);
  });

  it("returns signatureValid: false, without throwing, when the persisted manifest was tampered", async () => {
    const manifest = baseManifest({ id: "io.evolutionos.modules.tamper-test" });
    await publish(tokenA, manifest);

    await pool.query(
      `update module_versions set manifest = manifest || '{"name": "tampered-after-signing"}'::jsonb
        where module_id = $1 and version = $2`,
      [manifest.id, manifest.version],
    );

    const res = await readVersion(tokenA, manifest.id, manifest.version);
    expect(res.statusCode).toBe(200);
    expect(res.json().signatureValid).toBe(false);
  });

  it("returns 404 for an unknown module version", async () => {
    const res = await readVersion(tokenA, "io.evolutionos.modules.does-not-exist", "9.9.9");
    expect(res.statusCode).toBe(404);
  });

  it("lists the org's published modules with the latest version's digest and signature validity", async () => {
    const manifest = baseManifest({ id: "io.evolutionos.modules.list-test" });
    const published = await publish(tokenA, manifest);
    const res = await listRegistry(tokenA);
    expect(res.statusCode).toBe(200);
    const entry = res.json().modules.find((m: { moduleId: string }) => m.moduleId === manifest.id);
    expect(entry).toEqual({
      moduleId: manifest.id,
      name: manifest.name,
      latestVersion: manifest.version,
      digest: published.json().digest,
      signatureValid: true,
    });
  });

  it("never returns a module version published by a different org", async () => {
    const manifest = baseManifest({ id: "io.evolutionos.modules.org-isolated" });
    await publish(tokenA, manifest);

    const res = await readVersion(tokenB, manifest.id, manifest.version);
    expect(res.statusCode).toBe(404);

    const list = await listRegistry(tokenB);
    const leaked = list.json().modules.find((m: { moduleId: string }) => m.moduleId === manifest.id);
    expect(leaked).toBeUndefined();
  });
});
