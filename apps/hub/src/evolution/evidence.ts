import { createHash, randomUUID } from "node:crypto";
import type { DbPool } from "../platform/db.js";
import type { AuthScope } from "../identity/session.js";

export interface CreateEvidenceInput {
  type: "humanStatement" | "referenceOnly";
  statement?: string;
  sourceReference?: string;
  sourceType?: string;
  sourceAuthority?: string;
}

export type CreateEvidenceOutcome = { kind: "created"; evidenceId: string } | { kind: "invalid"; reason: string };

/**
 * FLOW-01/03: evidência manual (`humanStatement`) ou referência de URL
 * (`referenceOnly`, sem fetch — evidence spec §7) entra sempre em
 * `quarantine`; exige ao menos statement OU sourceReference.
 */
export async function createEvidence(
  pool: DbPool,
  scope: AuthScope,
  projectId: string,
  input: CreateEvidenceInput,
): Promise<CreateEvidenceOutcome> {
  const content = input.statement ?? input.sourceReference;
  if (!content) {
    return { kind: "invalid", reason: "statement or sourceReference is required" };
  }
  const evidenceId = `evd_${randomUUID().replaceAll("-", "")}`;
  const digest = `sha256:${createHash("sha256").update(content).digest("hex")}`;
  await pool.query(
    `insert into evidence (id, project_id, org_id, workspace_id, type, source_type,
                           source_reference, source_authority, content_digest, content_excerpt)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      evidenceId,
      projectId,
      scope.orgId,
      scope.workspaceId,
      input.type,
      input.sourceType ?? null,
      input.sourceReference ?? null,
      input.sourceAuthority ?? null,
      digest,
      input.statement ?? null,
    ],
  );
  return { kind: "created", evidenceId };
}

export type ActivateOutcome = { kind: "activated" } | { kind: "not_found" };

export async function activateEvidence(
  pool: DbPool,
  projectId: string,
  evidenceId: string,
): Promise<ActivateOutcome> {
  const res = await pool.query(
    `update evidence set status = 'active', activated_at = now()
      where id = $1 and project_id = $2
      returning id`,
    [evidenceId, projectId],
  );
  return res.rowCount ? { kind: "activated" } : { kind: "not_found" };
}

export interface EvidenceRow {
  id: string;
  type: string;
  status: string;
  sourceReference: string | null;
  contentDigest: string;
  createdAt: string;
}

export async function listEvidence(pool: DbPool, projectId: string): Promise<EvidenceRow[]> {
  const res = await pool.query(
    `select id, type, status, source_reference as "sourceReference",
            content_digest as "contentDigest", created_at as "createdAt"
       from evidence where project_id = $1 order by created_at`,
    [projectId],
  );
  return res.rows as EvidenceRow[];
}
