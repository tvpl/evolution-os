import type { DbPool } from "../platform/db.js";
import { getLatestSnapshot } from "./snapshots.js";

export interface DiffMismatch {
  field: string;
  declared: string;
  observed: string;
}

export interface DiffResult {
  observed: { snapshotId: string; snapshotVersion: string } | null;
  mismatches: DiffMismatch[];
}

const SINGLE_UNIT_TYPES = new Set(["idea", "product", "system", "service", "repository"]);

/**
 * TWIN-14/15/16: compara `type`/manifests declarados (`projects`) com o
 * snapshot observado mais recente — NUNCA altera o declarado, só reporta.
 */
export async function computeDiff(pool: DbPool, projectId: string): Promise<DiffResult | null> {
  const project = await pool.query("select type, name from projects where id = $1", [projectId]);
  const row = project.rows[0] as { type: string; name: string } | undefined;
  if (!row) return null;

  const snapshot = await getLatestSnapshot(pool, projectId);
  if (!snapshot) {
    return { observed: null, mismatches: [] };
  }

  const mismatches: DiffMismatch[] = [];
  if (snapshot.manifests.length > 1 && SINGLE_UNIT_TYPES.has(row.type)) {
    mismatches.push({
      field: "type",
      declared: row.type,
      observed: `monorepo with ${snapshot.manifests.length} components`,
    });
  }
  if (snapshot.manifests.length === 1) {
    const [manifest] = snapshot.manifests;
    if (manifest?.name && manifest.name !== row.name) {
      mismatches.push({ field: "name", declared: row.name, observed: manifest.name });
    }
  }

  return {
    observed: { snapshotId: snapshot.id, snapshotVersion: snapshot.observedAt },
    mismatches,
  };
}
