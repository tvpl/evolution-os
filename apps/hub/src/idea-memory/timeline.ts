import type { DbPool } from "../platform/db.js";

export interface TimelineEvent {
  occurredAt: string;
  kind: "hypothesis" | "artifact_version" | "decision";
  summary: string;
  ref: string;
}

const LIMIT = 200;

/**
 * IDEA-16: união de hypothesis (evento de criação — este slice não versiona
 * mudanças de status, então a criação é o único evento disponível),
 * artifact_versions e decisions, mesclados por occurred_at desc. Mesma
 * escolha do overview: leitura direta, sem projeção assíncrona.
 */
export async function getProjectTimeline(pool: DbPool, projectId: string): Promise<TimelineEvent[]> {
  const [hypotheses, versions, decisions] = await Promise.all([
    pool.query(
      `select id, statement, status, created_at as "occurredAt"
         from hypotheses where project_id = $1`,
      [projectId],
    ),
    pool.query(
      `select v.artifact_id as "artifactId", v.version, a.title, v.created_at as "occurredAt"
         from artifact_versions v join artifacts a on a.id = v.artifact_id
        where a.project_id = $1`,
      [projectId],
    ),
    pool.query(
      `select id, decision, decided_at as "occurredAt" from decisions where project_id = $1`,
      [projectId],
    ),
  ]);

  const events: TimelineEvent[] = [
    ...hypotheses.rows.map(
      (h: { id: string; statement: string; status: string; occurredAt: string }): TimelineEvent => ({
        occurredAt: h.occurredAt,
        kind: "hypothesis",
        summary: `hipótese "${h.statement}" criada com status ${h.status}`,
        ref: h.id,
      }),
    ),
    ...versions.rows.map(
      (v: { artifactId: string; version: number; title: string; occurredAt: string }): TimelineEvent => ({
        occurredAt: v.occurredAt,
        kind: "artifact_version",
        summary: `v${v.version} de "${v.title}" criada`,
        ref: v.artifactId,
      }),
    ),
    ...decisions.rows.map(
      (d: { id: string; decision: string; occurredAt: string }): TimelineEvent => ({
        occurredAt: d.occurredAt,
        kind: "decision",
        summary: `decisão registrada: ${d.decision}`,
        ref: d.id,
      }),
    ),
  ];

  events.sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : a.occurredAt > b.occurredAt ? -1 : 0));
  return events.slice(0, LIMIT);
}
