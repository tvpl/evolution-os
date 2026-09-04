import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface NodeConfig {
  hubUrl: string;
  sessionToken?: string;
  nodeId?: string;
  nodeToken?: string;
}

export function defaultConfigPath(): string {
  return process.env["EVOOS_NODE_CONFIG"] ?? join(homedir(), ".evolution-os", "node.json");
}

export function readConfig(path: string): NodeConfig | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as NodeConfig;
  } catch {
    return null;
  }
}

export function writeConfig(path: string, config: NodeConfig): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}
