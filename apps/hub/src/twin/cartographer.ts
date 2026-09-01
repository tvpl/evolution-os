import { randomUUID } from "node:crypto";
import type { DbClient } from "../platform/db.js";
import type { AuthScope } from "../identity/session.js";

export interface ManifestEntry {
  ecosystem: string;
  location: string;
  name: string | null;
}

export interface ProposedCandidate {
  id: string;
  kind: "component" | "contains";
  location: string;
  payload: Record<string, unknown>;
}

/**
 * TWIN-06/08: regras fixas, sem LLM (ver spec Out of Scope) — >1 manifest no
 * snapshot propõe 1 `component` + 1 `contains` por manifest; um único
 * manifest coerente com o tipo já declarado não propõe nada.
 */
export function proposeFromSnapshot(manifests: ManifestEntry[]): ProposedCandidate[] {
  if (manifests.length <= 1) return [];
  const proposals: ProposedCandidate[] = [];
  for (const manifest of manifests) {
    proposals.push({
      id: `cand_${randomUUID().replaceAll("-", "")}`,
      kind: "component",
      location: manifest.location,
      payload: { ecosystem: manifest.ecosystem, name: manifest.name },
    });
    proposals.push({
      id: `cand_${randomUUID().replaceAll("-", "")}`,
      kind: "contains",
      location: manifest.location,
      payload: { ecosystem: manifest.ecosystem, name: manifest.name },
    });
  }
  return proposals;
}

/** Stringify com chaves ordenadas — jsonb do Postgres NÃO preserva a ordem de inserção. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    );
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function payloadEquals(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  return canonicalJson(a) === canonicalJson(b);
}

/**
 * TWIN-09/13: NUNCA cria duplicata pendente para a mesma `location`+`kind`
 * enquanto existir um candidate `pending` OU `confirmed` ali (confirmado já
 * virou fato declarado — reabrir como inferred de novo seria regressão, não
 * está pedido por nenhum AC). Um `rejected` só é reproposto quando o payload
 * mudou — payload igual é a MESMA evidência já recusada (TWIN-13).
 */
export async function insertCandidates(
  client: DbClient,
  projectId: string,
  scope: AuthScope,
  snapshotId: string,
  proposals: ProposedCandidate[],
): Promise<number> {
  let inserted = 0;
  for (const proposal of proposals) {
    const existing = await client.query(
      `select status, payload from candidates
        where project_id = $1 and location = $2 and kind = $3
        order by created_at desc limit 1`,
      [projectId, proposal.location, proposal.kind],
    );
    const row = existing.rows[0] as { status: string; payload: Record<string, unknown> } | undefined;
    if (row) {
      if (row.status === "pending" || row.status === "confirmed") continue;
      if (row.status === "rejected" && payloadEquals(row.payload, proposal.payload)) continue;
    }
    await client.query(
      `insert into candidates (id, project_id, org_id, workspace_id, snapshot_id, kind, location, payload)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        proposal.id,
        projectId,
        scope.orgId,
        scope.workspaceId,
        snapshotId,
        proposal.kind,
        proposal.location,
        proposal.payload,
      ],
    );
    inserted += 1;
  }
  return inserted;
}
