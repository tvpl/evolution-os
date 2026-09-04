import { createHash, randomUUID } from "node:crypto";
import { withTx, type DbPool } from "../platform/db.js";
import type { AuthScope } from "../identity/session.js";
import { canonicalJson } from "../platform/canonical-json.js";
import { recordDecision, type DecisionRow } from "../idea-memory/decisions.js";

export interface Variant {
  id: string;
  name: string;
  description?: string;
}

export interface VerificationPlan {
  hypothesis: string;
  baselineMetric: string;
  threshold: number;
  comparison: "gte" | "lte";
  observationWindow: string;
}

export interface StartExperimentInput {
  variants: Variant[];
  verificationPlan: VerificationPlan;
  environment?: Record<string, unknown>;
}

export type StartExperimentOutcome =
  | { kind: "started"; experimentId: string; digest: string }
  | { kind: "not_found" }
  | { kind: "invalid_transition" };

export interface ProposalMaterialFields {
  title: string;
  summary: string;
  whyNow: string | null;
  costOfInaction: string | null;
  proposalType: string;
  alternatives: unknown;
  recommendedAlternativeId: string | null;
}

/** EXP-01 (proposal spec §5): o digest prova o que estava de fato persistido
 * no momento da decisão, não o que o cliente alega — por isso é computado
 * lendo a proposal do banco, nunca a partir do payload da requisição. */
export function computeProposalDigest(fields: ProposalMaterialFields): string {
  return `sha256:${createHash("sha256").update(canonicalJson(fields)).digest("hex")}`;
}

/**
 * EXP-01/04: só inicia a partir de uma proposal `readyForReview`; grava o
 * digest e transiciona a proposal para `executing` na mesma transação.
 */
