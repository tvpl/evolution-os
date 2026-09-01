import type { DbPool } from "../platform/db.js";
import { listHypotheses } from "./hypotheses.js";
import { listConstraints } from "./constraints.js";

export interface ProjectOverview {
  projectId: string;
  name: string;
  type: string;
  status: string;
  intent: Record<string, unknown> | null;
  hypotheses: Awaited<ReturnType<typeof listHypotheses>>;
  constraints: Awaited<ReturnType<typeof listConstraints>>;
  artifactCount: number;
  decisionCount: number;
}

/**
 * Agregação síncrona (IDEA-05): leitura direta das tabelas, sem projeção
 * assíncrona — não há fan-out de consumers como no outbox do Slice 0, então
 * uma query direta é a escolha mais simples que atende o requisito.
 */
export async function getProjectOverview(pool: DbPool, projectId: string): Promise<ProjectOverview | null> {
  const project = await pool.query(
    "select id, name, type, manifest from projects where id = $1",
    [projectId],
  );
  const row = project.rows[0] as
    | { id: string; name: string; type: string; manifest: Record<string, unknown> }
    | undefined;
  if (!row) return null;

  const manifest = row.manifest as { metadata?: { status?: string }; spec?: { intent?: Record<string, unknown> } };
  const [hypotheses, constraints, artifactCount, decisionCount] = await Promise.all([
    listHypotheses(pool, projectId),
    listConstraints(pool, projectId),
    pool.query("select count(*)::int as n from artifacts where project_id = $1", [projectId]),
    pool.query("select count(*)::int as n from decisions where project_id = $1", [projectId]),
  ]);

  return {
    projectId: row.id,
    name: row.name,
    type: row.type,
    status: manifest.metadata?.status ?? "unknown",
    intent: manifest.spec?.intent ?? null,
    hypotheses,
    constraints,
    artifactCount: (artifactCount.rows[0] as { n: number }).n,
    decisionCount: (decisionCount.rows[0] as { n: number }).n,
  };
}
