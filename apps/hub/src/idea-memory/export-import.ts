import { validateProject } from "@evolution-os/contracts";
import { withTx, type DbPool } from "../platform/db.js";
import type { AuthScope } from "../identity/session.js";
import { insertHypotheses, listHypotheses, type HypothesisInput } from "./hypotheses.js";
import { insertConstraints, listConstraints, type ConstraintInput } from "./constraints.js";
import { listArtifacts, getArtifactVersion } from "./artifacts.js";
import { listDecisions } from "./decisions.js";

export interface ExportedProject {
  apiVersion: "evolutionos.io/v1alpha1";
  kind: "EvolutionProject";
  metadata: { id: string; name: string; slug: string; type: string; status: string };
  spec: {
    intent: Record<string, unknown> | null;
    hypotheses: unknown[];
    constraints: unknown[];
    artifacts: Array<{ id: string; type: string; title: string; version: number; reference: string | null; content: string | null }>;
    decisions: unknown[];
  };
}

export type ExportOutcome = { kind: "exported"; manifest: ExportedProject } | { kind: "not_found" };

function stripNulls(obj: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== null));
}

/**
 * IDEA-17: manifest portável — apiVersion/kind sempre presentes (manifest
 * spec §5), IDs originais preservados, validado pelo schema v0 antes de
 * servir (o mesmo contrato usado no registro).
 */
export async function exportProject(pool: DbPool, projectId: string): Promise<ExportOutcome> {
  const project = await pool.query(
    "select id, name, type, manifest from projects where id = $1",
    [projectId],
  );
  const row = project.rows[0] as
    | { id: string; name: string; type: string; manifest: Record<string, unknown> }
    | undefined;
  if (!row) return { kind: "not_found" };

  const manifest = row.manifest as {
    metadata: { slug: string; status: string };
    spec?: { intent?: Record<string, unknown> };
  };
  const [hypothesesRaw, constraintsRaw, artifactSummaries, decisions] = await Promise.all([
    listHypotheses(pool, projectId),
    listConstraints(pool, projectId),
    listArtifacts(pool, projectId),
    listDecisions(pool, projectId),
  ]);
  // O schema v0 tipa category/type/evidenceState/metric/threshold como
  // string opcional — omitir a chave quando ausente, nunca enviar null.
  const hypotheses = hypothesesRaw.map((h) => stripNulls(h));
  const constraints = constraintsRaw.map((c) => stripNulls(c));
  const artifacts = await Promise.all(
    artifactSummaries.map(async (a) => {
      const version = await getArtifactVersion(pool, a.id, a.currentVersion);
      return {
        id: a.id,
        type: a.type,
        title: a.title,
        version: a.currentVersion,
        reference: version?.reference ?? null,
        content: version?.content ?? null,
      };
    }),
  );

  const exported: ExportedProject = {
    apiVersion: "evolutionos.io/v1alpha1",
    kind: "EvolutionProject",
    metadata: {
      id: row.id,
      name: row.name,
      slug: manifest.metadata.slug,
      type: row.type,
      status: manifest.metadata.status,
    },
    spec: {
      intent: manifest.spec?.intent ?? null,
      hypotheses,
      constraints,
      artifacts,
      decisions,
    },
  };
  return { kind: "exported", manifest: exported };
}

/** Valida o export contra o schema v0 (IDEA-17 AC1). */
export function validateExport(manifest: ExportedProject): { ok: boolean; errors: string[] } {
  return validateProject(manifest);
}

export type ImportOutcome =
  | { kind: "imported"; projectId: string }
  | { kind: "conflict" }
  | { kind: "invalid"; errors: string[] };

/**
 * IDEA-18/19: recria projeto + hipóteses + constraints + artifacts (versão
 * atual) + decisions numa ÚNICA transação (tudo ou nada); rejeita 409 se o
 * ID já existir. IDs originais são preservados literalmente.
 */
export async function importProject(
  pool: DbPool,
  scope: AuthScope,
  manifest: ExportedProject,
): Promise<ImportOutcome> {
  const check = validateProject(manifest);
  if (!check.ok) {
    return { kind: "invalid", errors: check.errors };
  }
  const projectId = manifest.metadata.id;

  const existing = await pool.query("select 1 from projects where id = $1", [projectId]);
  if (existing.rowCount) {
    return { kind: "conflict" };
  }

  await withTx(pool, async (client) => {
    const storedManifest = {
      apiVersion: manifest.apiVersion,
      kind: manifest.kind,
      metadata: manifest.metadata,
      spec: {
        intent: manifest.spec.intent ?? undefined,
        hypotheses: manifest.spec.hypotheses,
        constraints: manifest.spec.constraints,
      },
    };
    await client.query(
      `insert into projects (id, org_id, workspace_id, type, name, manifest, created_by)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [
        projectId,
        scope.orgId,
        scope.workspaceId,
        manifest.metadata.type,
        manifest.metadata.name,
        storedManifest,
        scope.userId,
      ],
    );

    if (manifest.spec.hypotheses.length) {
      await insertHypotheses(client, projectId, scope, manifest.spec.hypotheses as HypothesisInput[]);
    }
    if (manifest.spec.constraints.length) {
      await insertConstraints(client, projectId, scope, manifest.spec.constraints as ConstraintInput[]);
    }
    for (const artifact of manifest.spec.artifacts) {
      await client.query(
        `insert into artifacts (id, project_id, org_id, workspace_id, type, title, current_version)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [artifact.id, projectId, scope.orgId, scope.workspaceId, artifact.type, artifact.title, artifact.version],
      );
      await client.query(
        `insert into artifact_versions (artifact_id, version, reference, content)
         values ($1, $2, $3, $4)`,
        [artifact.id, artifact.version, artifact.reference, artifact.content],
      );
    }
    for (const decision of manifest.spec.decisions as Array<{
      id: string;
      decision: string;
      actor: string;
      rationale: string;
      alternatives: unknown[];
      subjectType: string | null;
      subjectId: string | null;
      reviewTrigger: string | null;
      reviewTriggerStatus: string;
      decidedAt: string;
    }>) {
      await client.query(
        `insert into decisions (id, project_id, org_id, workspace_id, decision, actor, rationale,
                                 alternatives, subject_type, subject_id, review_trigger,
                                 review_trigger_status, decided_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          decision.id,
          projectId,
          scope.orgId,
          scope.workspaceId,
          decision.decision,
          decision.actor,
          decision.rationale,
          JSON.stringify(decision.alternatives),
          decision.subjectType,
          decision.subjectId,
          decision.reviewTrigger,
          decision.reviewTriggerStatus,
          decision.decidedAt,
        ],
      );
    }
  });

  return { kind: "imported", projectId };
}
