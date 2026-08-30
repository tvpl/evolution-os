import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { freshDb } from "./helpers.js";
import { buildServer } from "../src/server.js";
import { seedDevData } from "../src/identity/seed.js";
import { signSession } from "../src/identity/session.js";
import type { DbPool } from "../src/platform/db.js";

let pool: DbPool;
let app: FastifyInstance;

beforeAll(async () => {
  pool = await freshDb("evoos_test_identity");
  await seedDevData(pool);
  app = buildServer({ pool });
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

async function login(email: string): Promise<{ token: string; scope: Record<string, string> }> {
  const res = await app.inject({ method: "POST", url: "/auth/dev-login", payload: { email } });
  expect(res.statusCode).toBe(200);
  return res.json();
}

describe("dev identity (TRUST-06)", () => {
  it("login scopes the session to exactly one organization and workspace", async () => {
    const { scope } = await login("dev-a@evolutionos.local");
    expect(scope).toEqual({ userId: "user_dev_a", orgId: "org_dev_a", workspaceId: "ws_dev_a" });
  });

  it("unknown email is rejected with 401 problem details", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/dev-login",
      payload: { email: "nobody@evolutionos.local" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.headers["content-type"]).toContain("application/problem+json");
    expect(res.json().title).toBe("unknown_identity");
  });

  it("missing token on a protected route returns 401 problem details", async () => {
    const res = await app.inject({ method: "GET", url: "/me" });
    expect(res.statusCode).toBe(401);
    expect(res.headers["content-type"]).toContain("application/problem+json");
    expect(res.json()).toMatchObject({ status: 401, title: "unauthenticated" });
  });

  it("tampered token is rejected with 401", async () => {
    const { token } = await login("dev-a@evolutionos.local");
    const forged = signSession(
      { userId: "user_dev_a", orgId: "org_dev_b", workspaceId: "ws_dev_b" },
      "wrong-secret",
    );
    expect(forged).not.toBe(token);
    const res = await app.inject({
      method: "GET",
      url: "/me",
      headers: { authorization: `Bearer ${forged}` },
    });
    expect(res.statusCode).toBe(401);
  });

  it("tenant claimed via header is ignored in favor of the session scope", async () => {
    const { token } = await login("dev-a@evolutionos.local");
    const res = await app.inject({
      method: "GET",
      url: "/me",
      headers: { authorization: `Bearer ${token}`, "x-tenant-id": "org_dev_b" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().scope.orgId).toBe("org_dev_a");
  });

  it("responses echo a correlation id", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/healthz",
      headers: { "x-correlation-id": "req_test_123" },
    });
    expect(res.headers["x-correlation-id"]).toBe("req_test_123");
  });
});
