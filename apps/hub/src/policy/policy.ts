import type { DbClient, DbPool } from "../platform/db.js";
import type { AuthScope } from "../identity/session.js";

export type Queryable = DbPool | DbClient;

export type PolicyDecision = { allowed: true } | { allowed: false; reason: string };

/**
 * Deny-by-default (ADR-014, TRUST-09): uma capability só é permitida com grant
 * explícito para o principal ('*' cobre todos os membros do workspace).
 */
export async function checkCapability(
  db: Queryable,
  scope: AuthScope,
  capability: string,
): Promise<PolicyDecision> {
  const grant = await db.query(
    `select 1 from capability_grants
      where org_id = $1 and workspace_id = $2
        and principal in ($3, '*') and capability = $4
      limit 1`,
    [scope.orgId, scope.workspaceId, scope.userId, capability],
  );
  if (grant.rowCount) return { allowed: true };
  return {
    allowed: false,
    reason: `no grant for capability '${capability}' in workspace '${scope.workspaceId}'`,
  };
}

export interface AuditEntry {
  orgId: string;
  actor: string;
  action: string;
  resource: string;
  outcome: "allowed" | "denied" | "error";
  reason?: string;
  correlationId?: string;
}

export async function recordAudit(db: Queryable, entry: AuditEntry): Promise<void> {
  await db.query(
    `insert into audit_log (org_id, actor, action, resource, outcome, reason, correlation_id)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [
      entry.orgId,
      entry.actor,
      entry.action,
      entry.resource,
      entry.outcome,
      entry.reason ?? null,
      entry.correlationId ?? null,
    ],
  );
}

/** Checa a capability e audita a negação; retorna a decisão para o chamador. */
export async function enforceCapability(
  db: Queryable,
  scope: AuthScope,
  capability: string,
  resource: string,
  correlationId?: string,
): Promise<PolicyDecision> {
  const decision = await checkCapability(db, scope, capability);
  if (!decision.allowed) {
    await recordAudit(db, {
      orgId: scope.orgId,
      actor: scope.userId,
      action: capability,
      resource,
      outcome: "denied",
      reason: decision.reason,
      ...(correlationId !== undefined ? { correlationId } : {}),
    });
  }
  return decision;
}

/** Grants de desenvolvimento: capabilities do walking skeleton para os membros dos dois tenants. */
export async function seedDevGrants(db: Queryable): Promise<void> {
  const grants: Array<[string, string, string]> = [
    ["org_dev_a", "ws_dev_a", "project.register"],
    ["org_dev_a", "ws_dev_a", "project.read"],
    ["org_dev_a", "ws_dev_a", "node.enroll"],
    ["org_dev_a", "ws_dev_a", "project.overview.read"],
    ["org_dev_a", "ws_dev_a", "hypothesis.write"],
    ["org_dev_a", "ws_dev_a", "artifact.write"],
    ["org_dev_a", "ws_dev_a", "decision.write"],
    ["org_dev_b", "ws_dev_b", "project.register"],
    ["org_dev_b", "ws_dev_b", "project.read"],
    ["org_dev_b", "ws_dev_b", "node.enroll"],
    ["org_dev_b", "ws_dev_b", "project.overview.read"],
    ["org_dev_b", "ws_dev_b", "hypothesis.write"],
    ["org_dev_b", "ws_dev_b", "artifact.write"],
    ["org_dev_b", "ws_dev_b", "decision.write"],
  ];
  for (const [orgId, workspaceId, capability] of grants) {
    await db.query(
      `insert into capability_grants (id, org_id, workspace_id, principal, capability)
       values ($1, $2, $3, '*', $4)
       on conflict (org_id, workspace_id, principal, capability) do nothing`,
      [`grant_${orgId}_${capability}`, orgId, workspaceId, capability],
    );
  }
}
