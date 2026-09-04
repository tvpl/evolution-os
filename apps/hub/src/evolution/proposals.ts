import { randomUUID } from "node:crypto";
import type { DbPool } from "../platform/db.js";
import type { AuthScope } from "../identity/session.js";
import { challenge, type ClaimForChallenge } from "./analysis-provider.js";

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

export interface PriorRejectedDecision {
  id: string;
  decision: string;
  rationale: string;
  subjectId: string;
  decidedAt: string;
}

export type CreateProposalOutcome =
  | { kind: "created"; proposalId: string; priorRelatedDecisions: PriorRejectedDecision[] }
  | { kind: "requires_evidence" }
  | { kind: "invalid_signal_reference" };

/**
 * FLOW-12/15 (proposal spec §5 invariant): uma proposta material precisa de
 * claim com lastro em evidência (via `signalId`, que já exige uma claim
 * válida) OU de um `investigationState` explícito — nunca as duas coisas
 * ausentes ao mesmo tempo.
 *
 * FLOW-18: quando a proposal nasce de um `signalId`, outras propostas do
 * MESMO signal já rejeitadas são surfaced como `priorRelatedDecisions` —
 * visibilidade, nunca bloqueio (o guard de rejeição não reaparece
 * silenciosamente, agora também no momento da criação, não só numa nova
 * decisão sobre o mesmo subject como o FLOW-17 já cobre).
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

  const priorRelatedDecisions = input.signalId
    ? await findPriorRejectedDecisionsForSignal(pool, projectId, input.signalId)
    : [];

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
  return { kind: "created", proposalId, priorRelatedDecisions };
}

async function findPriorRejectedDecisionsForSignal(
  pool: DbPool,
  projectId: string,
  signalId: string,
): Promise<PriorRejectedDecision[]> {
  const res = await pool.query(
    `select d.id, d.decision, d.rationale, d.subject_id as "subjectId", d.decided_at as "decidedAt"
       from decisions d
       join proposals p on p.id = d.subject_id
      where d.subject_type = 'proposal'
        and d.decision = 'reject'
        and p.project_id = $1
        and p.signal_id = $2
      order by d.decided_at desc`,
    [projectId, signalId],
  );
  return res.rows as PriorRejectedDecision[];
}

export type ReadyOutcome =
  | { kind: "ready"; findings: string[] }
  | { kind: "not_found" }
  | { kind: "invalid_transition" };

/**
 * FLOW-13/14: roda o Challenger determinístico (T4) contra a única claim
 * ligada via `signal_id` (ou nenhuma, se a proposal veio de
 * `investigationState`) e grava `challenger_findings` + `status` na MESMA
 * operação. O Challenger nunca bloqueia a transição — no máximo anexa
 * findings junto do novo status (EVO-FR-009).
 */
export async function moveProposalToReady(
  pool: DbPool,
  projectId: string,
  proposalId: string,
): Promise<ReadyOutcome> {
  const res = await pool.query(
    `select status, signal_id as "signalId", cost_of_inaction as "costOfInaction", alternatives
       from proposals where id = $1 and project_id = $2`,
    [proposalId, projectId],
  );
  const row = res.rows[0] as
    | { status: string; signalId: string | null; costOfInaction: string | null; alternatives: ProposalAlternativeInput[] }
    | undefined;
  if (!row) return { kind: "not_found" };
  if (row.status !== "draft") return { kind: "invalid_transition" };

  let claims: ClaimForChallenge[] = [];
  if (row.signalId) {
    const claimRes = await pool.query(
      `select c.id, c.epistemic_type as "epistemicType",
              coalesce(array_agg(ce.evidence_id) filter (where ce.evidence_id is not null), '{}') as "evidenceIds"
         from signals s
         join claims c on c.id = s.claim_id
         left join claim_evidence ce on ce.claim_id = c.id
        where s.id = $1
        group by c.id, c.epistemic_type`,
      [row.signalId],
    );
    claims = claimRes.rows as ClaimForChallenge[];
  }

  const findings = challenge({ costOfInaction: row.costOfInaction, alternatives: row.alternatives }, claims);

  await pool.query(
    `update proposals set status = 'readyForReview', ready_at = now(), challenger_findings = $2
      where id = $1`,
    [proposalId, JSON.stringify(findings)],
  );
  return { kind: "ready", findings };
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
