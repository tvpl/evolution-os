import { randomBytes, randomUUID } from "node:crypto";
import type { DbPool } from "../platform/db.js";
import type { AuthScope } from "../identity/session.js";

export interface ConnectGitHubInput {
  owner: string;
  repo: string;
}

export type ConnectGitHubOutcome =
  | { kind: "connected"; connectionId: string; webhookSecret: string }
  | { kind: "already_connected" };

/**
 * GH-01/02: conectar é um ato de metadado declarado (owner/repo), não um
 * handshake OAuth ao vivo (ver spec Out of Scope). O webhook secret é
 * gerado uma única vez e retornado só nesta resposta.
 */
export async function connectGitHub(
  pool: DbPool,
  scope: AuthScope,
  projectId: string,
  input: ConnectGitHubInput,
): Promise<ConnectGitHubOutcome> {
  const existing = await pool.query(
    "select id from github_connections where project_id = $1 and owner = $2 and repo = $3",
    [projectId, input.owner, input.repo],
  );
  if (existing.rowCount) return { kind: "already_connected" };

  const connectionId = `ghc_${randomUUID().replaceAll("-", "")}`;
  const webhookSecret = randomBytes(32).toString("hex");
  await pool.query(
    `insert into github_connections (id, project_id, org_id, workspace_id, owner, repo, webhook_secret)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [connectionId, projectId, scope.orgId, scope.workspaceId, input.owner, input.repo, webhookSecret],
  );
  return { kind: "connected", connectionId, webhookSecret };
}
