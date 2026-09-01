import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { DbPool } from "../platform/db.js";
import type { AuthScope } from "../identity/session.js";
import { canonicalJson } from "../platform/canonical-json.js";

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

export type IngestWebhookOutcome =
  | { kind: "ingested" }
  | { kind: "duplicate" }
  | { kind: "invalid_signature" }
  | { kind: "not_found" };

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * GH-04/05/06: rota deliberadamente sem `requireScope` — um webhook real do
 * GitHub nunca carrega um Bearer token nosso (mesmo espírito do node auth do
 * Slice 2: a credencial é específica do canal, não a sessão de um usuário).
 * A assinatura HMAC-SHA256 é calculada sobre o JSON canônico do corpo já
 * parseado (ver design.md — capturar bytes crus exigiria mudar o content-type
 * parser do Fastify globalmente, fora de alcance deste slice). Dedup por
 * `(connection_id, delivery_id)` via `ON CONFLICT DO NOTHING` — mesmo padrão
 * de dedup idempotente do Slice 3 (signals).
 */
export async function ingestWebhook(
  pool: DbPool,
  projectId: string,
  connectionId: string,
  deliveryId: string,
  signatureHeader: string | undefined,
  payload: unknown,
): Promise<IngestWebhookOutcome> {
  const connRes = await pool.query(
    `select webhook_secret as "webhookSecret" from github_connections where id = $1 and project_id = $2`,
    [connectionId, projectId],
  );
  const connRow = connRes.rows[0] as { webhookSecret: string } | undefined;
  if (!connRow) return { kind: "not_found" };

  const expectedSignature = `sha256=${createHmac("sha256", connRow.webhookSecret)
    .update(canonicalJson(payload))
    .digest("hex")}`;
  if (!signatureHeader || !safeEqual(signatureHeader, expectedSignature)) {
    return { kind: "invalid_signature" };
  }

  const eventId = `ghe_${randomUUID().replaceAll("-", "")}`;
  const inserted = await pool.query(
    `insert into github_webhook_events (id, connection_id, delivery_id, payload)
     values ($1, $2, $3, $4)
     on conflict (connection_id, delivery_id) do nothing
     returning id`,
    [eventId, connectionId, deliveryId, JSON.stringify(payload)],
  );
  if (inserted.rowCount === 0) {
    return { kind: "duplicate" };
  }
  await pool.query("update github_connections set last_event_at = now() where id = $1", [connectionId]);
  return { kind: "ingested" };
}
