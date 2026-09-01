import { randomUUID } from "node:crypto";
import type { DbPool } from "../platform/db.js";
import type { AuthScope } from "../identity/session.js";

export interface ProposalAlternativeInput {
  id: string;
  type: string;
  title?: string;
}

export interface CreateProposalInput {
  title: string;
  summary: string;
  proposalType: string;
  whyNow?: string;
  costOfInaction?: string;
  alternatives?: ProposalAlternativeInput[];
  recommendedAlternativeId?: string;
  impact?: Record<string, unknown>;
  signalId?: string;
  investigationState?: string;
}

export type CreateProposalOutcome =
  | { kind: "created"; proposalId: string }
  | { kind: "requires_evidence" }
  | { kind: "invalid_signal_reference" };

/**
 * FLOW-12/15 (proposal spec §5 invariant): uma proposta material precisa de
 * claim com lastro em evidência (via `signalId`, que já exige uma claim
 * válida) OU de um `investigationState` explícito — nunca as duas coisas
 * ausentes ao mesmo tempo.
 */
export async function createProposal(
  pool: DbPool,
  scope: AuthScope,
  projectId: string,
  input: CreateProposalInput,
): Promise<CreateProposalOutcome> {
  if (!input.signalId && !input.investigationState) {
    return { kind: "requires_evidence" };
  }
  if (input.signalId) {
    const res = await pool.query("select project_id from signals where id = $1", [input.signalId]);
    const row = res.rows[0] as { project_id: string } | undefined;
    if (!row || row.project_id !== projectId) {
      return { kind: "invalid_signal_reference" };
    }
  }

  const proposalId = `prp_${randomUUID().replaceAll("-", "")}`;
  await pool.query(
    `insert into proposals (id, project_id, org_id, workspace_id, signal_id, title, summary,
                             why_now, cost_of_inaction, proposal_type, alternatives,
                             recommended_alternative_id, impact)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [
      proposalId,
      projectId,
      scope.orgId,
      scope.workspaceId,
      input.signalId ?? null,
      input.title,
      input.summary,
      input.whyNow ?? null,
      input.costOfInaction ?? null,
      input.proposalType,
      JSON.stringify(input.alternatives ?? []),
      input.recommendedAlternativeId ?? null,
      JSON.stringify(input.impact ?? {}),
    ],
  );
  return { kind: "created", proposalId };
}

export interface ProposalRow {
  id: string;
  title: string;
  summary: string;
  status: string;
  proposalType: string;
  alternatives: ProposalAlternativeInput[];
  costOfInaction: string | null;
  challengerFindings: string[];
  createdAt: string;
  readyAt: string | null;
}

function toProposalRow(r: {
  id: string;
  title: string;
  summary: string;
  status: string;
  proposal_type: string;
  alternatives: ProposalAlternativeInput[];
  cost_of_inaction: string | null;
  challenger_findings: string[];
  created_at: string;
  ready_at: string | null;
}): ProposalRow {
  return {
    id: r.id,
    title: r.title,
    summary: r.summary,
    status: r.status,
    proposalType: r.proposal_type,
    alternatives: r.alternatives,
    costOfInaction: r.cost_of_inaction,
    challengerFindings: r.challenger_findings,
    createdAt: r.created_at,
    readyAt: r.ready_at,
  };
}

export async function getProposal(pool: DbPool, projectId: string, proposalId: string): Promise<ProposalRow | null> {
  const res = await pool.query(
    `select id, title, summary, status, proposal_type, alternatives, cost_of_inaction,
            challenger_findings, created_at, ready_at
       from proposals where id = $1 and project_id = $2`,
    [proposalId, projectId],
  );
  const row = res.rows[0];
  return row ? toProposalRow(row) : null;
}

export async function listProposals(
  pool: DbPool,
  projectId: string,
  status?: string,
): Promise<ProposalRow[]> {
  const res = status
    ? await pool.query(
        `select id, title, summary, status, proposal_type, alternatives, cost_of_inaction,
                challenger_findings, created_at, ready_at
           from proposals where project_id = $1 and status = $2 order by created_at desc`,
        [projectId, status],
      )
    : await pool.query(
        `select id, title, summary, status, proposal_type, alternatives, cost_of_inaction,
                challenger_findings, created_at, ready_at
           from proposals where project_id = $1 order by created_at desc`,
        [projectId],
      );
  return res.rows.map(toProposalRow);
}
