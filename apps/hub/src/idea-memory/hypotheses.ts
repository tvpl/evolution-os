import type { DbClient, DbPool } from "../platform/db.js";
import type { AuthScope } from "../identity/session.js";

type Queryable = DbPool | DbClient;

export interface HypothesisInput {
  id: string;
  statement: string;
  type?: string;
  evidenceState?: string;
  metric?: string;
  threshold?: string;
  status: string;
}

export class DuplicateHypothesisIdError extends Error {
  constructor(public readonly duplicateId: string) {
    super(`duplicate hypothesis id: ${duplicateId}`);
  }
}

/**
 * Insere as hipóteses do manifest DENTRO da transação de registro do projeto
 * (IDEA-01/02/04). Chamador garante que roda em withTx — uma falha aqui
 * reverte o registro inteiro junto. Authority é sempre 'declared' neste
 * slice (REG-FR-003; observed/inferred chegam com sensores no Slice 2).
 */
export async function insertHypotheses(
  client: DbClient,
  projectId: string,
  scope: AuthScope,
  hypotheses: HypothesisInput[],
): Promise<void> {
  const seen = new Set<string>();
  for (const h of hypotheses) {
    if (seen.has(h.id)) {
      throw new DuplicateHypothesisIdError(h.id);
    }
    seen.add(h.id);
  }
  for (const h of hypotheses) {
    await client.query(
      `insert into hypotheses (project_id, id, org_id, workspace_id, statement, type,
                                evidence_state, metric, threshold, status, authority)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'declared')`,
      [
        projectId,
        h.id,
        scope.orgId,
        scope.workspaceId,
        h.statement,
        h.type ?? null,
        h.evidenceState ?? null,
        h.metric ?? null,
        h.threshold ?? null,
        h.status,
      ],
    );
  }
}

export interface HypothesisRow {
  id: string;
  statement: string;
  type: string | null;
  evidenceState: string | null;
  metric: string | null;
  threshold: string | null;
  status: string;
  authority: string;
}

export async function listHypotheses(db: Queryable, projectId: string): Promise<HypothesisRow[]> {
  const res = await db.query(
    `select id, statement, type, evidence_state as "evidenceState", metric, threshold, status, authority
       from hypotheses where project_id = $1 order by created_at`,
    [projectId],
  );
  return res.rows as HypothesisRow[];
}
