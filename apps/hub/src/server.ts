import { randomUUID } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import { contextFromTraceparent, tracer, traceparentOf } from "@evolution-os/telemetry";
import type { DbPool } from "./platform/db.js";
import { problem, requireScope } from "./http.js";
import { signSession, verifySession, type AuthScope } from "./identity/session.js";
import { DEV_TENANTS } from "./identity/seed.js";
import { registerRegistryRoutes } from "./registry/routes.js";
import { registerNodeRoutes } from "./nodes/routes.js";

export interface ServerOptions {
  pool: DbPool;
}

export function buildServer({ pool }: ServerOptions): FastifyInstance {
  const app = Fastify({ logger: false });

  app.addHook("onRequest", async (req) => {
    const header = req.headers["x-correlation-id"];
    req.correlationId = typeof header === "string" && header ? header : `req_${randomUUID()}`;
    // TRUST-10: span do comando HTTP, continuando o trace do cliente quando
    // um traceparent W3C chega; o traceparent do span segue para o outbox.
    const incoming = req.headers["traceparent"];
    const span = tracer().startSpan(
      `http ${req.method} ${req.url.split("?")[0]}`,
      { attributes: { correlationid: req.correlationId, "http.method": req.method } },
      contextFromTraceparent(typeof incoming === "string" ? incoming : undefined),
    );
    req.otelSpan = span;
    req.traceparent = traceparentOf(span) ?? (typeof incoming === "string" ? incoming : undefined);
    // O escopo deriva EXCLUSIVAMENTE do token de sessão; qualquer tenant em
    // header/payload é ignorado (ADR-014).
    const auth = req.headers.authorization;
    const token = auth?.startsWith("Bearer ") ? auth.slice("Bearer ".length) : null;
    req.scope = token ? verifySession(token) : null;
  });

  app.addHook("onSend", async (req, reply) => {
    reply.header("x-correlation-id", req.correlationId);
  });

  app.addHook("onResponse", async (req, reply) => {
    if (req.otelSpan) {
      req.otelSpan.setAttribute("http.status_code", reply.statusCode);
      req.otelSpan.end();
    }
  });

  app.setErrorHandler((err: Error & { statusCode?: number }, req, reply) => {
    const status = typeof err.statusCode === "number" && err.statusCode >= 400 ? err.statusCode : 500;
    return problem(reply, status, err.name || "internal_error", err.message, {
      correlationId: req.correlationId,
    });
  });

  app.get("/healthz", async () => ({ ok: true }));

  app.post("/auth/dev-login", async (req, reply) => {
    const body = (req.body ?? {}) as { email?: string };
    if (!body.email) {
      return problem(reply, 422, "invalid_request", "email is required");
    }
    const user = await pool.query(
      "select u.id as user_id, u.org_id, w.id as workspace_id, u.deactivated_at from users u join workspaces w on w.org_id = u.org_id where u.email = $1",
      [body.email],
    );
    const row = user.rows[0] as
      | { user_id: string; org_id: string; workspace_id: string; deactivated_at: Date | null }
      | undefined;
    if (!row) {
      return problem(reply, 401, "unknown_identity", "no dev user with this email");
    }
    if (row.deactivated_at) {
      // HARD-19: distinto de unknown_identity - o usuário existe, mas foi desprovisionado.
      return problem(reply, 401, "identity_deactivated", "this identity has been deactivated");
    }
    const scope: AuthScope = {
      userId: row.user_id,
      orgId: row.org_id,
      workspaceId: row.workspace_id,
    };
    return reply.send({ token: signSession(scope), scope });
  });

  app.get("/me", async (req, reply) => {
    const scope = requireScope(req, reply);
    if (!scope) return reply;
    return reply.send({ scope });
  });

  registerRegistryRoutes(app, pool);
  registerNodeRoutes(app, pool);

  return app;
}

export { DEV_TENANTS, problem, requireScope };
export type { AuthScope };
