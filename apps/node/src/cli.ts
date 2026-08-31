import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { Command } from "commander";
import { defaultConfigPath, readConfig, writeConfig, type NodeConfig } from "./config.js";

/**
 * CLI mínimo do Evolution Node (M0): fala APENAS HTTP com o Hub (ADR-001).
 * O token do Node vive no config local; nenhum segredo vai em manifests.
 */

class CliError extends Error {}

function sha256(content: Buffer | string): string {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

function loadConfig(path: string): NodeConfig {
  const config = readConfig(path);
  if (!config) {
    throw new CliError(`config not found at ${path} — run 'evo init' first`);
  }
  return config;
}

async function hubFetch(
  url: string,
  init: RequestInit,
): Promise<{ status: number; body: Record<string, unknown> }> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new CliError(`hub unreachable at ${url}`);
  }
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, body };
}

export async function cmdInit(opts: { hub: string; session?: string; config: string }): Promise<string> {
  const config: NodeConfig = { hubUrl: opts.hub };
  if (opts.session) config.sessionToken = opts.session;
  writeConfig(opts.config, config);
  return `config written to ${opts.config}`;
}

export async function cmdDoctor(opts: { config: string }): Promise<string> {
  const config = loadConfig(opts.config);
  const { status } = await hubFetch(`${config.hubUrl}/healthz`, { method: "GET" });
  if (status !== 200) {
    throw new CliError(`hub responded ${status} on /healthz`);
  }
  const enrollment = config.nodeId ? `enrolled as ${config.nodeId}` : "not enrolled yet";
  return `ok: hub reachable at ${config.hubUrl}; ${enrollment}`;
}

export async function cmdEnroll(opts: { name: string; config: string }): Promise<string> {
  const config = loadConfig(opts.config);
  if (!config.sessionToken) {
    throw new CliError("no operator session in config — run 'evo init --session <token>'");
  }
  const { status, body } = await hubFetch(`${config.hubUrl}/nodes/enroll`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.sessionToken}`,
    },
    body: JSON.stringify({ name: opts.name }),
  });
  if (status !== 201) {
    throw new CliError(`enroll rejected (${status}): ${String(body["title"] ?? "")}`);
  }
  writeConfig(opts.config, {
    ...config,
    nodeId: String(body["nodeId"]),
    nodeToken: String(body["token"]),
  });
  return `enrolled: ${String(body["nodeId"])}`;
}

export async function cmdSync(opts: { file: string; name?: string; config: string }): Promise<string> {
  const config = loadConfig(opts.config);
  if (!config.nodeId || !config.nodeToken) {
    throw new CliError("node is not enrolled — run 'evo enroll --name <name>' first");
  }
  const content = readFileSync(opts.file);
  const digest = sha256(content);
  const { status, body } = await hubFetch(`${config.hubUrl}/nodes/${config.nodeId}/artifacts`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-node-token": config.nodeToken },
    body: JSON.stringify({
      name: opts.name ?? basename(opts.file),
      digest,
      content: content.toString("utf8"),
    }),
  });
  if (status !== 201) {
    throw new CliError(`sync rejected (${status}): ${String(body["title"] ?? "")}`);
  }
  return `synced: artifact ${String(body["artifactId"])} digest ${String(body["digest"])}`;
}

export function buildProgram(): Command {
  const program = new Command();
  program.name("evo").description("Evolution Node CLI (M0 skeleton)").exitOverride();
  const configOption = ["--config <path>", "config file path", defaultConfigPath()] as const;

  program
    .command("init")
    .requiredOption("--hub <url>", "hub base URL")
    .option("--session <token>", "operator session token (for enroll)")
    .option(...configOption)
    .action(async (opts) => console.log(await cmdInit(opts)));

  program
    .command("doctor")
    .option(...configOption)
    .action(async (opts) => console.log(await cmdDoctor(opts)));

  program
    .command("enroll")
    .requiredOption("--name <name>", "node display name")
    .option(...configOption)
    .action(async (opts) => console.log(await cmdEnroll(opts)));

  program
    .command("sync")
    .requiredOption("--file <path>", "artifact file to sync")
    .option("--name <name>", "artifact name (defaults to file name)")
    .option(...configOption)
    .action(async (opts) => console.log(await cmdSync(opts)));

  return program;
}

export async function runCli(argv: string[]): Promise<number> {
  try {
    await buildProgram().parseAsync(argv, { from: "user" });
    return 0;
  } catch (err) {
    if (err instanceof CliError) {
      console.error(`error: ${err.message}`);
      return 1;
    }
    throw err;
  }
}
