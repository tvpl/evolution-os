import { validateProject } from "@evolution-os/contracts";
import type { DbPool } from "../platform/db.js";
import { listHypotheses } from "./hypotheses.js";
import { listConstraints } from "./constraints.js";
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
