import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import {
  buildServer,
  createPool,
  runMigrations,
  seedDevData,
  seedDevGrants,
  type DbPool,
} from "@evolution-os/hub";

const { Client } = pg;
const BASE_URL = process.env["EVOOS_PG_BASE_URL"] ?? "postgresql://evo@127.0.0.1:55432";
const DB = "evoos_test_cli";
const APP_DIR = join(import.meta.dirname, "..", "..");

let pool: DbPool;
let app: FastifyInstance;
let hubUrl: string;
let sessionToken: string;
let workDir: string;
let configPath: string;

const execFileAsync = promisify(execFile);

// IMPORTANTE: spawn assíncrono — o Hub roda NESTE processo de teste, então um
// spawn síncrono bloquearia o event loop e deadlockaria o fetch do CLI.
async function evo(args: string[]): Promise<{ code: number; out: string }> {
  try {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      ["--import", "tsx", "src/main.ts", ...args, "--config", configPath],
      { cwd: APP_DIR, encoding: "utf8", timeout: 45_000 },
    );
    return { code: 0, out: `${stdout}${stderr}` };
  } catch (err) {
    const e = err as { code?: number; stdout?: string; stderr?: string };
    return { code: typeof e.code === "number" ? e.code : 1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

beforeAll(async () => {
  const admin = new Client({ connectionString: `${BASE_URL}/postgres` });
  await admin.connect();
  await admin.query(
    "select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()",
    [DB],
  );
  await admin.query(`drop database if exists ${DB}`);
  await admin.query(`create database ${DB}`);
  await admin.end();
  pool = createPool(`${BASE_URL}/${DB}`);
  await runMigrations(pool);
  await seedDevData(pool);
  await seedDevGrants(pool);

  app = buildServer({ pool });
  await app.listen({ host: "127.0.0.1", port: 0 });
  const address = app.server.address();
  if (typeof address === "string" || address === null) throw new Error("no port");
  hubUrl = `http://127.0.0.1:${address.port}`;

  const login = await fetch(`${hubUrl}/auth/dev-login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "dev-a@evolutionos.local" }),
  });
  sessionToken = ((await login.json()) as { token: string }).token;

  workDir = mkdtempSync(join(tmpdir(), "evo-cli-"));
  configPath = join(workDir, "node.json");
});

afterAll(async () => {
  await app?.close();
  await pool?.end();
});

describe("evo cli against a real hub (TRUST-12/13 client side)", () => {
  it("init writes the local config and doctor confirms hub reachability", async () => {
    const init = await evo(["init", "--hub", hubUrl, "--session", sessionToken]);
    expect(init.code).toBe(0);
    const config = JSON.parse(readFileSync(configPath, "utf8"));
    expect(config).toMatchObject({ hubUrl, sessionToken });

    const doctor = await evo(["doctor"]);
    expect(doctor.code).toBe(0);
    expect(doctor.out).toContain("hub reachable");
    expect(doctor.out).toContain("not enrolled yet");
  });

  it("sync before enroll fails with a clear message and non-zero exit", async () => {
    const file = join(workDir, "artifact.txt");
    writeFileSync(file, "conteudo dummy");
    const sync = await evo(["sync", "--file", file]);
    expect(sync.code).not.toBe(0);
    expect(sync.out).toContain("not enrolled");
  });

  it("enroll persists the node identity and token in the config", async () => {
    const enroll = await evo(["enroll", "--name", "node-cli-test"]);
    expect(enroll.code).toBe(0);
    expect(enroll.out).toMatch(/enrolled: node_/);
    const config = JSON.parse(readFileSync(configPath, "utf8"));
    expect(config.nodeId).toMatch(/^node_/);
    expect(config.nodeToken).toMatch(/^nodetok_/);
    const row = await pool.query("select name from node_agents where id = $1", [config.nodeId]);
    expect(row.rows[0]?.name).toBe("node-cli-test");
  });

  it("sync sends the dummy artifact and the hub records the exact sha256 digest", async () => {
    const file = join(workDir, "dummy.bin");
    const content = "artefato dummy do slice zero";
    writeFileSync(file, content);
    const expectedDigest = `sha256:${createHash("sha256").update(content).digest("hex")}`;

    const sync = await evo(["sync", "--file", file]);
    expect(sync.code).toBe(0);
    expect(sync.out).toContain(`digest ${expectedDigest}`);

    const config = JSON.parse(readFileSync(configPath, "utf8"));
    const row = await pool.query(
      "select name, digest from node_artifacts where node_id = $1 order by received_at desc limit 1",
      [config.nodeId],
    );
    expect(row.rows[0]).toEqual({ name: "dummy.bin", digest: expectedDigest });
  });

  it("doctor reports the enrollment after enroll", async () => {
    const doctor = await evo(["doctor"]);
    expect(doctor.code).toBe(0);
    expect(doctor.out).toMatch(/enrolled as node_/);
  });
});