export async function startExperiment(
  pool: DbPool,
  scope: AuthScope,
  projectId: string,
  proposalId: string,
  input: StartExperimentInput,
): Promise<StartExperimentOutcome> {
  return withTx(pool, async (client) => {
    const res = await client.query(
      `select status, title, summary, why_now as "whyNow", cost_of_inaction as "costOfInaction",
              proposal_type as "proposalType", alternatives, recommended_alternative_id as "recommendedAlternativeId"
         from proposals where id = $1 and project_id = $2`,
      [proposalId, projectId],
    );
    const row = res.rows[0] as (ProposalMaterialFields & { status: string }) | undefined;
    if (!row) return { kind: "not_found" };
    if (row.status !== "readyForReview") return { kind: "invalid_transition" };

    const digest = computeProposalDigest({
      title: row.title,
      summary: row.summary,
      whyNow: row.whyNow,
      costOfInaction: row.costOfInaction,
      proposalType: row.proposalType,
      alternatives: row.alternatives,
      recommendedAlternativeId: row.recommendedAlternativeId,
    });

    const experimentId = `xpr_${randomUUID().replaceAll("-", "")}`;
    await client.query(
      `insert into experiments (id, project_id, org_id, workspace_id, proposal_id, proposal_digest,
                                 variants, verification_plan, environment)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        experimentId,
        projectId,
        scope.orgId,
        scope.workspaceId,
        proposalId,
        digest,
        JSON.stringify(input.variants),
        JSON.stringify(input.verificationPlan),
        JSON.stringify(input.environment ?? {}),
      ],
    );
    await client.query("update proposals set status = 'executing' where id = $1", [proposalId]);

    return { kind: "started", experimentId, digest };
  });
}

export interface ExperimentRow {
  id: string;
  proposalId: string;
  proposalDigest: string;
  variants: Variant[];
  verificationPlan: VerificationPlan;
  environment: Record<string, unknown>;
  status: string;
  observedValue: number | null;
  verdict: string | null;
  verdictRationale: string | null;
  createdAt: string;
  evaluatedAt: string | null;
  closedAt: string | null;
}

export type AttachArtifactOutcome =
  | { kind: "attached" }
  | { kind: "not_found" }
  | { kind: "invalid_transition" }
  | { kind: "invalid_artifact_reference" };

/**
 * EXP-05/06: só anexa a um experimento `running`; exige que o artifact
 * pertença ao mesmo projeto; idempotente — anexar duas vezes não duplica
 * (mesmo padrão `ON CONFLICT DO NOTHING` do dedup de signals no Slice 3).
 */
export async function attachProofArtifact(
  pool: DbPool,
  projectId: string,
  experimentId: string,
  artifactId: string,
): Promise<AttachArtifactOutcome> {
  const expRes = await pool.query("select status from experiments where id = $1 and project_id = $2", [
    experimentId,
    projectId,
  ]);
  const expRow = expRes.rows[0] as { status: string } | undefined;
  if (!expRow) return { kind: "not_found" };
  if (expRow.status !== "running") return { kind: "invalid_transition" };

  const artRes = await pool.query("select project_id from artifacts where id = $1", [artifactId]);
  const artRow = artRes.rows[0] as { project_id: string } | undefined;
  if (!artRow || artRow.project_id !== projectId) return { kind: "invalid_artifact_reference" };

  await pool.query(
    "insert into experiment_artifacts (experiment_id, artifact_id) values ($1, $2) on conflict do nothing",
    [experimentId, artifactId],
  );
  return { kind: "attached" };
}

export interface ProofArtifactRow {
  id: string;
  type: string;
  title: string;
}

export async function listProofArtifacts(pool: DbPool, experimentId: string): Promise<ProofArtifactRow[]> {
  const res = await pool.query(
    `select a.id, a.type, a.title
       from experiment_artifacts ea
       join artifacts a on a.id = ea.artifact_id
      where ea.experiment_id = $1
      order by a.created_at`,
    [experimentId],
  );
  return res.rows as ProofArtifactRow[];
}

export interface EvaluationResult {
  verdict: "hypothesis_met" | "hypothesis_not_met" | "inconclusive";
  rationale: string;
}

/**
 * EXP-08/09/10: função pura, sem I/O — mesmo espírito do `analysis-provider.ts`
 * (Slice 3). `observedValue === null` é "não sei ainda" (EVO-FR-004,
 * `insufficient_context`), distinto de omitir o campo (rejeitado 422 na rota,
 * antes de chegar aqui).
 */
export function evaluateExperiment(plan: VerificationPlan, observedValue: number | null): EvaluationResult {
  if (observedValue === null) {
    return { verdict: "inconclusive", rationale: "observed metric was explicitly marked unavailable" };
  }
  const met = plan.comparison === "gte" ? observedValue >= plan.threshold : observedValue <= plan.threshold;
  return {
    verdict: met ? "hypothesis_met" : "hypothesis_not_met",
    rationale: `observed ${observedValue} ${plan.comparison} threshold ${plan.threshold}: ${
      met ? "condition met" : "condition not met"
    }`,
  };
}

export type SubmitEvaluationOutcome =
  | { kind: "evaluated"; verdict: string; rationale: string }
  | { kind: "not_found" }
  | { kind: "invalid_transition" };

/** EXP-08/09/10/12: só avalia um experimento `running`; grava veredito +
 * rationale e transiciona para `evaluated` na mesma operação. */
export async function submitEvaluation(
  pool: DbPool,
  projectId: string,
  experimentId: string,
  observedValue: number | null,
): Promise<SubmitEvaluationOutcome> {
  const res = await pool.query(
    `select status, verification_plan as "verificationPlan" from experiments where id = $1 and project_id = $2`,
    [experimentId, projectId],
  );
  const row = res.rows[0] as { status: string; verificationPlan: VerificationPlan } | undefined;
  if (!row) return { kind: "not_found" };
  if (row.status !== "running") return { kind: "invalid_transition" };

  const { verdict, rationale } = evaluateExperiment(row.verificationPlan, observedValue);
  await pool.query(
    `update experiments
        set status = 'evaluated', observed_value = $2, verdict = $3, verdict_rationale = $4, evaluated_at = now()
      where id = $1`,
    [experimentId, JSON.stringify(observedValue), verdict, rationale],
  );
  return { kind: "evaluated", verdict, rationale };
}

export type CloseExperimentOutcome =
  | { kind: "closed"; decision: DecisionRow; priorRelatedDecisions: DecisionRow[] }
  | { kind: "not_found" }
  | { kind: "invalid_transition" };

/**
 * EXP-13/14/15: só fecha um experimento `evaluated` (proposal spec §5:
 * "verification criteria fixed before result"); grava a decisão de outcome
 * via o mesmo mecanismo genérico de `decisions` (Slice 1/3, `subjectType=
 * 'proposal'`) sem nenhuma alteração nele; fecha experimento e proposal.
 */
export async function closeExperiment(
  pool: DbPool,
  scope: AuthScope,
  projectId: string,
  experimentId: string,
  input: { decision: string; rationale: string },
): Promise<CloseExperimentOutcome> {
  const res = await pool.query(
    `select status, proposal_id as "proposalId" from experiments where id = $1 and project_id = $2`,
    [experimentId, projectId],
  );
  const row = res.rows[0] as { status: string; proposalId: string } | undefined;
  if (!row) return { kind: "not_found" };
  if (row.status !== "evaluated") return { kind: "invalid_transition" };

  const decisionOutcome = await recordDecision(pool, scope, projectId, {
    decision: input.decision,
    rationale: input.rationale,
    subjectType: "proposal",
    subjectId: row.proposalId,
  });
  if (decisionOutcome.kind === "invalid_subject") {
    return { kind: "not_found" };
  }

  await pool.query("update experiments set status = 'closed', closed_at = now() where id = $1", [experimentId]);
  await pool.query("update proposals set status = 'closed' where id = $1", [row.proposalId]);

  return {
    kind: "closed",
    decision: decisionOutcome.decision,
    priorRelatedDecisions: decisionOutcome.priorRelatedDecisions,
  };
}

export async function getExperiment(
  pool: DbPool,
  projectId: string,
  experimentId: string,
): Promise<ExperimentRow | null> {
  const res = await pool.query(
    `select id, proposal_id as "proposalId", proposal_digest as "proposalDigest", variants,
            verification_plan as "verificationPlan", environment, status, observed_value as "observedValue",
            verdict, verdict_rationale as "verdictRationale", created_at as "createdAt",
            evaluated_at as "evaluatedAt", closed_at as "closedAt"
       from experiments where id = $1 and project_id = $2`,
    [experimentId, projectId],
  );
  return (res.rows[0] as ExperimentRow | undefined) ?? null;
}
