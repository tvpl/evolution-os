import { randomUUID } from "node:crypto";
import type { DbPool } from "../platform/db.js";
import type { AuthScope } from "../identity/session.js";

export interface AlternativeInput {
  id: string;
  title: string;
}

export interface RecordDecisionInput {
  decision: string;
  rationale: string;
  alternatives?: AlternativeInput[];
  subjectType?: "hypothesis" | "artifact" | "proposal";
  subjectId?: string;
  reviewTrigger?: string;
}

export interface DecisionRow {
  id: string;
  decision: string;
  actor: string;
  rationale: string;
  alternatives: AlternativeInput[];
  subjectType: string | null;
  subjectId: string | null;
  reviewTrigger: string | null;
  reviewTriggerStatus: string;
  decidedAt: string;
}

export type RecordDecisionOutcome =
  | { kind: "recorded"; decision: DecisionRow; priorRelatedDecisions: DecisionRow[] }
  | { kind: "invalid_subject" };

const SUBJECT_TABLE: Record<string, string> = {
  hypothesis: "hypotheses",
  artifact: "artifacts",
  proposal: "proposals",
};

async function subjectBelongsToProject(
  pool: DbPool,
  projectId: string,
  subjectType: string,
  subjectId: string,
): Promise<boolean> {
  const table = SUBJECT_TABLE[subjectType];
  if (!table) return false;
  const res = await pool.query(`select 1 from ${table} where id = $1 and project_id = $2`, [
    subjectId,
    projectId,
  ]);
  return (res.rowCount ?? 0) > 0;
}

function toRow(r: {
  id: string;
  decision: string;
  actor: string;
  rationale: string;
  alternatives: AlternativeInput[];
  subject_type: string | null;
  subject_id: string | null;
  review_trigger: string | null;
  review_trigger_status: string;
  decided_at: string;
}): DecisionRow {
  return {
    id: r.id,
    decision: r.decision,
    actor: r.actor,
    rationale: r.rationale,
    alternatives: r.alternatives,
    subjectType: r.subject_type,
    subjectId: r.subject_id,
    reviewTrigger: r.review_trigger,
    reviewTriggerStatus: r.review_trigger_status,
    decidedAt: r.decided_at,
  };
}

/**
 * IDEA-12/13/15: valida que o subject (quando presente) pertence ao mesmo
 * projeto ANTES de gravar; busca decisões anteriores sobre o mesmo subject
 * para expor o guard "rejeição não reaparece silenciosamente" do AGENTS.md.
 */
export async function recordDecision(
  pool: DbPool,
  scope: AuthScope,
  projectId: string,
  input: RecordDecisionInput,
): Promise<RecordDecisionOutcome> {
  if (input.subjectType && input.subjectId) {
    const valid = await subjectBelongsToProject(pool, projectId, input.subjectType, input.subjectId);
    if (!valid) return { kind: "invalid_subject" };
  }

  let priorRelatedDecisions: DecisionRow[] = [];
  if (input.subjectType && input.subjectId) {
    const prior = await pool.query(
      `select id, decision, actor, rationale, alternatives, subject_type, subject_id,
              review_trigger, review_trigger_status, decided_at
         from decisions
        where project_id = $1 and subject_type = $2 and subject_id = $3
        order by decided_at desc`,
      [projectId, input.subjectType, input.subjectId],
    );
    priorRelatedDecisions = prior.rows.map(toRow);
  }

  const id = `dec_${randomUUID().replaceAll("-", "")}`;
  const inserted = await pool.query(
    `insert into decisions (id, project_id, org_id, workspace_id, decision, actor, rationale,
                             alternatives, subject_type, subject_id, review_trigger, review_trigger_status)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     returning id, decision, actor, rationale, alternatives, subject_type, subject_id,
               review_trigger, review_trigger_status, decided_at`,
    [
      id,
      projectId,
      scope.orgId,
      scope.workspaceId,
      input.decision,
      scope.userId,
      input.rationale,
      JSON.stringify(input.alternatives ?? []),
      input.subjectType ?? null,
      input.subjectId ?? null,
      input.reviewTrigger ?? null,
      input.reviewTrigger ? "pending" : "none",
    ],
  );
  return { kind: "recorded", decision: toRow(inserted.rows[0]), priorRelatedDecisions };
}

export async function listDecisions(pool: DbPool, projectId: string): Promise<DecisionRow[]> {
  const res = await pool.query(
    `select id, decision, actor, rationale, alternatives, subject_type, subject_id,
            review_trigger, review_trigger_status, decided_at
       from decisions where project_id = $1 order by decided_at desc`,
    [projectId],
  );
  return res.rows.map(toRow);
}
