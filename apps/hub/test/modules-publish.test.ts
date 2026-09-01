import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { freshDb } from "./helpers.js";
import { buildServer } from "../src/server.js";
import { seedDevData } from "../src/identity/seed.js";
import { seedDevGrants } from "../src/policy/policy.js";
import { computeManifestDigest } from "../src/evolution/modules.js";
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

function baseManifest(overrides: Record<string, unknown> = {}) {
  return {
    id: "io.evolutionos.modules.test-scout",
    version: "1.0.0",
    publisher: "io.evolutionos.foundation",
    name: "Test Scout",
    components: [{ id: "sensor-a", type: "sensor", capabilities: ["network.read:declared-domains"] }],
    ...overrides,
  };
}

beforeAll(async () => {
  pool = await freshDb("evoos_test_modules_publish");
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

describe("publish a signed module manifest (MODL-01/02/03/04)", () => {
  it("publishes a valid manifest with the exact recomputed digest and a deterministic SBOM", async () => {
    const manifest = baseManifest();
    const res = await publish(tokenA, manifest);
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.moduleId).toBe(manifest.id);
    expect(body.version).toBe(manifest.version);
    expect(body.digest).toBe(computeManifestDigest(manifest));
    expect(typeof body.signature).toBe("string");
    expect(body.signature.length).toBeGreaterThan(0);
    expect(body.sbom).toEqual({
      sbomFormat: "evolutionos-sbom-v0",
      moduleId: manifest.id,
      version: manifest.version,
      components: [{ id: "sensor-a", type: "sensor", capabilities: ["network.read:declared-domains"] }],
    });
  });

  it("replays the existing version idempotently when republished with an identical manifest", async () => {
    const manifest = baseManifest({ id: "io.evolutionos.modules.replay-test" });
    const first = await publish(tokenA, manifest);
    const second = await publish(tokenA, manifest);
    expect(second.statusCode).toBe(201);
    expect(second.json()).toEqual(first.json());

    const rows = await pool.query("select count(*)::int as n from module_versions where module_id = $1", [
      manifest.id,
    ]);
    expect(rows.rows[0].n).toBe(1);
  });

  it("rejects republishing the same version with a different manifest with 409", async () => {
    const manifest = baseManifest({ id: "io.evolutionos.modules.conflict-test" });
    await publish(tokenA, manifest);
    const mutated = baseManifest({ id: "io.evolutionos.modules.conflict-test", name: "Renamed" });
    const res = await publish(tokenA, mutated);
    expect(res.statusCode).toBe(409);
    expect(res.json().title).toBe("version_conflict");
  });

  it("rejects a manifest published by a different org under the same module id with 409", async () => {
    const manifest = baseManifest({ id: "io.evolutionos.modules.owned-by-a" });
    await publish(tokenA, manifest);
    const res = await publish(tokenB, baseManifest({ id: "io.evolutionos.modules.owned-by-a" }));
    expect(res.statusCode).toBe(409);
  });

  it("rejects a manifest missing id with 422", async () => {
    const manifest = baseManifest();
    delete (manifest as Record<string, unknown>)["id"];
    const res = await publish(tokenA, manifest);
    expect(res.statusCode).toBe(422);
    expect(res.json().title).toBe("invalid_manifest");
  });

  it("rejects a manifest missing publisher with 422", async () => {
    const manifest = baseManifest();
    delete (manifest as Record<string, unknown>)["publisher"];
    const res = await publish(tokenA, manifest);
    expect(res.statusCode).toBe(422);
  });

  it("rejects a manifest with a non-SemVer version with 422", async () => {
    const res = await publish(tokenA, baseManifest({ version: "not-a-version" }));
    expect(res.statusCode).toBe(422);
  });

  it("rejects a manifest with zero components with 422", async () => {
    const res = await publish(tokenA, baseManifest({ components: [] }));
    expect(res.statusCode).toBe(422);
  });

  it("rejects a manifest with a component type outside the declared set with 422", async () => {
    const res = await publish(
      tokenA,
      baseManifest({ components: [{ id: "x", type: "not-a-real-type", capabilities: [] }] }),
    );
    expect(res.statusCode).toBe(422);
  });

  it("rejects a manifest with duplicate component ids with 422", async () => {
    const res = await publish(
      tokenA,
      baseManifest({
        components: [
          { id: "dup", type: "sensor", capabilities: [] },
          { id: "dup", type: "analyzer", capabilities: [] },
        ],
      }),
    );
    expect(res.statusCode).toBe(422);
  });
});
