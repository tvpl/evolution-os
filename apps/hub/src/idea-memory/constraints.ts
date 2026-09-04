import type { DbClient, DbPool } from "../platform/db.js";
import type { AuthScope } from "../identity/session.js";

type Queryable = DbPool | DbClient;

export interface ConstraintInput {
  id: string;
  category?: string;
  statement: string;
  severity: string;
}

/**
 * Insere as constraints do manifest DENTRO da transação de registro
 * (IDEA-01/02) — mesmo padrão de `insertHypotheses`. Authority sempre
 * 'declared' neste slice.
 */
export async function insertConstraints(
  client: DbClient,
  projectId: string,
  scope: AuthScope,
  constraints: ConstraintInput[],
): Promise<void> {
  for (const c of constraints) {
    await client.query(
      `insert into constraints_ (project_id, id, org_id, workspace_id, category, statement, severity, authority)
       values ($1, $2, $3, $4, $5, $6, $7, 'declared')`,
      [projectId, c.id, scope.orgId, scope.workspaceId, c.category ?? null, c.statement, c.severity],
    );
  }
}

export interface ConstraintRow {
  id: string;
  category: string | null;
  statement: string;
  severity: string;
  authority: string;
}

export async function listConstraints(db: Queryable, projectId: string): Promise<ConstraintRow[]> {
  const res = await db.query(
    `select id, category, statement, severity, authority
       from constraints_ where project_id = $1 order by created_at`,
    [projectId],
  );
  return res.rows as ConstraintRow[];
}
