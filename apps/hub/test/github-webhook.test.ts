import { createHmac } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { freshDb } from "./helpers.js";
import { buildServer } from "../src/server.js";
import { seedDevData } from "../src/identity/seed.js";
import { seedDevGrants } from "../src/policy/policy.js";
import { canonicalJson } from "../src/platform/canonical-json.js";
import type { DbPool } from "../src/platform/db.js";

let pool: DbPool;
let app: FastifyInstance;
let tokenA: string;
let projectId: string;
let connectionId: string;
let webhookSecret: string;

async function registerProject(): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/projects",
    headers: { authorization: `Bearer ${tokenA}`, "idempotency-key": "gh-webhook-setup" },
    payload: {
      apiVersion: "evolutionos.io/v1alpha1",
      kind: "EvolutionProject",
      metadata: { name: "Proj GitHub Webhook", slug: "proj-gh-webhook", type: "idea", status: "discovery" },
      spec: { intent: { problem: "x" } },
    },
  });
  return res.json().projectId;
}

function sign(secret: string, body: Record<string, unknown>): string {
  return `sha256=${createHmac("sha256", secret).update(canonicalJson(body)).digest("hex")}`;
}

function sendWebhook(deliveryId: string | undefined, signature: string | undefined, body: Record<string, unknown>) {
  const headers: Record<string, string> = {};
  if (deliveryId !== undefined) headers["x-github-delivery"] = deliveryId;
  if (signature !== undefined) headers["x-hub-signature-256"] = signature;
  return app.inject({
    method: "POST",
    url: `/projects/${projectId}/connectors/github/${connectionId}/webhook`,
    headers,
    payload: body,
  });
}

