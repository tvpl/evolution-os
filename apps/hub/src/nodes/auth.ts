import { createHash } from "node:crypto";
import type { DbPool } from "../platform/db.js";

export function sha256(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

export interface NodeIdentity {
  orgId: string;
  workspaceId: string;
}

/** TRUST-14: nunca revela se o node existe — token ausente/errado/revogado tudo vira null. */
export async function authenticateNode(
  pool: DbPool,
  nodeId: string,
  tokenHeader: unknown,
): Promise<NodeIdentity | null> {
  const token = typeof tokenHeader === "string" ? tokenHeader : "";
  if (!token) return null;
  const node = await pool.query(
    "select org_id, workspace_id, token_hash, revoked_at from node_agents where id = $1",
    [nodeId],
  );
  const row = node.rows[0] as
    | { org_id: string; workspace_id: string; token_hash: string; revoked_at: Date | null }
    | undefined;
  if (!row || row.token_hash !== sha256(token) || row.revoked_at) return null;
  return { orgId: row.org_id, workspaceId: row.workspace_id };
}
