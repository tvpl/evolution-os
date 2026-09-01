import { createHash, randomUUID } from "node:crypto";
import { EVENT_TYPES, validateEvent, validateProject, type EventEnvelope } from "@evolution-os/contracts";
import { withTx, type DbPool } from "../platform/db.js";
import type { AuthScope } from "../identity/session.js";
import {
  DuplicateHypothesisIdError,
  insertHypotheses,
  type HypothesisInput,
} from "../idea-memory/hypotheses.js";
import { insertConstraints, type ConstraintInput } from "../idea-memory/constraints.js";

/** JSON canônico (chaves ordenadas em profundidade) para digest estável. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function canonicalDigest(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
}

export interface RegisterInput {
  manifest: Record<string, unknown>;
  idempotencyKey: string;
  correlationId: string;
  traceparent?: string;
}

export type RegisterOutcome =
  | { kind: "created"; projectId: string; version: number }
  | { kind: "replayed"; projectId: string; version: number }
  | { kind: "conflict" }
  | { kind: "invalid"; errors: string[] }
  | { kind: "duplicate_hypothesis"; hypothesisId: string };

interface StoredResponse {
  projectId: string;
  version: number;
}

/**
 * TRUST-01/03/04/05: valida o manifest pelo schema v0, aplica idempotência por
 * (org, key, digest canônico) e grava projeto + evento CloudEvents no outbox na
 * MESMA transação. O envelope é validado contra o schema de evento antes do
 * insert — um envelope inválido aborta a transação inteira.
 */
export async function registerProject(
  pool: DbPool,
  scope: AuthScope,
  input: RegisterInput,
): Promise<RegisterOutcome> {
  const validation = validateProject(input.manifest);
  if (!validation.ok) {
    return { kind: "invalid", errors: validation.errors };
  }
  const digest = canonicalDigest(input.manifest);

  try {
    return await withTx(pool, async (client) => {
    const existing = await client.query(
      "select request_digest, response from idempotency_keys where org_id = $1 and key = $2 for update",
      [scope.orgId, input.idempotencyKey],
    );
    const row = existing.rows[0] as
      | { request_digest: string; response: StoredResponse | null }
      | undefined;
    if (row) {
      if (row.request_digest === digest && row.response) {
        return { kind: "replayed", ...row.response };
      }
      return { kind: "conflict" };
    }

    const metadata = input.manifest["metadata"] as Record<string, unknown>;
    const projectId = `prj_${randomUUID().replaceAll("-", "")}`;
    await client.query(
      `insert into projects (id, org_id, workspace_id, type, name, manifest, created_by)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [
        projectId,
        scope.orgId,
        scope.workspaceId,
        String(metadata["type"]),
        String(metadata["name"]),
        input.manifest,
        scope.userId,
      ],
    );

    const hypotheses = (input.manifest["spec"] as Record<string, unknown> | undefined)?.[
      "hypotheses"
    ] as HypothesisInput[] | undefined;
    if (hypotheses?.length) {
      await insertHypotheses(client, projectId, scope, hypotheses);
    }

    const constraints = (input.manifest["spec"] as Record<string, unknown> | undefined)?.[
      "constraints"
    ] as ConstraintInput[] | undefined;
    if (constraints?.length) {
      await insertConstraints(client, projectId, scope, constraints);
    }

    const envelope: EventEnvelope = {
      specversion: "1.0",
      id: `evt_${randomUUID().replaceAll("-", "")}`,
      source: "urn:evolutionos:hub",
      type: EVENT_TYPES.PROJECT_REGISTERED,
      subject: `projects/${projectId}`,
      time: new Date().toISOString(),
      datacontenttype: "application/json",
      data: {
        projectId,
        name: String(metadata["name"]),
        slug: String(metadata["slug"]),
        type: String(metadata["type"]),
        manifestDigest: digest,
      },
      tenantid: scope.orgId,
      workspaceid: scope.workspaceId,
      projectid: projectId,
      correlationid: input.correlationId,
      classification: "internal",
      schemaversion: "1",
      idempotencykey: input.idempotencyKey,
    };
    const envelopeCheck = validateEvent(envelope);
    if (!envelopeCheck.ok) {
      throw new Error(`event envelope violates contract: ${envelopeCheck.errors.join("; ")}`);
    }
    await client.query(
      `insert into outbox (event_id, type, subject, tenant_id, workspace_id, project_id,
                           correlation_id, causation_id, traceparent, classification, payload, occurred_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        envelope.id,
        envelope.type,
        envelope.subject,
        envelope.tenantid,
        envelope.workspaceid,
        envelope.projectid,
        envelope.correlationid,
        null,
        input.traceparent ?? null,
        envelope.classification,
        envelope,
        envelope.time,
      ],
    );

    const response: StoredResponse = { projectId, version: 1 };
    await client.query(
      "insert into idempotency_keys (org_id, key, request_digest, response) values ($1, $2, $3, $4)",
      [scope.orgId, input.idempotencyKey, digest, response],
    );
    return { kind: "created", ...response };
    });
  } catch (err) {
    if (err instanceof DuplicateHypothesisIdError) {
      return { kind: "duplicate_hypothesis", hypothesisId: err.duplicateId };
    }
    throw err;
  }
}
