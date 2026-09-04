import { createPool, runMigrations } from "./platform/db.js";
import { seedDevData } from "./identity/seed.js";
import { seedDevGrants } from "./policy/policy.js";
import { defaultRouter, runDispatcherOnce } from "./platform/outbox.js";
import { helloWorkflow, runWorkflowsOnce } from "./platform/workflow.js";
import { buildServer } from "./server.js";

/** Entrada dev do Hub: monólito modular + workers in-process (ADR-004). */
const pool = createPool();
await runMigrations(pool);
await seedDevData(pool);
await seedDevGrants(pool);

const app = buildServer({ pool });
const port = Number(process.env["PORT"] ?? 4010);
await app.listen({ host: "127.0.0.1", port });
console.log(`evolution-os hub listening on http://127.0.0.1:${port}`);

const router = defaultRouter();
const workers = setInterval(() => {
  void runDispatcherOnce(pool, router).catch(() => {});
  void runWorkflowsOnce(pool, [helloWorkflow()]).catch(() => {});
}, 300);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    clearInterval(workers);
    void app.close().then(() => pool.end().then(() => process.exit(0)));
  });
}
