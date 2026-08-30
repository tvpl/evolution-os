import { randomUUID } from "node:crypto";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import type { DbPool } from "./platform/db.js";
import { signSession, verifySession, type AuthScope } from "./identity/session.js";
import { DEV_TENANTS } from "./identity/seed.js";

declare module "fastify" {
  interface FastifyRequest {
    scope: AuthScope | null;
    correlationId: string;
  }
}

/** RFC 9457 Problem Details; nunca vaza detalhes de recurso de outro tenant. */
export function problem(
  reply: FastifyReply,
  status: number,
  title: string,
  detail?: string,
  extra?: Record<string, unknown>,
): FastifyReply {
  return reply
    .status(status)
    .header("content-type", "application/problem+json")
    .send({ type: "about:blank", title, status, detail, ...extra });
}

export function requireScope(req: FastifyRequest, reply: FastifyReply): AuthScope | null {
  if (!req.scope) {
    problem(reply, 401, "unauthenticated", "missing or invalid session token");
    return null;
  }
  return req.scope;
}

export interface ServerOptions {
  pool: DbPool;
}

export function buildServer({ pool }: ServerOptions): FastifyInstance {
  const app = Fastify({ logger: false });

  app.addHook("onRequest", async (req) => {
    const header = req.headers["x-correlation-id"];
    req.correlationId = typeof header === "string" && header ? header : `req_${randomUUID()}`;
    // O escopo deriva EXCLUSIVAMENTE do token de sessão; qualquer tenant em
    // header/payload é ignorado (ADR-014).
    const auth = req.headers.authorization;
    const token = auth?.startsWith("Bearer ") ? auth.slice("Bearer ".length) : null;
    req.scope = token ? verifySession(token) : null;
  });

  app.addHook("onSend", async (req, reply) => {
    reply.header("x-correlation-id", req.correlationId);
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
      "select u.id as user_id, u.org_id, w.id as workspace_id from users u join workspaces w on w.org_id = u.org_id where u.email = $1",
      [body.email],
    );
    const row = user.rows[0] as
      | { user_id: string; org_id: string; workspace_id: string }
      | undefined;
    if (!row) {
      return problem(reply, 401, "unknown_identity", "no dev user with this email");
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

  return app;
}

export { DEV_TENANTS };
export type { AuthScope };
