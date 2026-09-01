import { randomUUID } from "node:crypto";
import type { DbPool } from "../platform/db.js";
import type { AuthScope } from "../identity/session.js";
import { scoreEvidence } from "./analysis-provider.js";

export type LinkSignalOutcome =
  | { kind: "created"; signalId: string; evidenceStrength: string; confidence: string }
  | { kind: "existing"; signalId: string; evidenceStrength: string; confidence: string }
  | { kind: "invalid_claim_reference" };

/**
 * FLOW-09/10/11: computa `evidenceStrength`/`confidence` via `scoreEvidence`
 * (T4) a partir das evidências ligadas à claim; dedup por
 * `(project_id, claim_id)` é garantido no banco (unique index), não só na
 * aplicação — relinkar retorna o signal existente em vez de duplicar.
 */
export async function linkSignal(
  pool: DbPool,
  scope: AuthScope,
  projectId: string,
  claimId: string,
): Promise<LinkSignalOutcome> {
  const claimRes = await pool.query("select project_id from claims where id = $1", [claimId]);
  const claimRow = claimRes.rows[0] as { project_id: string } | undefined;
  if (!claimRow || claimRow.project_id !== projectId) {
    return { kind: "invalid_claim_reference" };
  }

  const existing = await selectSignal(pool, projectId, claimId);
  if (existing) {
    return { kind: "existing", ...existing };
  }

  const evidenceRes = await pool.query(
    `select e.source_authority as "sourceAuthority"
       from claim_evidence ce join evidence e on e.id = ce.evidence_id
      where ce.claim_id = $1`,
    [claimId],
  );
  const { evidenceStrength, confidence } = scoreEvidence(
    evidenceRes.rows as { sourceAuthority: string | null }[],
  );

  const signalId = `sig_${randomUUID().replaceAll("-", "")}`;
  const inserted = await pool.query(
    `insert into signals (id, project_id, org_id, workspace_id, claim_id, evidence_strength, confidence)
     values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (project_id, claim_id) do nothing
     returning id`,
    [signalId, projectId, scope.orgId, scope.workspaceId, claimId, evidenceStrength, confidence],
  );
  if (inserted.rowCount === 0) {
    const race = await selectSignal(pool, projectId, claimId);
    return { kind: "existing", ...(race as { signalId: string; evidenceStrength: string; confidence: string }) };
  }
  return { kind: "created", signalId, evidenceStrength, confidence };
}

async function selectSignal(
  pool: DbPool,
  projectId: string,
  claimId: string,
): Promise<{ signalId: string; evidenceStrength: string; confidence: string } | undefined> {
  const res = await pool.query(
    `select id as "signalId", evidence_strength as "evidenceStrength", confidence
       from signals where project_id = $1 and claim_id = $2`,
    [projectId, claimId],
  );
  return res.rows[0] as { signalId: string; evidenceStrength: string; confidence: string } | undefined;
}

export interface SignalRow {
  id: string;
  claimId: string;
  evidenceStrength: string;
  confidence: string;
  createdAt: string;
}

export async function listSignals(pool: DbPool, projectId: string): Promise<SignalRow[]> {
  const res = await pool.query(
    `select id, claim_id as "claimId", evidence_strength as "evidenceStrength",
            confidence, created_at as "createdAt"
       from signals where project_id = $1 order by created_at`,
    [projectId],
  );
  return res.rows as SignalRow[];
}
