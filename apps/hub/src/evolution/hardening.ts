import type { DbPool } from "../platform/db.js";
import type { AuthScope } from "../identity/session.js";

export interface NodeFleetRow {
  id: string;
  name: string;
  enrolledAt: string;
  revokedAt: string | null;
}

/** HARD-02: lista a frota do org com status exato de revogação. */
export async function listNodeFleet(pool: DbPool, orgId: string): Promise<NodeFleetRow[]> {
  const rows = await pool.query(
    `select id, name, enrolled_at as "enrolledAt", revoked_at as "revokedAt"
       from node_agents where org_id = $1 order by enrolled_at`,
    [orgId],
  );
  return rows.rows as NodeFleetRow[];
}

export type RevokeNodeOutcome = { kind: "revoked" } | { kind: "not_found" };

/**
 * HARD-01/03/04: kill switch - escreve `revoked_at`, o campo que
 * `authenticateNode` (Slice 2) já lê para negar autenticação sem nenhuma
 * alteração naquele código. Idempotente: revogar de novo não é erro.
 */
export async function revokeNode(pool: DbPool, scope: AuthScope, nodeId: string): Promise<RevokeNodeOutcome> {
  const existing = await pool.query("select org_id from node_agents where id = $1", [nodeId]);
  const row = existing.rows[0] as { org_id: string } | undefined;
  if (!row || row.org_id !== scope.orgId) return { kind: "not_found" };

  await pool.query(
    "update node_agents set revoked_at = coalesce(revoked_at, now()) where id = $1",
    [nodeId],
  );
  return { kind: "revoked" };
}

export type SetRetentionOutcome = { kind: "set" } | { kind: "invalid_window" };

/** HARD-12/13: janela de retenção de evidência, 1 política por org (Assumption confirmada). */
export async function setRetentionPolicy(
  pool: DbPool,
  orgId: string,
  evidenceRetentionDays: unknown,
): Promise<SetRetentionOutcome> {
  if (
    typeof evidenceRetentionDays !== "number" ||
    !Number.isInteger(evidenceRetentionDays) ||
    evidenceRetentionDays <= 0
  ) {
    return { kind: "invalid_window" };
  }
  await pool.query(
    `insert into org_retention_policies (org_id, evidence_retention_days, updated_at)
     values ($1, $2, now())
     on conflict (org_id) do update set evidence_retention_days = excluded.evidence_retention_days, updated_at = now()`,
    [orgId, evidenceRetentionDays],
  );
  return { kind: "set" };
}

export type SweepOutcome = { kind: "swept"; redactedCount: number } | { kind: "not_configured" };

/**
 * HARD-14/15/16/17: redige (nunca deleta) evidência mais antiga que a
 * janela - `content_excerpt = NULL`, `redacted_at` setado; `content_digest`
 * permanece, então qualquer decision/claim que referencia a evidência via
 * `claim_evidence`/`subject_id` continua íntegra sem nenhuma alteração
 * própria (o sweep nunca toca outra tabela).
 */
export async function sweepEvidenceRetention(pool: DbPool, orgId: string): Promise<SweepOutcome> {
  const policy = await pool.query(
    "select evidence_retention_days as days from org_retention_policies where org_id = $1",
    [orgId],
  );
  const row = policy.rows[0] as { days: number } | undefined;
  if (!row) return { kind: "not_configured" };

  const result = await pool.query(
    `update evidence
        set content_excerpt = null, redacted_at = now()
      where org_id = $1
        and redacted_at is null
        and created_at < now() - make_interval(days => $2)`,
    [orgId, row.days],
  );
  return { kind: "swept", redactedCount: result.rowCount ?? 0 };
}
