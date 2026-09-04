import { createPool, runMigrations } from "./db.js";

const pool = createPool();
const applied = await runMigrations(pool);
console.log(applied.length ? `applied: ${applied.join(", ")}` : "up to date");
await pool.end();
