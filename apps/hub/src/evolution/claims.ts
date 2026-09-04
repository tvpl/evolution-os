import { randomUUID } from "node:crypto";
import { withTx, type DbPool } from "../platform/db.js";
import type { AuthScope } from "../identity/session.js";

export interface CreateClaimInput {
  statement: string;
  epistemicType: "fact" | "inference" | "hypothesis";
  evidenceIds: string[];
}

export type CreateClaimOutcome =
  | { kind: "created"; claimId: string }
  | { kind: "invalid"; reason: string }
  | { kind: "evidence_not_active"; evidenceId: string }
  | { kind: "invalid_evidence_reference"; evidenceId: string };

/**
 * FLOW-05/06/07 + edge case: uma claim exige ≥1 evidência ATIVA do MESMO
 * projeto (evidence spec §4/§8) — checado numa única transação para não
 * deixar `claim_evidence` órfão se qualquer verificação falhar.
 */
export async function createClaim(
  pool: DbPool,
  scope: AuthScope,
  projectId: string,
  input: CreateClaimInput,
): Promise<CreateClaimOutcome> {
  if (!input.evidenceIds.length) {
    return { kind: "invalid", reason: "at least one evidenceId is required" };
  }
  return withTx(pool, async (client) => {
    for (const evidenceId of input.evidenceIds) {
      const res = await client.query(
        "select status, project_id from evidence where id = $1",
        [evidenceId],
      );
      const row = res.rows[0] as { status: string; project_id: string } | undefined;
      if (!row || row.project_id !== projectId) {
        return { kind: "invalid_evidence_reference", evidenceId };
      }
      if (row.status !== "active") {
        return { kind: "evidence_not_active", evidenceId };
      }
    }
    const claimId = `clm_${randomUUID().replaceAll("-", "")}`;
    await client.query(
      `insert into claims (id, project_id, org_id, workspace_id, statement, epistemic_type)
       values ($1, $2, $3, $4, $5, $6)`,
      [claimId, projectId, scope.orgId, scope.workspaceId, input.statement, input.epistemicType],
    );
    for (const evidenceId of input.evidenceIds) {
      await client.query("insert into claim_evidence (claim_id, evidence_id) values ($1, $2)", [
        claimId,
        evidenceId,
      ]);
    }
    return { kind: "created", claimId };
  });
}

export interface ClaimRow {
  id: string;
  statement: string;
  epistemicType: string;
  evidenceIds: string[];
}

export async function listClaims(pool: DbPool, projectId: string): Promise<ClaimRow[]> {
  const res = await pool.query(
    `select c.id, c.statement, c.epistemic_type as "epistemicType",
            coalesce(array_agg(ce.evidence_id) filter (where ce.evidence_id is not null), '{}') as "evidenceIds"
       from claims c
       left join claim_evidence ce on ce.claim_id = c.id
      where c.project_id = $1
      group by c.id, c.statement, c.epistemic_type, c.created_at
      order by c.created_at`,
    [projectId],
  );
  return res.rows as ClaimRow[];
}
