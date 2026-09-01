import { randomUUID } from "node:crypto";
import { withTx, type DbPool } from "../platform/db.js";
import type { AuthScope } from "../identity/session.js";
import { insertCandidates, proposeFromSnapshot, type ManifestEntry } from "./cartographer.js";

export interface SnapshotInput {
  branch: string | null;
  commitSha: string | null;
  manifests: ManifestEntry[];
  languages: Record<string, number>;
}

/**
 * TWIN-01/03/06: grava o snapshot com authority=observed e, na MESMA
 * transação, roda o Cartographer determinístico contra os manifests.
 */
export async function ingestSnapshot(
  pool: DbPool,
  scope: AuthScope,
  projectId: string,
  nodeId: string,
  input: SnapshotInput,
): Promise<{ snapshotId: string; candidatesProposed: number }> {
  const snapshotId = `snp_${randomUUID().replaceAll("-", "")}`;
  const candidatesProposed = await withTx(pool, async (client) => {
    await client.query(
      `insert into snapshots (id, project_id, org_id, workspace_id, node_id, branch, commit_sha,
                              manifests, languages)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        snapshotId,
        projectId,
        scope.orgId,
        scope.workspaceId,
        nodeId,
        input.branch,
        input.commitSha,
        JSON.stringify(input.manifests),
        JSON.stringify(input.languages),
      ],
    );
    const proposals = proposeFromSnapshot(input.manifests);
    return insertCandidates(client, projectId, scope, snapshotId, proposals);
  });
  return { snapshotId, candidatesProposed };
}

export interface SnapshotSummary {
  id: string;
  branch: string | null;
  commitSha: string | null;
  manifests: ManifestEntry[];
  languages: Record<string, number>;
  observedAt: string;
}

export async function listSnapshots(pool: DbPool, projectId: string): Promise<SnapshotSummary[]> {
  const res = await pool.query(
    `select id, branch, commit_sha as "commitSha", manifests, languages,
            observed_at as "observedAt"
       from snapshots where project_id = $1 order by observed_at desc`,
    [projectId],
  );
  return res.rows as SnapshotSummary[];
}

export async function getLatestSnapshot(pool: DbPool, projectId: string): Promise<SnapshotSummary | null> {
  const rows = await listSnapshots(pool, projectId);
  return rows[0] ?? null;
}
