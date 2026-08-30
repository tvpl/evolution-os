import type { EventEnvelope } from "@evolution-os/contracts";
import { EVENT_TYPES } from "@evolution-os/contracts";
import { withTx, type DbClient, type DbPool } from "./db.js";

export type EventHandler = (client: DbClient, envelope: EventEnvelope) => Promise<void>;

interface Subscription {
  consumer: string;
  handler: EventHandler;
}

/** Router in-process do monólito modular (ADR-004): type → consumers. */
export class EventRouter {
  private subs = new Map<string, Subscription[]>();

  on(type: string, consumer: string, handler: EventHandler): this {
    const list = this.subs.get(type) ?? [];
    list.push({ consumer, handler });
    this.subs.set(type, list);
    return this;
  }

  subscriptionsFor(type: string): Subscription[] {
    return this.subs.get(type) ?? [];
  }
}

export interface DispatchStats {
  delivered: number;
  deduplicated: number;
  failed: number;
}

/**
 * Entrega at-least-once com dedup por inbox (event contract §4/§8):
 * para cada evento pendente, cada consumer processa numa transação que grava
 * (consumer, event_id) no inbox ANTES do efeito — duplicata vira no-op.
 * O evento só é marcado dispatched quando todos os consumers processaram;
 * falha de um consumer mantém o evento pendente para nova tentativa.
 */
export async function runDispatcherOnce(
  pool: DbPool,
  router: EventRouter,
  batchSize = 50,
): Promise<DispatchStats> {
  const stats: DispatchStats = { delivered: 0, deduplicated: 0, failed: 0 };
  const pending = await pool.query(
    "select event_id, payload, traceparent from outbox where dispatched_at is null order by seq limit $1",
    [batchSize],
  );
  for (const row of pending.rows as Array<{
    event_id: string;
    payload: EventEnvelope;
    traceparent: string | null;
  }>) {
    const envelope = row.payload;
    let allOk = true;
    for (const { consumer, handler } of router.subscriptionsFor(envelope.type)) {
      try {
        await withTx(pool, async (client) => {
          const inserted = await client.query(
            "insert into inbox (consumer, event_id) values ($1, $2) on conflict do nothing",
            [consumer, row.event_id],
          );
          if (!inserted.rowCount) {
            stats.deduplicated += 1;
            return;
          }
          await handler(client, envelope);
          stats.delivered += 1;
        });
      } catch {
        allOk = false;
        stats.failed += 1;
      }
    }
    if (allOk) {
      await pool.query("update outbox set dispatched_at = now() where event_id = $1", [
        row.event_id,
      ]);
    }
  }
  return stats;
}

/** Projeção projects_view (TRUST-02): consumer idempotente do evento de registro. */
export function projectsViewProjector(): { type: string; consumer: string; handler: EventHandler } {
  return {
    type: EVENT_TYPES.PROJECT_REGISTERED,
    consumer: "projects-view-projector",
    handler: async (client, envelope) => {
      const data = envelope.data as { projectId: string; name: string; type: string };
      await client.query(
        `insert into projects_view (project_id, org_id, workspace_id, name, type, registered_at)
         values ($1, $2, $3, $4, $5, $6)
         on conflict (project_id) do nothing`,
        [data.projectId, envelope.tenantid, envelope.workspaceid, data.name, data.type, envelope.time],
      );
    },
  };
}

export function defaultRouter(): EventRouter {
  const router = new EventRouter();
  const projector = projectsViewProjector();
  router.on(projector.type, projector.consumer, projector.handler);
  return router;
}
