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

export async function getCurrentInventory(pool: DbPool, projectId: string): Promise<InventoryRow | null> {
  const res = await pool.query(
    `select version, skills, mcps, models, created_at as "createdAt"
       from harness_inventories where project_id = $1 order by version desc limit 1`,
    [projectId],
  );
  return (res.rows[0] as InventoryRow | undefined) ?? null;
}
