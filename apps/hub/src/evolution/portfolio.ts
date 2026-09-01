import { randomUUID } from "node:crypto";
import type { DbPool } from "../platform/db.js";
import { withTx } from "../platform/db.js";
import type { AuthScope } from "../identity/session.js";

export const RELATION_TYPES = ["composition", "dependency", "implementation", "ownership", "influence"] as const;
export type RelationType = (typeof RELATION_TYPES)[number];

export interface DeclareRelationInput {
  targetProjectId: string;
  type: string;
}

export type DeclareRelationOutcome =
  | { kind: "declared"; relationId: string }
  | { kind: "invalid_type" }
  | { kind: "self_relation" }
  | { kind: "not_found" };

/**
 * PORT-01/02/03/04: implementa `spec.relations` (CORE-FR-002) pela primeira
 * vez - o campo já existe no manifest schema desde o Slice 0, mas nunca foi
 * persistido/consultado por nenhum código do Hub até este slice.
 */
export async function declareRelation(
  pool: DbPool,
  scope: AuthScope,
  sourceProjectId: string,
  input: DeclareRelationInput,
): Promise<DeclareRelationOutcome> {
  if (!RELATION_TYPES.includes(input.type as RelationType)) return { kind: "invalid_type" };
  if (input.targetProjectId === sourceProjectId) return { kind: "self_relation" };

  const target = await pool.query("select org_id from projects where id = $1", [input.targetProjectId]);
  const targetRow = target.rows[0] as { org_id: string } | undefined;
  if (!targetRow || targetRow.org_id !== scope.orgId) return { kind: "not_found" };

  return withTx(pool, async (client) => {
    const existing = await client.query(
      `select id from project_relations where source_project_id = $1 and target_project_id = $2 and type = $3`,
      [sourceProjectId, input.targetProjectId, input.type],
    );
    const existingRow = existing.rows[0] as { id: string } | undefined;
    if (existingRow) return { kind: "declared", relationId: existingRow.id };

    const id = `rel_${randomUUID().replaceAll("-", "")}`;
    await client.query(
      `insert into project_relations (id, org_id, workspace_id, source_project_id, target_project_id, type)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (source_project_id, target_project_id, type) do nothing`,
      [id, scope.orgId, scope.workspaceId, sourceProjectId, input.targetProjectId, input.type],
    );
    const row = await client.query(
      `select id from project_relations where source_project_id = $1 and target_project_id = $2 and type = $3`,
      [sourceProjectId, input.targetProjectId, input.type],
    );
    return { kind: "declared", relationId: (row.rows[0] as { id: string }).id };
  });
}

export interface RelationRow {
  id: string;
  sourceProjectId: string;
  targetProjectId: string;
  type: string;
  createdAt: string;
}

export interface ProjectRelations {
  outbound: RelationRow[];
  inbound: RelationRow[];
}

export async function listRelations(pool: DbPool, projectId: string): Promise<ProjectRelations> {
  const outbound = await pool.query(
    `select id, source_project_id as "sourceProjectId", target_project_id as "targetProjectId", type, created_at as "createdAt"
       from project_relations where source_project_id = $1 order by created_at`,
    [projectId],
  );
  const inbound = await pool.query(
    `select id, source_project_id as "sourceProjectId", target_project_id as "targetProjectId", type, created_at as "createdAt"
       from project_relations where target_project_id = $1 order by created_at`,
    [projectId],
  );
  return { outbound: outbound.rows as RelationRow[], inbound: inbound.rows as RelationRow[] };
}

export interface DashboardMember {
  projectId: string;
  openProposalsCount: number;
  rejectedDecisionsCount: number;
  runningExperimentsCount: number;
}

/**
 * PORT-05/06/07: agrega contagens diretas e determinísticas dos membros
 * `composition` de um portfolio - nunca um "health score" ponderado (nenhuma
 * doc-fonte define pesos; ver design.md Out of Scope/Assumptions).
 */
export async function getPortfolioDashboard(pool: DbPool, portfolioProjectId: string): Promise<DashboardMember[]> {
  const members = await pool.query(
    `select target_project_id as "projectId" from project_relations
      where source_project_id = $1 and type = 'composition' order by created_at`,
    [portfolioProjectId],
  );
  const memberIds = (members.rows as { projectId: string }[]).map((r) => r.projectId);

  const results: DashboardMember[] = [];
  for (const projectId of memberIds) {
    const [openProposals, rejectedDecisions, runningExperiments] = await Promise.all([
      pool.query(
        `select count(*)::int as n from proposals where project_id = $1 and status in ('draft', 'readyForReview')`,
        [projectId],
      ),
      pool.query(`select count(*)::int as n from decisions where project_id = $1 and decision = 'reject'`, [
        projectId,
      ]),
      pool.query(`select count(*)::int as n from experiments where project_id = $1 and status = 'running'`, [
        projectId,
      ]),
    ]);
    results.push({
      projectId,
      openProposalsCount: (openProposals.rows[0] as { n: number }).n,
      rejectedDecisionsCount: (rejectedDecisions.rows[0] as { n: number }).n,
      runningExperimentsCount: (runningExperiments.rows[0] as { n: number }).n,
    });
  }
  return results;
}
