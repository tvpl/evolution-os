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
