import { randomUUID } from "node:crypto";
import { withTx, type DbPool } from "../platform/db.js";
import type { AuthScope } from "../identity/session.js";

export interface CandidateRow {
  id: string;
  snapshotId: string;
  kind: string;
  location: string;
  payload: Record<string, unknown>;
  status: string;
  reason: string | null;
  confirmedEntityId: string | null;
}

export async function listCandidates(pool: DbPool, projectId: string): Promise<CandidateRow[]> {
  const res = await pool.query(
    `select id, snapshot_id as "snapshotId", kind, location, payload, status, reason,
            confirmed_entity_id as "confirmedEntityId"
       from candidates where project_id = $1 order by created_at`,
    [projectId],
  );
  return res.rows as CandidateRow[];
}

export type DecideOutcome =
  | { kind: "decided"; candidate: CandidateRow }
  | { kind: "not_found" }
  | { kind: "not_pending" };

/**
 * TWIN-10: confirmar promove o candidate a `declared` — gravado como
 * `artifacts` `type='component'` (reuso do Slice 1, ver design.md) —
 * preservando o registro `inferred` original sem alteração além do status.
 */
export async function confirmCandidate(
  pool: DbPool,
  scope: AuthScope,
  projectId: string,
  candidateId: string,
): Promise<DecideOutcome> {
  return withTx(pool, async (client) => {
    const found = await client.query(
      "select id, kind, location, payload, status from candidates where id = $1 and project_id = $2 for update",
      [candidateId, projectId],
    );
    const row = found.rows[0] as
      | { id: string; kind: string; location: string; payload: Record<string, unknown>; status: string }
      | undefined;
    if (!row) return { kind: "not_found" };
    if (row.status !== "pending") return { kind: "not_pending" };

    let confirmedEntityId: string | null = null;
    if (row.kind === "component") {
      confirmedEntityId = `art_${randomUUID().replaceAll("-", "")}`;
      const name = String((row.payload as { name?: string }).name ?? row.location);
      await client.query(
        `insert into artifacts (id, project_id, org_id, workspace_id, type, title, current_version)
         values ($1, $2, $3, $4, 'component', $5, 1)`,
        [confirmedEntityId, projectId, scope.orgId, scope.workspaceId, name],
      );
      await client.query(
        `insert into artifact_versions (artifact_id, version, reference, content)
         values ($1, 1, $2, null)`,
        [confirmedEntityId, row.location],
      );
    }

    const updated = await client.query(
      `update candidates set status = 'confirmed', confirmed_entity_id = $2, decided_at = now()
        where id = $1
        returning id, snapshot_id as "snapshotId", kind, location, payload, status, reason,
                  confirmed_entity_id as "confirmedEntityId"`,
      [candidateId, confirmedEntityId],
    );
    return { kind: "decided", candidate: updated.rows[0] as CandidateRow };
  });
}

/** TWIN-11: rejeitar preserva o registro (nunca deleta) — guard do AGENTS.md. */
export async function rejectCandidate(
  pool: DbPool,
  projectId: string,
  candidateId: string,
  reason?: string,
): Promise<DecideOutcome> {
  return withTx(pool, async (client) => {
    const found = await client.query(
      "select status from candidates where id = $1 and project_id = $2 for update",
      [candidateId, projectId],
    );
    const row = found.rows[0] as { status: string } | undefined;
    if (!row) return { kind: "not_found" };
    if (row.status !== "pending") return { kind: "not_pending" };

    const updated = await client.query(
      `update candidates set status = 'rejected', reason = $2, decided_at = now()
        where id = $1
        returning id, snapshot_id as "snapshotId", kind, location, payload, status, reason,
                  confirmed_entity_id as "confirmedEntityId"`,
      [candidateId, reason ?? null],
    );
    return { kind: "decided", candidate: updated.rows[0] as CandidateRow };
  });
}
