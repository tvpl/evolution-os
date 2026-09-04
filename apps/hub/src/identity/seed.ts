import type { DbPool } from "../platform/db.js";

/**
 * Dados de desenvolvimento: dois tenants completos para permitir as suites
 * negativas de cross-tenant exigidas pelo exit do M0.
 */
export const DEV_TENANTS = [
  {
    orgId: "org_dev_a",
    orgName: "Dev Org A",
    workspaceId: "ws_dev_a",
    workspaceName: "Workspace A",
    userId: "user_dev_a",
    email: "dev-a@evolutionos.local",
  },
  {
    orgId: "org_dev_b",
    orgName: "Dev Org B",
    workspaceId: "ws_dev_b",
    workspaceName: "Workspace B",
    userId: "user_dev_b",
    email: "dev-b@evolutionos.local",
  },
] as const;

export async function seedDevData(pool: DbPool): Promise<void> {
  for (const t of DEV_TENANTS) {
    await pool.query(
      "insert into organizations (id, name) values ($1, $2) on conflict (id) do nothing",
      [t.orgId, t.orgName],
    );
    await pool.query(
      "insert into workspaces (id, org_id, name) values ($1, $2, $3) on conflict (id) do nothing",
      [t.workspaceId, t.orgId, t.workspaceName],
    );
    await pool.query(
      "insert into users (id, org_id, email, display_name) values ($1, $2, $3, $4) on conflict (id) do nothing",
      [t.userId, t.orgId, t.email, t.orgName],
    );
  }
}
