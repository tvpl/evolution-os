import type { FastifyInstance } from "fastify";
import type { DbPool } from "../platform/db.js";
import { problem, requireScope } from "../http.js";
import { enforceCapability, recordAudit } from "../policy/policy.js";
import { registerProject } from "./registry.js";
import { listHypotheses } from "../idea-memory/hypotheses.js";
import { getProjectOverview } from "../idea-memory/overview.js";
import {
  addArtifactVersion,
  createArtifact,
  getArtifactVersion,
  listArtifacts,
} from "../idea-memory/artifacts.js";
import { listDecisions, recordDecision, type AlternativeInput } from "../idea-memory/decisions.js";
import { getProjectTimeline } from "../idea-memory/timeline.js";
import {
  exportProject,
  importProject,
  validateExport,
  type ExportedProject,
} from "../idea-memory/export-import.js";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { AuthScope } from "../identity/session.js";

/**
 * Checagem de ownership reusada por overview/artifacts/decisions/timeline/
 * export (mesmo padrão 404-antes-de-403 do endpoint de overview): existência
 * primeiro, cross-tenant depois (com auditoria opcional por `action`).
 */
async function requireOwnedProject(
  pool: DbPool,
  req: FastifyRequest,
  reply: FastifyReply,
  projectId: string,
  scope: AuthScope,
  auditAction?: string,
): Promise<boolean> {
  const owner = await pool.query("select org_id from projects where id = $1", [projectId]);
  const ownerRow = owner.rows[0] as { org_id: string } | undefined;
  if (!ownerRow) {
    problem(reply, 404, "not_found", "project does not exist");
    return false;
  }
  if (ownerRow.org_id !== scope.orgId) {
    if (auditAction) {
      await recordAudit(pool, {
        orgId: scope.orgId,
        actor: scope.userId,
        action: auditAction,
        resource: `projects/${projectId}`,
        outcome: "denied",
        reason: "cross-tenant access",
        correlationId: req.correlationId,
      });
    }
    problem(reply, 403, "access_denied", "access denied", { correlationId: req.correlationId });
    return false;
  }
  return true;
}

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

    const outcome = await registerProject(pool, scope, {
      manifest: (req.body ?? {}) as Record<string, unknown>,
      idempotencyKey,
      correlationId: req.correlationId,
      ...(req.traceparent !== undefined ? { traceparent: req.traceparent } : {}),
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
      case "duplicate_hypothesis":
        return problem(
          reply,
          422,
          "duplicate_hypothesis_id",
          `hypothesis id '${outcome.hypothesisId}' is declared more than once in the manifest`,
        );
    }
  });

  app.get("/projects/:id/hypotheses", async (req, reply) => {
    const scope = requireScope(req, reply);
    if (!scope) return reply;
    const { id } = req.params as { id: string };
    const owner = await pool.query("select org_id from projects where id = $1", [id]);
    const ownerRow = owner.rows[0] as { org_id: string } | undefined;
    if (!ownerRow || ownerRow.org_id !== scope.orgId) {
      return problem(reply, 403, "access_denied", "access denied", {
        correlationId: req.correlationId,
      });
    }
    const hypotheses = await listHypotheses(pool, id);
    return reply.send({ hypotheses });
  });

  app.get("/projects/:id/overview", async (req, reply) => {
    const scope = requireScope(req, reply);
    if (!scope) return reply;
    const { id } = req.params as { id: string };

    const owner = await pool.query("select org_id from projects where id = $1", [id]);
    const ownerRow = owner.rows[0] as { org_id: string } | undefined;
    if (!ownerRow) {
      return problem(reply, 404, "not_found", "project does not exist");
    }
    if (ownerRow.org_id !== scope.orgId) {
      await recordAudit(pool, {
        orgId: scope.orgId,
        actor: scope.userId,
        action: "project.overview.read",
        resource: `projects/${id}`,
        outcome: "denied",
        reason: "cross-tenant access",
        correlationId: req.correlationId,
      });
      return problem(reply, 403, "access_denied", "access denied", {
        correlationId: req.correlationId,
      });
    }

    const decision = await enforceCapability(
      pool,
      scope,
      "project.overview.read",
      `projects/${id}`,
      req.correlationId,
    );
    if (!decision.allowed) {
      return problem(reply, 403, "capability_denied", decision.reason, {
        correlationId: req.correlationId,
      });
    }

    const overview = await getProjectOverview(pool, id);
    if (!overview) {
      return problem(reply, 404, "not_found", "project does not exist");
    }
    return reply.send(overview);
  });

  app.post("/projects/:id/artifacts", async (req, reply) => {
    const scope = requireScope(req, reply);
    if (!scope) return reply;
    const { id } = req.params as { id: string };
    if (!(await requireOwnedProject(pool, req, reply, id, scope, "artifact.write"))) return reply;

    const grant = await enforceCapability(pool, scope, "artifact.write", `projects/${id}`, req.correlationId);
    if (!grant.allowed) {
      return problem(reply, 403, "capability_denied", grant.reason, { correlationId: req.correlationId });
    }

    const body = (req.body ?? {}) as { type?: string; title?: string; reference?: string; content?: string };
    if (!body.type || !body.title) {
      return problem(reply, 422, "invalid_artifact", "type and title are required");
    }
    const outcome = await createArtifact(pool, scope, id, {
      type: body.type,
      title: body.title,
      ...(body.reference !== undefined ? { reference: body.reference } : {}),
      ...(body.content !== undefined ? { content: body.content } : {}),
    });
    if (outcome.kind === "invalid") {
      return problem(reply, 422, "invalid_artifact", outcome.reason);
    }
    return reply.status(201).send({ artifactId: outcome.artifactId, version: outcome.version });
  });

  app.get("/projects/:id/artifacts", async (req, reply) => {
    const scope = requireScope(req, reply);
    if (!scope) return reply;
    const { id } = req.params as { id: string };
    if (!(await requireOwnedProject(pool, req, reply, id, scope))) return reply;
    const artifacts = await listArtifacts(pool, id);
    return reply.send({ artifacts });
  });

  app.post("/projects/:id/artifacts/:artifactId/versions", async (req, reply) => {
    const scope = requireScope(req, reply);
    if (!scope) return reply;
    const { id, artifactId } = req.params as { id: string; artifactId: string };
    if (!(await requireOwnedProject(pool, req, reply, id, scope, "artifact.write"))) return reply;

    const grant = await enforceCapability(pool, scope, "artifact.write", `projects/${id}`, req.correlationId);
    if (!grant.allowed) {
      return problem(reply, 403, "capability_denied", grant.reason, { correlationId: req.correlationId });
    }

    const owner = await pool.query("select 1 from artifacts where id = $1 and project_id = $2", [
      artifactId,
      id,
    ]);
    if (!owner.rowCount) {
      return problem(reply, 404, "not_found", "artifact does not exist in this project");
    }

    const body = (req.body ?? {}) as { reference?: string; content?: string };
    const outcome = await addArtifactVersion(pool, artifactId, body);
    if (outcome.kind === "invalid") {
      return problem(reply, 422, "invalid_artifact_version", outcome.reason);
    }
    if (outcome.kind === "not_found") {
      return problem(reply, 404, "not_found", "artifact does not exist");
    }
    return reply.status(201).send({ artifactId, version: outcome.version });
  });

  app.get("/projects/:id/artifacts/:artifactId/versions/:version", async (req, reply) => {
    const scope = requireScope(req, reply);
    if (!scope) return reply;
    const { id, artifactId, version } = req.params as {
      id: string;
      artifactId: string;
      version: string;
    };
    if (!(await requireOwnedProject(pool, req, reply, id, scope))) return reply;

    const owner = await pool.query("select 1 from artifacts where id = $1 and project_id = $2", [
      artifactId,
      id,
    ]);
    if (!owner.rowCount) {
      return problem(reply, 404, "not_found", "artifact does not exist in this project");
    }

    const row = await getArtifactVersion(pool, artifactId, Number(version));
    if (!row) {
      return problem(reply, 404, "not_found", "artifact version does not exist");
    }
    return reply.send(row);
  });

  app.post("/projects/:id/decisions", async (req, reply) => {
    const scope = requireScope(req, reply);
    if (!scope) return reply;
    const { id } = req.params as { id: string };
    if (!(await requireOwnedProject(pool, req, reply, id, scope, "decision.write"))) return reply;

    const grant = await enforceCapability(pool, scope, "decision.write", `projects/${id}`, req.correlationId);
    if (!grant.allowed) {
      return problem(reply, 403, "capability_denied", grant.reason, { correlationId: req.correlationId });
    }

    const body = (req.body ?? {}) as {
      decision?: string;
      rationale?: string;
      alternatives?: AlternativeInput[];
      subjectType?: "hypothesis" | "artifact";
      subjectId?: string;
      reviewTrigger?: string;
    };
    if (!body.decision || !body.rationale) {
      return problem(reply, 422, "invalid_decision", "decision and rationale are required");
    }
    const outcome = await recordDecision(pool, scope, id, {
      decision: body.decision,
      rationale: body.rationale,
      ...(body.alternatives !== undefined ? { alternatives: body.alternatives } : {}),
      ...(body.subjectType !== undefined ? { subjectType: body.subjectType } : {}),
      ...(body.subjectId !== undefined ? { subjectId: body.subjectId } : {}),
      ...(body.reviewTrigger !== undefined ? { reviewTrigger: body.reviewTrigger } : {}),
    });
    if (outcome.kind === "invalid_subject") {
      return problem(
        reply,
        422,
        "invalid_subject_reference",
        "subject does not belong to this project",
      );
    }
    return reply
      .status(201)
      .send({ decision: outcome.decision, priorRelatedDecisions: outcome.priorRelatedDecisions });
  });

  app.get("/projects/:id/decisions", async (req, reply) => {
    const scope = requireScope(req, reply);
    if (!scope) return reply;
    const { id } = req.params as { id: string };
    if (!(await requireOwnedProject(pool, req, reply, id, scope))) return reply;
    const decisions = await listDecisions(pool, id);
    return reply.send({ decisions });
  });

  app.get("/projects/:id/timeline", async (req, reply) => {
    const scope = requireScope(req, reply);
    if (!scope) return reply;
    const { id } = req.params as { id: string };
    if (!(await requireOwnedProject(pool, req, reply, id, scope))) return reply;
    const timeline = await getProjectTimeline(pool, id);
    return reply.send({ timeline });
  });

  app.get("/projects/:id/export", async (req, reply) => {
    const scope = requireScope(req, reply);
    if (!scope) return reply;
    const { id } = req.params as { id: string };
    if (!(await requireOwnedProject(pool, req, reply, id, scope))) return reply;

    const outcome = await exportProject(pool, id);
    if (outcome.kind === "not_found") {
      return problem(reply, 404, "not_found", "project does not exist");
    }
    const check = validateExport(outcome.manifest);
    if (!check.ok) {
      // Nunca deveria acontecer com dados já persistidos — sinal de bug, não de input do usuário.
      return problem(reply, 500, "export_schema_violation", "export failed schema validation", {
        errors: check.errors,
      });
    }
    return reply.send(outcome.manifest);
  });

  app.post("/projects/import", async (req, reply) => {
    const scope = requireScope(req, reply);
    if (!scope) return reply;

    const grant = await enforceCapability(pool, scope, "project.register", "projects", req.correlationId);
    if (!grant.allowed) {
      return problem(reply, 403, "capability_denied", grant.reason, { correlationId: req.correlationId });
    }

    const outcome = await importProject(pool, scope, (req.body ?? {}) as ExportedProject);
    if (outcome.kind === "invalid") {
      return problem(reply, 422, "invalid_manifest", "manifest violates the v0 schema", {
        errors: outcome.errors,
      });
    }
    if (outcome.kind === "conflict") {
      return problem(
        reply,
        409,
        "import_conflict",
        `a project with id '${(req.body as { metadata?: { id?: string } } | undefined)?.metadata?.id}' already exists`,
      );
    }
    return reply.status(201).send({ projectId: outcome.projectId });
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
