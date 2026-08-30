import type { FastifyInstance } from "fastify";
import type { DbPool } from "../platform/db.js";
import { problem, requireScope } from "../http.js";
import { enforceCapability, recordAudit } from "../policy/policy.js";
import { registerProject } from "./registry.js";

export function registerRegistryRoutes(app: FastifyInstance, pool: DbPool): void {
  app.post("/projects", async (req, reply) => {
    const scope = requireScope(req, reply);
    if (!scope) return reply;

    const idempotencyKey = req.headers["idempotency-key"];
    if (typeof idempotencyKey !== "string" || !idempotencyKey) {
      return problem(reply, 422, "missing_idempotency_key", "Idempotency-Key header is required");
    }

    const decision = await enforceCapability(
      pool,
      scope,
      "project.register",
      "projects",
      req.correlationId,
    );
    if (!decision.allowed) {
      return problem(reply, 403, "capability_denied", decision.reason, {
        correlationId: req.correlationId,
      });
    }

    const traceparent = req.headers["traceparent"];
    const outcome = await registerProject(pool, scope, {
      manifest: (req.body ?? {}) as Record<string, unknown>,
      idempotencyKey,
      correlationId: req.correlationId,
      ...(typeof traceparent === "string" ? { traceparent } : {}),
    });

    switch (outcome.kind) {
      case "created":
        return reply.status(201).send({ projectId: outcome.projectId, version: outcome.version });
      case "replayed":
        return reply.status(200).send({ projectId: outcome.projectId, version: outcome.version });
      case "conflict":
        return problem(
          reply,
          409,
          "idempotency_conflict",
          "Idempotency-Key was already used with a different request digest",
        );
      case "invalid":
        return problem(reply, 422, "invalid_manifest", "manifest violates the v0 schema", {
          errors: outcome.errors,
        });
    }
  });

  app.get("/projects", async (req, reply) => {
    const scope = requireScope(req, reply);
    if (!scope) return reply;
    const decision = await enforceCapability(
      pool,
      scope,
      "project.read",
      "projects",
      req.correlationId,
    );
    if (!decision.allowed) {
      return problem(reply, 403, "capability_denied", decision.reason, {
        correlationId: req.correlationId,
      });
    }
    // Leitura da PROJEÇÃO (walking skeleton UI→API→outbox→projection→UI),
    // sempre filtrada pelo escopo da sessão.
    const rows = await pool.query(
      `select project_id, name, type, registered_at from projects_view
        where org_id = $1 and workspace_id = $2
        order by registered_at desc`,
      [scope.orgId, scope.workspaceId],
    );
    return reply.send({ projects: rows.rows });
  });

  app.get("/projects/:id", async (req, reply) => {
    const scope = requireScope(req, reply);
    if (!scope) return reply;
    const { id } = req.params as { id: string };
    const found = await pool.query(
      "select id, org_id, workspace_id, type, name, version from projects where id = $1",
      [id],
    );
    const row = found.rows[0] as
      | { id: string; org_id: string; workspace_id: string; type: string; name: string; version: number }
      | undefined;
    if (!row) {
      return problem(reply, 404, "not_found", "project does not exist");
    }
    if (row.org_id !== scope.orgId) {
      // TRUST-07: negação cross-tenant sempre auditada, sem detalhes do recurso.
      await recordAudit(pool, {
        orgId: scope.orgId,
        actor: scope.userId,
        action: "project.read",
        resource: `projects/${id}`,
        outcome: "denied",
        reason: "cross-tenant access",
        correlationId: req.correlationId,
      });
      return problem(reply, 403, "access_denied", "access denied", {
        correlationId: req.correlationId,
      });
    }
    return reply.send({
      projectId: row.id,
      workspaceId: row.workspace_id,
      type: row.type,
      name: row.name,
      version: row.version,
    });
  });
}
