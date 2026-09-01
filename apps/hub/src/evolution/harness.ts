import { randomUUID } from "node:crypto";
import type { DbPool } from "../platform/db.js";
import type { AuthScope } from "../identity/session.js";

export interface InventoryComponent {
  id: string;
  name: string;
  version: string;
}

export interface DeclareInventoryInput {
  skills: InventoryComponent[];
  mcps: InventoryComponent[];
  models: InventoryComponent[];
}

export type DeclareInventoryOutcome = { kind: "declared"; version: number };

/**
 * HRN-01: append-only, versão incremental por projeto — mesmo padrão de
 * `artifact_versions` (Slice 1). Um inventário declarado-e-vazio é um
 * estado válido (arrays vazios), distinto de "nenhum inventário ainda"
 * (ver `getCurrentInventory`, que retorna `null` nesse caso).
 */
export async function declareInventory(
  pool: DbPool,
  scope: AuthScope,
  projectId: string,
  input: DeclareInventoryInput,
): Promise<DeclareInventoryOutcome> {
  const current = await pool.query(
    "select coalesce(max(version), 0) as v from harness_inventories where project_id = $1",
    [projectId],
  );
  const nextVersion = (current.rows[0] as { v: number }).v + 1;
  const id = `hin_${randomUUID().replaceAll("-", "")}`;
  await pool.query(
    `insert into harness_inventories (id, project_id, org_id, workspace_id, version, skills, mcps, models)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      id,
      projectId,
      scope.orgId,
      scope.workspaceId,
      nextVersion,
      JSON.stringify(input.skills),
      JSON.stringify(input.mcps),
      JSON.stringify(input.models),
    ],
  );
  return { kind: "declared", version: nextVersion };
}

export interface InventoryRow {
  version: number;
  skills: InventoryComponent[];
  mcps: InventoryComponent[];
  models: InventoryComponent[];
  createdAt: string;
}

export type InvariantType = "requires_skill" | "requires_mcp" | "forbids_mcp" | "min_component_count";

export interface DeclareEvalCaseInput {
  name: string;
  invariantType: InvariantType;
  params: Record<string, unknown>;
}

export async function declareEvalCase(
  pool: DbPool,
  scope: AuthScope,
  projectId: string,
  input: DeclareEvalCaseInput,
): Promise<{ caseId: string }> {
  const caseId = `hec_${randomUUID().replaceAll("-", "")}`;
  await pool.query(
    `insert into harness_eval_cases (id, project_id, org_id, workspace_id, name, invariant_type, params)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [caseId, projectId, scope.orgId, scope.workspaceId, input.name, input.invariantType, JSON.stringify(input.params)],
  );
  return { caseId };
}

export interface EvalCaseRow {
  id: string;
  name: string;
  invariantType: string;
  params: Record<string, unknown>;
  createdAt: string;
}

export async function listEvalCases(pool: DbPool, projectId: string): Promise<EvalCaseRow[]> {
  const res = await pool.query(
    `select id, name, invariant_type as "invariantType", params, created_at as "createdAt"
       from harness_eval_cases where project_id = $1 order by created_at`,
    [projectId],
  );
  return res.rows as EvalCaseRow[];
}

export interface EvalCaseResult {
  caseId: string;
  name: string;
  invariantType: string;
  passed: boolean;
  reason: string;
}

/**
 * HRN-07: função pura, sem I/O — mesmo espírito do `evaluateExperiment`
 * (Slice 4) e do `AnalysisProvider` (Slice 3). Checa o invariante contra o
 * inventário DECLARADO, nunca uma execução real de skill/MCP (ver spec Out
 * of Scope).
 */
export function runEvalCase(inventory: InventoryRow, evalCase: EvalCaseRow): EvalCaseResult {
  const base = { caseId: evalCase.id, name: evalCase.name, invariantType: evalCase.invariantType };
  switch (evalCase.invariantType as InvariantType) {
    case "requires_skill": {
      const skillId = evalCase.params.skillId as string;
      const found = inventory.skills.some((s) => s.id === skillId);
      return { ...base, passed: found, reason: found ? `skill '${skillId}' found` : `skill '${skillId}' missing` };
    }
    case "requires_mcp": {
      const mcpId = evalCase.params.mcpId as string;
      const found = inventory.mcps.some((m) => m.id === mcpId);
      return { ...base, passed: found, reason: found ? `mcp '${mcpId}' found` : `mcp '${mcpId}' missing` };
    }
    case "forbids_mcp": {
      const mcpId = evalCase.params.mcpId as string;
      const found = inventory.mcps.some((m) => m.id === mcpId);
      return {
        ...base,
        passed: !found,
        reason: found ? `mcp '${mcpId}' is present but forbidden` : `mcp '${mcpId}' correctly absent`,
      };
    }
    case "min_component_count": {
      const category = evalCase.params.category as "skills" | "mcps" | "models";
      const min = evalCase.params.min as number;
      const count = inventory[category].length;
      const passed = count >= min;
      return {
        ...base,
        passed,
        reason: `${category} count ${count} ${passed ? ">=" : "<"} required minimum ${min}`,
      };
    }
  }
}

export interface RunEvalDatasetResult {
  passed: number;
  total: number;
  results: EvalCaseResult[];
}

export function runEvalDataset(inventory: InventoryRow, evalCases: EvalCaseRow[]): RunEvalDatasetResult {
  const results = evalCases.map((c) => runEvalCase(inventory, c));
  const passed = results.filter((r) => r.passed).length;
  return { passed, total: results.length, results };
}

export type RunEvalOutcome =
  | { kind: "ran"; runId: string; passed: number; total: number; results: EvalCaseResult[] }
  | { kind: "requires_inventory" }
  | { kind: "requires_eval_cases" };

/** HRN-07/08/09: exige inventário e ≥1 eval case; persiste o run com o
 * score e os resultados por caso na mesma operação. */
export async function runEval(pool: DbPool, scope: AuthScope, projectId: string): Promise<RunEvalOutcome> {
  const inventory = await getCurrentInventory(pool, projectId);
  if (!inventory) return { kind: "requires_inventory" };

  const evalCases = await listEvalCases(pool, projectId);
  if (evalCases.length === 0) return { kind: "requires_eval_cases" };

  const { passed, total, results } = runEvalDataset(inventory, evalCases);

  const runId = `her_${randomUUID().replaceAll("-", "")}`;
  await pool.query(
    `insert into harness_eval_runs (id, project_id, org_id, workspace_id, inventory_version,
                                     score_passed, score_total, results)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [runId, projectId, scope.orgId, scope.workspaceId, inventory.version, passed, total, JSON.stringify(results)],
  );
  return { kind: "ran", runId, passed, total, results };
}

export async function getCurrentInventory(pool: DbPool, projectId: string): Promise<InventoryRow | null> {
  const res = await pool.query(
    `select version, skills, mcps, models, created_at as "createdAt"
       from harness_inventories where project_id = $1 order by version desc limit 1`,
    [projectId],
  );
  return (res.rows[0] as InventoryRow | undefined) ?? null;
}
