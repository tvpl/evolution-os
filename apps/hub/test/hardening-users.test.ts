import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { freshDb } from "./helpers.js";
import { buildServer } from "../src/server.js";
import { seedDevData } from "../src/identity/seed.js";
import { seedDevGrants } from "../src/policy/policy.js";
import type { DbPool } from "../src/platform/db.js";

let pool: DbPool;
let app: FastifyInstance;
let tokenA: string;
let tokenB: string;

beforeAll(async () => {
  pool = await freshDb("evoos_test_hardening_users");
  await seedDevData(pool);
  await seedDevGrants(pool);
  app = buildServer({ pool });
  const loginA = await app.inject({ method: "POST", url: "/auth/dev-login", payload: { email: "dev-a@evolutionos.local" } });
  tokenA = loginA.json().token;
  const loginB = await app.inject({ method: "POST", url: "/auth/dev-login", payload: { email: "dev-b@evolutionos.local" } });
  tokenB = loginB.json().token;
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

async function deactivate(userId: string, token: string) {
  return app.inject({
    method: "POST",
    url: `/orgs/current/users/${userId}/deactivate`,
    headers: { authorization: `Bearer ${token}` },
  });
}

async function listUsers(token: string) {
  return app.inject({ method: "GET", url: "/orgs/current/users", headers: { authorization: `Bearer ${token}` } });
}

async function login(email: string) {
  return app.inject({ method: "POST", url: "/auth/dev-login", payload: { email } });
}

describe("User deprovisioning (HARD-18..22)", () => {
  it("rejects deactivating an unknown user with 404 (HARD-20)", async () => {
    const res = await deactivate("user_does_not_exist", tokenB);
    expect(res.statusCode).toBe(404);
  });

  it("rejects deactivating a user from another org with 404, never confirming existence (HARD-20)", async () => {
    // user_dev_a belongs to org_dev_a; dev-b (org_dev_b) tries to deactivate it.
    const res = await deactivate("user_dev_a", tokenB);
    expect(res.statusCode).toBe(404);
    const row = await pool.query("select deactivated_at from users where id = 'user_dev_a'");
    expect(row.rows[0].deactivated_at).toBeNull();
  });

  it("deactivates a user, setting deactivated_at, and blocks their subsequent dev-login with a distinct 401 (HARD-18/19)", async () => {
    const res = await deactivate("user_dev_a", tokenA);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ userId: "user_dev_a", deactivated: true });

    const row = await pool.query("select deactivated_at from users where id = 'user_dev_a'");
    expect(row.rows[0].deactivated_at).not.toBeNull();

    const attempt = await login("dev-a@evolutionos.local");
    expect(attempt.statusCode).toBe(401);
    expect(attempt.json().title).toBe("identity_deactivated");

    const unknown = await login("nobody@evolutionos.local");
    expect(unknown.statusCode).toBe(401);
    expect(unknown.json().title).toBe("unknown_identity");
    expect(unknown.json().title).not.toBe(attempt.json().title);
  });

  it("is idempotent when deactivating an already-deactivated user (HARD-21)", async () => {
    const row1 = await pool.query("select deactivated_at from users where id = 'user_dev_a'");
    const first = row1.rows[0].deactivated_at;

    const res = await deactivate("user_dev_a", tokenA);
    expect(res.statusCode).toBe(200);

    const row2 = await pool.query("select deactivated_at from users where id = 'user_dev_a'");
    expect(row2.rows[0].deactivated_at).toEqual(first);
  });

  it("lists users with exact active/deactivated status (HARD-22)", async () => {
    const res = await listUsers(tokenA);
    expect(res.statusCode).toBe(200);
    const users = res.json().users as Array<{ id: string; deactivatedAt: string | null }>;
    const a = users.find((u) => u.id === "user_dev_a");
    expect(a?.deactivatedAt).not.toBeNull();
  });

  it("never leaks another org's users through the listing", async () => {
    const listA = await listUsers(tokenA);
    const listB = await listUsers(tokenB);
    const idsA = (listA.json().users as Array<{ id: string }>).map((u) => u.id);
    const idsB = (listB.json().users as Array<{ id: string }>).map((u) => u.id);
    expect(idsA).toContain("user_dev_a");
    expect(idsA).not.toContain("user_dev_b");
    expect(idsB).toContain("user_dev_b");
    expect(idsB).not.toContain("user_dev_a");
  });
});
