import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { freshDb } from "./helpers.js";
import {
  helloWorkflow,
  runWorkflowsOnce,
  startWorkflow,
  type WorkflowDefinition,
} from "../src/platform/workflow.js";
import type { DbPool } from "../src/platform/db.js";

let pool: DbPool;

beforeAll(async () => {
  pool = await freshDb("evoos_test_workflow");
});

beforeEach(async () => {
  await pool.query("delete from workflow_steps");
  await pool.query("delete from workflows");
});

afterAll(async () => {
  await pool.end();
});

describe("durable workflow hello path (TRUST-11)", () => {
  it("completes the three steps with a checkpoint per step", async () => {
    const id = await startWorkflow(pool, helloWorkflow());
    const stats = await runWorkflowsOnce(pool, [helloWorkflow()]);
    expect(stats).toMatchObject({ stepsExecuted: 3, completed: [id] });

    const wf = await pool.query("select status, current_step, checkpoint from workflows where id = $1", [id]);
    expect(wf.rows[0].status).toBe("completed");
    expect(wf.rows[0].current_step).toBe(3);
    expect(wf.rows[0].checkpoint).toMatchObject({ message: "hello evolution" });

    const steps = await pool.query(
      "select step from workflow_steps where workflow_id = $1 order by executed_at",
      [id],
    );
    expect(steps.rows.map((r: { step: string }) => r.step)).toEqual(["greet", "subject", "compose"]);
  });

  it("a runner killed after a checkpoint resumes without repeating completed steps", async () => {
    const id = await startWorkflow(pool, helloWorkflow());

    // "Runner" morre depois de 2 steps (budget esgotado = processo destruído).
    const first = await runWorkflowsOnce(pool, [helloWorkflow()], 2);
    expect(first).toMatchObject({ stepsExecuted: 2, completed: [] });
    const executedBefore = await pool.query(
      "select step, executed_at from workflow_steps where workflow_id = $1 order by step",
      [id],
    );

    // Nova instância retoma do checkpoint persistido.
    const resumed = await runWorkflowsOnce(pool, [helloWorkflow()]);
    expect(resumed).toMatchObject({ stepsExecuted: 1, stepsSkipped: 2, completed: [id] });

    const wf = await pool.query("select checkpoint from workflows where id = $1", [id]);
    // Contadores provam que nenhum step completado re-executou.
    expect(wf.rows[0].checkpoint).toMatchObject({
      runs_greet: 1,
      runs_subject: 1,
      runs_compose: 1,
      message: "hello evolution",
    });
    const executedAfter = await pool.query(
      "select step, executed_at from workflow_steps where workflow_id = $1 order by step",
      [id],
    );
    // Timestamps dos steps 1-2 intactos: não houve nova execução.
    const byStep = (rows: Array<{ step: string; executed_at: Date }>) =>
      new Map(rows.map((r) => [r.step, r.executed_at.toISOString()]));
    const before = byStep(executedBefore.rows);
    const after = byStep(executedAfter.rows);
    for (const step of ["greet", "subject"]) {
      expect(after.get(step)).toBe(before.get(step));
    }
  });

  it("a step that fails rolls back atomically and is retried on the next run", async () => {
    let attempts = 0;
    const flaky: WorkflowDefinition = {
      type: "flaky",
      steps: [
        {
          name: "unstable",
          run: async (_c, checkpoint) => {
            attempts += 1;
            if (attempts === 1) throw new Error("transient failure");
            return { ...checkpoint, done: true };
          },
        },
      ],
    };
    const id = await startWorkflow(pool, flaky);

    await expect(runWorkflowsOnce(pool, [flaky])).rejects.toThrow("transient failure");
    const afterFail = await pool.query(
      "select count(*)::int as n from workflow_steps where workflow_id = $1",
      [id],
    );
    expect(afterFail.rows[0].n).toBe(0);

    const retry = await runWorkflowsOnce(pool, [flaky]);
    expect(retry.completed).toEqual([id]);
    expect(attempts).toBe(2);
  });
});
