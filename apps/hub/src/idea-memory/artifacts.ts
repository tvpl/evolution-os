import { randomUUID } from "node:crypto";
import type { DbPool } from "../platform/db.js";
import { withTx } from "../platform/db.js";

export interface CreateArtifactInput {
  type: string;
  title: string;
  reference?: string;
  content?: string;
}

export type CreateArtifactOutcome =
  | { kind: "created"; artifactId: string; version: number }
  | { kind: "invalid"; reason: string };

/**
 * Cria o artifact e sua v1 na mesma transação (IDEA-08). `reference` ou
 * `content` (ao menos um) é exigido — um artifact sem nenhum dos dois não
 * carrega evidência alguma.
 */
export async function createArtifact(
  pool: DbPool,
  scope: { orgId: string; workspaceId: string },
  projectId: string,
  input: CreateArtifactInput,
): Promise<CreateArtifactOutcome> {
  if (!input.reference && !input.content) {
    return { kind: "invalid", reason: "reference or content is required" };
  }
  const artifactId = `art_${randomUUID().replaceAll("-", "")}`;
  await withTx(pool, async (client) => {
    await client.query(
      `insert into artifacts (id, project_id, org_id, workspace_id, type, title, current_version)
       values ($1, $2, $3, $4, $5, $6, 1)`,
      [artifactId, projectId, scope.orgId, scope.workspaceId, input.type, input.title],
    );
    await client.query(
      `insert into artifact_versions (artifact_id, version, reference, content)
       values ($1, 1, $2, $3)`,
      [artifactId, input.reference ?? null, input.content ?? null],
    );
  });
  return { kind: "created", artifactId, version: 1 };
}

export interface AddVersionInput {
  reference?: string;
  content?: string;
}

export type AddVersionOutcome =
  | { kind: "created"; version: number }
  | { kind: "invalid"; reason: string }
  | { kind: "not_found" };

/**
 * Adiciona a próxima versão SEM alterar as anteriores (IDEA-09) — append-only,
 * consistente com o padrão já usado em `outbox`/`workflow_steps`.
 */
export async function addArtifactVersion(
  pool: DbPool,
  artifactId: string,
  input: AddVersionInput,
): Promise<AddVersionOutcome> {
  if (!input.reference && !input.content) {
    return { kind: "invalid", reason: "reference or content is required" };
  }
  return withTx(pool, async (client) => {
    const current = await client.query(
      "select current_version from artifacts where id = $1 for update",
      [artifactId],
    );
    const row = current.rows[0] as { current_version: number } | undefined;
    if (!row) return { kind: "not_found" };
    const nextVersion = row.current_version + 1;
    await client.query(
      "insert into artifact_versions (artifact_id, version, reference, content) values ($1, $2, $3, $4)",
      [artifactId, nextVersion, input.reference ?? null, input.content ?? null],
    );
    await client.query("update artifacts set current_version = $2 where id = $1", [
      artifactId,
      nextVersion,
    ]);
    return { kind: "created", version: nextVersion };
  });
}

export interface ArtifactVersionRow {
  version: number;
  reference: string | null;
  content: string | null;
  createdAt: string;
}

export async function getArtifactVersion(
  pool: DbPool,
  artifactId: string,
  version: number,
): Promise<ArtifactVersionRow | null> {
  const res = await pool.query(
    `select version, reference, content, created_at as "createdAt"
       from artifact_versions where artifact_id = $1 and version = $2`,
    [artifactId, version],
  );
  return (res.rows[0] as ArtifactVersionRow | undefined) ?? null;
}

export interface ArtifactSummary {
  id: string;
  type: string;
  title: string;
  currentVersion: number;
  versionCount: number;
}

export async function listArtifacts(pool: DbPool, projectId: string): Promise<ArtifactSummary[]> {
  const res = await pool.query(
    `select a.id, a.type, a.title, a.current_version as "currentVersion",
            count(v.version)::int as "versionCount"
       from artifacts a
       join artifact_versions v on v.artifact_id = a.id
      where a.project_id = $1
      group by a.id, a.type, a.title, a.current_version
      order by a.created_at`,
    [projectId],
  );
  return res.rows as ArtifactSummary[];
}
