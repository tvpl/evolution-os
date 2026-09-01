import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { withTx, type DbPool } from "../platform/db.js";
import type { AuthScope } from "../identity/session.js";
import { canonicalJson } from "../platform/canonical-json.js";
import { canonicalDigest } from "../registry/registry.js";
import { createArtifact } from "../idea-memory/artifacts.js";
import { attachProofArtifact } from "./experiments.js";

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

export interface CreateActionInput {
  connectionId: string;
  actionType: "issue" | "branch" | "draftPr";
  title: string;
  proposalId?: string;
  experimentId?: string;
  idempotencyKey: string;
}

export type CreateActionOutcome =
  | { kind: "created"; actionId: string; externalRef: string }
  | { kind: "replayed"; actionId: string; externalRef: string }
  | { kind: "conflict" }
  | { kind: "invalid_connection_reference" };

interface StoredActionResponse {
  actionId: string;
  externalRef: string;
}

function mockExternalRef(actionType: string, connectionId: string, actionId: string): string {
  const kind = actionType === "issue" ? "issues" : actionType === "branch" ? "branches" : "pulls";
  return `mock://github/${connectionId}/${kind}/${actionId}`;
}

/**
 * GH-07/09/10/11: adapter determinístico (mock) atrás de uma interface —
 * trocar por chamadas reais ao GitHub é extensão local quando a infra
 * existir (ver spec Out of Scope, mesmo padrão do `AnalysisProvider` do
 * Slice 3). Idempotência reusa `idempotency_keys`/`canonicalDigest` do
 * Slice 0 tal como estão — mesma transação, mesmo lock `for update`, mesmo
 * contrato replayed/conflict de `registerProject`.
 */
export async function createGitHubAction(
  pool: DbPool,
  scope: AuthScope,
  projectId: string,
  input: CreateActionInput,
): Promise<CreateActionOutcome> {
  const digest = canonicalDigest({
    connectionId: input.connectionId,
    actionType: input.actionType,
    title: input.title,
    proposalId: input.proposalId ?? null,
    experimentId: input.experimentId ?? null,
  });

  return withTx(pool, async (client) => {
    const existing = await client.query(
      "select request_digest, response from idempotency_keys where org_id = $1 and key = $2 for update",
      [scope.orgId, input.idempotencyKey],
    );
    const row = existing.rows[0] as
      | { request_digest: string; response: StoredActionResponse | null }
      | undefined;
    if (row) {
      if (row.request_digest === digest && row.response) {
        return { kind: "replayed", ...row.response };
      }
      return { kind: "conflict" };
    }

    const connRes = await client.query(
      "select id from github_connections where id = $1 and project_id = $2",
      [input.connectionId, projectId],
    );
    if (!connRes.rowCount) return { kind: "invalid_connection_reference" };

    const actionId = `gha_${randomUUID().replaceAll("-", "")}`;
    const externalRef = mockExternalRef(input.actionType, input.connectionId, actionId);
    await client.query(
      `insert into github_actions (id, project_id, org_id, workspace_id, connection_id, action_type,
                                    proposal_id, experiment_id, title, external_ref)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        actionId,
        projectId,
        scope.orgId,
        scope.workspaceId,
        input.connectionId,
        input.actionType,
        input.proposalId ?? null,
        input.experimentId ?? null,
        input.title,
        externalRef,
      ],
    );
    const response: StoredActionResponse = { actionId, externalRef };
    await client.query(
      "insert into idempotency_keys (org_id, key, request_digest, response) values ($1, $2, $3, $4)",
      [scope.orgId, input.idempotencyKey, digest, response],
    );
    return { kind: "created", actionId, externalRef };
  });
}

export interface RecordCiStatusInput {
  context: string;
  state: string;
  targetUrl?: string;
}

export type RecordCiStatusOutcome =
  | { kind: "recorded"; artifactAttached: boolean }
  | { kind: "not_found" };

/**
 * GH-12/13/14: grava o status vinculado à ação; quando a ação referencia um
 * experimento, cria+anexa um proof artifact automaticamente reusando
 * `createArtifact` (Slice 1) e `attachProofArtifact` (Slice 4) sem alteração
 * nenhuma. Se o experimento não estiver mais `running` (ex. já avaliado ou
 * fechado — CI pode demorar mais que o experimento), o anexo é pulado sem
 * erro: o status de CI em si sempre é gravado, o anexo automático é
 * best-effort.
 */
export async function recordCiStatus(
  pool: DbPool,
  scope: AuthScope,
  projectId: string,
  actionId: string,
  input: RecordCiStatusInput,
): Promise<RecordCiStatusOutcome> {
  const actionRes = await pool.query(
    `select experiment_id as "experimentId" from github_actions where id = $1 and project_id = $2`,
    [actionId, projectId],
  );
  const actionRow = actionRes.rows[0] as { experimentId: string | null } | undefined;
  if (!actionRow) return { kind: "not_found" };

  const statusId = `gcs_${randomUUID().replaceAll("-", "")}`;
  await pool.query(
    `insert into github_action_ci_statuses (id, action_id, context, state, target_url)
     values ($1, $2, $3, $4, $5)`,
    [statusId, actionId, input.context, input.state, input.targetUrl ?? null],
  );

  let artifactAttached = false;
  if (actionRow.experimentId) {
    const artifactOutcome = await createArtifact(pool, scope, projectId, {
      type: "ci_status",
      title: `CI: ${input.context} — ${input.state}`,
      content: JSON.stringify({ context: input.context, state: input.state, targetUrl: input.targetUrl ?? null }),
    });
    if (artifactOutcome.kind === "created") {
      const attachOutcome = await attachProofArtifact(
        pool,
        projectId,
        actionRow.experimentId,
        artifactOutcome.artifactId,
      );
      artifactAttached = attachOutcome.kind === "attached";
    }
  }

  return { kind: "recorded", artifactAttached };
}
