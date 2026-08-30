import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { initTelemetry, InMemorySpanExporter, type Telemetry } from "@evolution-os/telemetry";
import { freshDb } from "./helpers.js";
import { buildServer } from "../src/server.js";
import { seedDevData } from "../src/identity/seed.js";
import { seedDevGrants } from "../src/policy/policy.js";
import { defaultRouter, runDispatcherOnce } from "../src/platform/outbox.js";
import type { DbPool } from "../src/platform/db.js";

let pool: DbPool;
let app: FastifyInstance;
let token: string;
let telemetry: Telemetry;
const exporter = new InMemorySpanExporter();

function manifest(slug: string): Record<string, unknown> {
  return {
    apiVersion: "evolutionos.io/v1alpha1",
    kind: "EvolutionProject",
    metadata: { name: `Projeto ${slug}`, slug, type: "product", status: "discovery" },
    spec: { intent: { problem: "Problema" } },
  };
}

beforeAll(async () => {
  telemetry = initTelemetry(exporter);
  pool = await freshDb("evoos_test_telemetry");
  await seedDevData(pool);
  await seedDevGrants(pool);
  app = buildServer({ pool });
  const res = await app.inject({
    method: "POST",
    url: "/auth/dev-login",
    payload: { email: "dev-a@evolutionos.local" },
  });
  token = res.json().token;
});

afterAll(async () => {
  await app.close();
  await pool.end();
  await telemetry.shutdown();
});

describe("OTel correlation command -> dispatch -> projection (TRUST-10)", () => {
  it("all spans of the walking skeleton share one trace id and carry the correlationid", async () => {
    exporter.reset();
    const res = await app.inject({
      method: "POST",
      url: "/projects",
      headers: {
        authorization: `Bearer ${token}`,
        "idempotency-key": "key-otel-1",
        "x-correlation-id": "req_otel_1",
      },
      payload: manifest("proj-otel"),
    });
    expect(res.statusCode).toBe(201);
    await runDispatcherOnce(pool, defaultRouter());

    const spans = exporter.getFinishedSpans();
    const command = spans.find((s) => s.name === "http POST /projects");
    const consume = spans.find((s) => s.name === "consume projects-view-projector");
    expect(command).toBeDefined();
    expect(consume).toBeDefined();

    // Um único trace do comando à projeção.
    expect(consume!.spanContext().traceId).toBe(command!.spanContext().traceId);

    // correlationid do evento presente como atributo nos dois spans.
    expect(command!.attributes["correlationid"]).toBe("req_otel_1");
    expect(consume!.attributes["correlationid"]).toBe("req_otel_1");
  });

  it("continues a W3C traceparent sent by the client", async () => {
    exporter.reset();
    const clientTraceId = "aaaabbbbccccddddeeeeffff00001111";
    const res = await app.inject({
      method: "POST",
      url: "/projects",
      headers: {
        authorization: `Bearer ${token}`,
        "idempotency-key": "key-otel-2",
        traceparent: `00-${clientTraceId}-1234567890abcdef-01`,
      },
      payload: manifest("proj-otel-client"),
    });
    expect(res.statusCode).toBe(201);
    await runDispatcherOnce(pool, defaultRouter());

    const spans = exporter.getFinishedSpans();
    const command = spans.find((s) => s.name === "http POST /projects");
    const consume = spans.find((s) => s.name === "consume projects-view-projector");
    expect(command!.spanContext().traceId).toBe(clientTraceId);
    expect(consume!.spanContext().traceId).toBe(clientTraceId);
  });

  it("the outbox row persists the traceparent of the command span", async () => {
    exporter.reset();
    const res = await app.inject({
      method: "POST",
      url: "/projects",
      headers: { authorization: `Bearer ${token}`, "idempotency-key": "key-otel-3" },
      payload: manifest("proj-otel-row"),
    });
    const { projectId } = res.json();
    const row = await pool.query("select traceparent from outbox where project_id = $1", [
      projectId,
    ]);
    const spans = exporter.getFinishedSpans();
    const command = spans.find((s) => s.name === "http POST /projects");
    expect(row.rows[0].traceparent).toContain(command!.spanContext().traceId);
  });
});
