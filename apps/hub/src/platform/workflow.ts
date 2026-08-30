import { randomUUID } from "node:crypto";
import { withTx, type DbClient, type DbPool } from "./db.js";

/**
 * Engine durável mínima do M0 (AD-006): estado em `workflows`, prova de
 * execução única por step em `workflow_steps`, checkpoint jsonb por step.
 * A interface é estreita de propósito — um engine maior entra como adapter
 * (ADR-006) sem mudar os call sites.
 */
export interface WorkflowStep {
  name: string;
  run(client: DbClient, checkpoint: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export interface WorkflowDefinition {
  type: string;
  steps: WorkflowStep[];
}

export async function startWorkflow(
  pool: DbPool,
  def: WorkflowDefinition,
  orgId?: string,
): Promise<string> {
  const id = `wf_${randomUUID().replaceAll("-", "")}`;
  await pool.query(
    "insert into workflows (id, type, status, current_step, checkpoint, org_id) values ($1, $2, 'running', 0, '{}'::jsonb, $3)",
    [id, def.type, orgId ?? null],
  );
  return id;
}

export interface WorkflowRunStats {
  stepsExecuted: number;
  stepsSkipped: number;
  completed: string[];
}

/**
 * Executa steps pendentes dos workflows `running`. Cada step roda numa
 * transação que grava (workflow_id, step) em workflow_steps ANTES do efeito:
 * um step já registrado nunca re-executa (retomada pós-restart é idempotente);
 * um step que falha faz rollback completo e fica pendente para retry.
 * `maxSteps` limita o trabalho da chamada (budget do runner).
 */
export async function runWorkflowsOnce(
  pool: DbPool,
  defs: WorkflowDefinition[],
  maxSteps = Number.POSITIVE_INFINITY,
): Promise<WorkflowRunStats> {
  const stats: WorkflowRunStats = { stepsExecuted: 0, stepsSkipped: 0, completed: [] };
  const byType = new Map(defs.map((d) => [d.type, d]));
  const running = await pool.query(
    "select id, type, checkpoint from workflows where status = 'running' order by updated_at",
  );
  for (const wf of running.rows as Array<{
    id: string;
    type: string;
    checkpoint: Record<string, unknown>;
  }>) {
    const def = byType.get(wf.type);
    if (!def) continue;
    let checkpoint = wf.checkpoint;
    let finished = true;
    for (const [index, step] of def.steps.entries()) {
      if (stats.stepsExecuted >= maxSteps) {
        finished = false;
        break;
      }
      const already = await pool.query(
        "select 1 from workflow_steps where workflow_id = $1 and step = $2",
        [wf.id, step.name],
      );
      if (already.rowCount) {
        stats.stepsSkipped += 1;
        continue;
      }
      const next = await withTx(pool, async (client) => {
        await client.query("insert into workflow_steps (workflow_id, step) values ($1, $2)", [
          wf.id,
          step.name,
        ]);
        const updated = await step.run(client, checkpoint);
        await client.query(
          "update workflows set checkpoint = $2, current_step = $3, updated_at = now() where id = $1",
          [wf.id, updated, index + 1],
        );
        return updated;
      });
      checkpoint = next;
      stats.stepsExecuted += 1;
    }
    if (finished) {
      await pool.query("update workflows set status = 'completed', updated_at = now() where id = $1", [
        wf.id,
      ]);
      stats.completed.push(wf.id);
    }
  }
  return stats;
}

/** Hello path do M0: três steps com checkpoint acumulado e contadores de execução. */
export function helloWorkflow(): WorkflowDefinition {
  const counted = (name: string, patch: Record<string, unknown>): WorkflowStep => ({
    name,
    run: async (_client, checkpoint) => {
      const runs = (checkpoint[`runs_${name}`] as number | undefined) ?? 0;
      return { ...checkpoint, ...patch, [`runs_${name}`]: runs + 1 };
    },
  });
  return {
    type: "hello",
    steps: [
      counted("greet", { greeting: "hello" }),
      counted("subject", { subject: "evolution" }),
      counted("compose", { message: "hello evolution" }),
    ],
  };
}