beforeAll(async () => {
  pool = await freshDb("evoos_test_github_webhook");
  await seedDevData(pool);
  await seedDevGrants(pool);
  app = buildServer({ pool });
  const login = await app.inject({
    method: "POST",
    url: "/auth/dev-login",
    payload: { email: "dev-a@evolutionos.local" },
  });
  tokenA = login.json().token;
  projectId = await registerProject();
  const connected = await app.inject({
    method: "POST",
    url: `/projects/${projectId}/connectors/github`,
    headers: { authorization: `Bearer ${tokenA}` },
    payload: { owner: "acme", repo: "widgets" },
  });
  connectionId = connected.json().connectionId;
  webhookSecret = connected.json().webhookSecret;
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

describe("ingest github webhooks (GH-04/05/06)", () => {
  it("a valid signature and a new delivery id persist the event and update lastEventAt", async () => {
    const body = { action: "opened", number: 1 };
    const res = await sendWebhook("delivery-1", sign(webhookSecret, body), body);
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("ingested");

    const eventRow = await pool.query(
      "select delivery_id as \"deliveryId\" from github_webhook_events where connection_id = $1",
      [connectionId],
    );
    expect(eventRow.rows.map((r: { deliveryId: string }) => r.deliveryId)).toContain("delivery-1");

    const connRow = await pool.query("select last_event_at as \"lastEventAt\" from github_connections where id = $1", [
      connectionId,
    ]);
    expect(connRow.rows[0].lastEventAt).not.toBeNull();
  });

  it("an invalid signature is rejected 401 without persisting the event", async () => {
    const body = { action: "opened", number: 2 };
    const before = await pool.query("select count(*)::int as n from github_webhook_events where connection_id = $1", [
      connectionId,
    ]);
    const res = await sendWebhook("delivery-invalid-sig", "sha256=deadbeef", body);
    expect(res.statusCode).toBe(401);
    expect(res.json().title).toBe("invalid_signature");
    const after = await pool.query("select count(*)::int as n from github_webhook_events where connection_id = $1", [
      connectionId,
    ]);
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });

  it("a signature of the correct length but the wrong content is rejected 401 (not just a length mismatch)", async () => {
    const body = { action: "opened", number: 21 };
    const before = await pool.query("select count(*)::int as n from github_webhook_events where connection_id = $1", [
      connectionId,
    ]);
    const wrongButSameLength = `sha256=${"a".repeat(64)}`;
    const res = await sendWebhook("delivery-wrong-content-sig", wrongButSameLength, body);
    expect(res.statusCode).toBe(401);
    expect(res.json().title).toBe("invalid_signature");
    const after = await pool.query("select count(*)::int as n from github_webhook_events where connection_id = $1", [
      connectionId,
    ]);
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });

  it("a payload signed with a different connection's secret is rejected 401 on this connection's webhook", async () => {
    const otherConnected = await app.inject({
      method: "POST",
      url: `/projects/${projectId}/connectors/github`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { owner: "acme", repo: "widgets-other" },
    });
    const otherSecret = otherConnected.json().webhookSecret;
    const body = { action: "opened", number: 22 };
    const res = await sendWebhook("delivery-wrong-connection-secret", sign(otherSecret, body), body);
    expect(res.statusCode).toBe(401);
    expect(res.json().title).toBe("invalid_signature");
  });

  it("replaying an already-seen delivery id is a no-op, not a duplicate row", async () => {
    const body = { action: "opened", number: 3 };
    const first = await sendWebhook("delivery-replay", sign(webhookSecret, body), body);
    expect(first.statusCode).toBe(200);

    const second = await sendWebhook("delivery-replay", sign(webhookSecret, body), body);
    expect(second.statusCode).toBe(200);
    expect(second.json().status).toBe("duplicate");

    const row = await pool.query(
      "select count(*)::int as n from github_webhook_events where connection_id = $1 and delivery_id = $2",
      [connectionId, "delivery-replay"],
    );
    expect(row.rows[0].n).toBe(1);
  });

  it("returns 404 for an unknown connection", async () => {
    const body = { action: "opened" };
    const res = await app.inject({
      method: "POST",
      url: `/projects/${projectId}/connectors/github/ghc_unknown/webhook`,
      headers: { "x-github-delivery": "delivery-unknown-conn", "x-hub-signature-256": "sha256=whatever" },
      payload: body,
    });
    expect(res.statusCode).toBe(404);
  });

  it("returns 404 when the connection belongs to a different project", async () => {
    const otherProject = await app.inject({
      method: "POST",
      url: "/projects",
      headers: { authorization: `Bearer ${tokenA}`, "idempotency-key": "gh-webhook-other-project" },
      payload: {
        apiVersion: "evolutionos.io/v1alpha1",
        kind: "EvolutionProject",
        metadata: { name: "Other Proj", slug: "proj-gh-webhook-other", type: "idea", status: "discovery" },
        spec: { intent: { problem: "x" } },
      },
    });
    const otherProjectId = otherProject.json().projectId;
    const body = { action: "opened" };
    const res = await app.inject({
      method: "POST",
      url: `/projects/${otherProjectId}/connectors/github/${connectionId}/webhook`,
      headers: { "x-github-delivery": "delivery-wrong-project", "x-hub-signature-256": sign(webhookSecret, body) },
      payload: body,
    });
    expect(res.statusCode).toBe(404);
  });

  it("the same delivery id on two different connections does not collide (dedup is per connection)", async () => {
    const secondConnected = await app.inject({
      method: "POST",
      url: `/projects/${projectId}/connectors/github`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { owner: "acme", repo: "widgets-second-for-dedup" },
    });
    const secondConnectionId = secondConnected.json().connectionId;
    const secondSecret = secondConnected.json().webhookSecret;

    const body = { action: "opened", number: 30 };
    const first = await sendWebhook("delivery-shared-id", sign(webhookSecret, body), body);
    expect(first.statusCode).toBe(200);
    expect(first.json().status).toBe("ingested");

    const second = await app.inject({
      method: "POST",
      url: `/projects/${projectId}/connectors/github/${secondConnectionId}/webhook`,
      headers: { "x-github-delivery": "delivery-shared-id", "x-hub-signature-256": sign(secondSecret, body) },
      payload: body,
    });
    expect(second.statusCode).toBe(200);
    expect(second.json().status).toBe("ingested");

    const row = await pool.query(
      "select count(*)::int as n from github_webhook_events where delivery_id = 'delivery-shared-id'",
    );
    expect(row.rows[0].n).toBe(2);
  });

  it("rejects a request missing the x-github-delivery header", async () => {
    const body = { action: "opened" };
    const res = await app.inject({
      method: "POST",
      url: `/projects/${projectId}/connectors/github/${connectionId}/webhook`,
      headers: { "x-hub-signature-256": sign(webhookSecret, body) },
      payload: body,
    });
    expect(res.statusCode).toBe(422);
  });
});
