import type { FastifyReply, FastifyRequest } from "fastify";
import type { AuthScope } from "./identity/session.js";

import type { Span } from "@evolution-os/telemetry";

declare module "fastify" {
  interface FastifyRequest {
    scope: AuthScope | null;
    correlationId: string;
    /** traceparent do span ativo desta requisição (propagado ao outbox). */
    traceparent: string | undefined;
    otelSpan: Span | undefined;
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
