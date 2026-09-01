import { execFile } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer, createPool, runMigrations, seedDevData, seedDevGrants, type DbPool } from "@evolution-os/hub";

const { Client } = pg;
const BASE_URL = process.env["EVOOS_PG_BASE_URL"] ?? "postgresql://evo@127.0.0.1:55432";
const DB = "evoos_test_snapshot_cli";
const APP_DIR = join(import.meta.dirname, "..", "..");
const execFileAsync = promisify(execFile);

let pool: DbPool;
let app: FastifyInstance;
let hubUrl: string;
let sessionToken: string;
let configPath: string;
let projectId: string;

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

function makeGitRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "snapshot-cli-repo-"));
  mkdirSync(join(dir, ".git", "refs", "heads"), { recursive: true });
  writeFileSync(join(dir, ".git", "HEAD"), "ref: refs/heads/main\n");
  writeFileSync(join(dir, ".git", "refs", "heads", "main"), "c".repeat(40) + "\n");
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "cli-repo" }));
  return dir;
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

  const reg = await fetch(`${hubUrl}/projects`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${sessionToken}`,
      "idempotency-key": "snapshot-cli-setup",
    },
    body: JSON.stringify({
      apiVersion: "evolutionos.io/v1alpha1",
      kind: "EvolutionProject",
      metadata: { name: "CLI Snapshot Proj", slug: "cli-snap-proj", type: "service", status: "discovery" },
      spec: { intent: { problem: "x" } },
    }),
  });
  projectId = ((await reg.json()) as { projectId: string }).projectId;

  const workDir = mkdtempSync(join(tmpdir(), "evo-snapshot-cli-"));
  configPath = join(workDir, "node.json");
  await evo(["init", "--hub", hubUrl, "--session", sessionToken]);
  await evo(["enroll", "--name", "node-snapshot-cli"]);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

describe("evo snapshot cli (TWIN-01/04)", () => {
  it("syncs a real repo successfully and prints the snapshot id", async () => {
    const repo = makeGitRepo();
    const result = await evo(["snapshot", "--project", projectId, "--path", repo]);
    expect(result.code).toBe(0);
    expect(result.out).toMatch(/snapshot: snp_/);
    const row = await pool.query("select branch, commit_sha as sha from snapshots where project_id = $1", [
      projectId,
    ]);
    expect(row.rows[0]).toEqual({ branch: "main", sha: "c".repeat(40) });
  });

  it("fails with a clear message when the node is not enrolled", async () => {
    const workDir = mkdtempSync(join(tmpdir(), "evo-snapshot-noenroll-"));
    const noEnrollConfig = join(workDir, "node.json");
    const prevConfig = configPath;
    configPath = noEnrollConfig;
    await evo(["init", "--hub", hubUrl]);
    const repo = makeGitRepo();
    const result = await evo(["snapshot", "--project", projectId, "--path", repo]);
    configPath = prevConfig;
    expect(result.code).not.toBe(0);
    expect(result.out).toContain("not enrolled");
  });

  it("fails outside a git repository without calling the hub", async () => {
    const notARepo = mkdtempSync(join(tmpdir(), "not-a-repo-"));
    const before = await pool.query("select count(*)::int as n from snapshots where project_id = $1", [
      projectId,
    ]);
    const result = await evo(["snapshot", "--project", projectId, "--path", notARepo]);
    expect(result.code).not.toBe(0);
    expect(result.out).toContain("not a git repository");
    const after = await pool.query("select count(*)::int as n from snapshots where project_id = $1", [
      projectId,
    ]);
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });
});
