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
import { authenticateNode } from "../nodes/auth.js";
import { ingestSnapshot, listSnapshots, type SnapshotInput } from "../twin/snapshots.js";
import { confirmCandidate, listCandidates, rejectCandidate } from "../twin/candidates.js";
import { computeDiff } from "../twin/diff.js";
import { activateEvidence, createEvidence, listEvidence } from "../evolution/evidence.js";
import { createClaim, listClaims } from "../evolution/claims.js";
import { linkSignal, listSignals } from "../evolution/signals.js";
import { createProposal, listProposals, moveProposalToReady } from "../evolution/proposals.js";
import {
  startExperiment,
  getExperiment,
  attachProofArtifact,
  listProofArtifacts,
  submitEvaluation,
  closeExperiment,
  type Variant,
  type VerificationPlan,
} from "../evolution/experiments.js";
import {
  connectGitHub,
  ingestWebhook,
  createGitHubAction,
  recordCiStatus,
} from "../evolution/github-connector.js";
import {
  declareInventory,
  getCurrentInventory,
  declareEvalCase,
  listEvalCases,
  runEval,
  evaluateExperimentFromEvalRun,
  getHarnessObservatory,
  type InventoryComponent,
  type InvariantType,
} from "../evolution/harness.js";
import {
  publishModule,
  getModuleVersion,
  listModules,
  installModule,
  getProjectLockfile,
  updateModule,
  quarantineInstallation,
  rollbackInstallation,
  uninstallModule,
} from "../evolution/modules.js";
import { declareRelation, listRelations } from "../evolution/portfolio.js";

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

/** EXP-02: exige exatamente 2 variantes, cada uma com id e name string. */
function isValidVariants(variants: unknown): variants is Variant[] {
  if (!Array.isArray(variants) || variants.length !== 2) return false;
  return variants.every(
    (v) =>
      v !== null &&
      typeof v === "object" &&
      typeof (v as Record<string, unknown>).id === "string" &&
      typeof (v as Record<string, unknown>).name === "string",
  );
}

/** EXP-03: exige todos os 5 campos do plano de verificação, com tipos válidos. */
function isValidVerificationPlan(plan: unknown): plan is VerificationPlan {
  if (plan === null || typeof plan !== "object") return false;
  const p = plan as Record<string, unknown>;
  return (
    typeof p.hypothesis === "string" &&
    p.hypothesis.length > 0 &&
    typeof p.baselineMetric === "string" &&
    p.baselineMetric.length > 0 &&
    typeof p.threshold === "number" &&
    Number.isFinite(p.threshold) &&
    (p.comparison === "gte" || p.comparison === "lte") &&
    typeof p.observationWindow === "string" &&
    p.observationWindow.length > 0
  );
}

/** EXP-08/09/10: exige um número finito ou `null` explícito. */
function isValidObservedValue(value: unknown): value is number | null {
  if (value === null) return true;
  return typeof value === "number" && Number.isFinite(value);
}

/** GH-08: exige `issue`, `branch` ou `draftPr` — nunca merge/deploy. */
const GITHUB_ACTION_TYPES = new Set(["issue", "branch", "draftPr"]);
function isValidActionType(value: unknown): value is "issue" | "branch" | "draftPr" {
  return typeof value === "string" && GITHUB_ACTION_TYPES.has(value);
}

/** HRN-01: cada componente do inventário exige id/name/version como string. */
function isValidComponentArray(value: unknown): value is InventoryComponent[] {
  if (!Array.isArray(value)) return false;
  return value.every(
    (v) =>
      v !== null &&
      typeof v === "object" &&
      typeof (v as Record<string, unknown>).id === "string" &&
      typeof (v as Record<string, unknown>).name === "string" &&
      typeof (v as Record<string, unknown>).version === "string",
  );
}

const INVARIANT_TYPES = new Set<InvariantType>([
  "requires_skill",
  "requires_mcp",
  "forbids_mcp",
  "min_component_count",
]);
const INVENTORY_CATEGORIES = new Set(["skills", "mcps", "models"]);

/** HRN-05: exige `invariantType` fechado e `params` compatível com o tipo. */
function isValidEvalCaseParams(invariantType: unknown, params: unknown): params is Record<string, unknown> {
  if (typeof invariantType !== "string" || !INVARIANT_TYPES.has(invariantType as InvariantType)) return false;
  if (params === null || typeof params !== "object") return false;
  const p = params as Record<string, unknown>;
  switch (invariantType as InvariantType) {
    case "requires_skill":
      return typeof p.skillId === "string" && p.skillId.length > 0;
    case "requires_mcp":
    case "forbids_mcp":
      return typeof p.mcpId === "string" && p.mcpId.length > 0;
    case "min_component_count":
      return (
        typeof p.category === "string" &&
        INVENTORY_CATEGORIES.has(p.category) &&
        typeof p.min === "number" &&
        Number.isFinite(p.min)
      );
  }
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
      subjectType?: "hypothesis" | "artifact" | "proposal";
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

  app.post("/projects/:id/snapshots", async (req, reply) => {
    const { id } = req.params as { id: string };
    const nodeIdHeader = req.headers["x-node-id"];
    const nodeId = typeof nodeIdHeader === "string" ? nodeIdHeader : "";
    const identity = nodeId ? await authenticateNode(pool, nodeId, req.headers["x-node-token"]) : null;
    if (!identity) {
      return problem(reply, 401, "node_unauthorized", "node is not enrolled");
    }
    const owner = await pool.query("select org_id from projects where id = $1", [id]);
    const ownerRow = owner.rows[0] as { org_id: string } | undefined;
    if (!ownerRow) {
      return problem(reply, 404, "not_found", "project does not exist");
    }
    if (ownerRow.org_id !== identity.orgId) {
      return problem(reply, 403, "access_denied", "node's tenant does not match the project");
    }
    const body = (req.body ?? {}) as Partial<SnapshotInput>;
    if (!Array.isArray(body.manifests) || typeof body.languages !== "object" || !body.languages) {
      return problem(reply, 422, "invalid_snapshot", "manifests and languages are required");
    }
    const result = await ingestSnapshot(
      pool,
      { userId: "node", orgId: identity.orgId, workspaceId: identity.workspaceId },
      id,
      nodeId,
      {
        branch: body.branch ?? null,
        commitSha: body.commitSha ?? null,
        manifests: body.manifests,
        languages: body.languages,
      },
    );
    return reply.status(201).send(result);
  });

  app.get("/projects/:id/snapshots", async (req, reply) => {
    const scope = requireScope(req, reply);
    if (!scope) return reply;
    const { id } = req.params as { id: string };
    if (!(await requireOwnedProject(pool, req, reply, id, scope))) return reply;
    const decision = await enforceCapability(pool, scope, "twin.read", `projects/${id}`, req.correlationId);
    if (!decision.allowed) {
      return problem(reply, 403, "capability_denied", decision.reason, { correlationId: req.correlationId });
    }
    const snapshots = await listSnapshots(pool, id);
    return reply.send({ snapshots });
  });

  app.get("/projects/:id/candidates", async (req, reply) => {
    const scope = requireScope(req, reply);
    if (!scope) return reply;
    const { id } = req.params as { id: string };
    if (!(await requireOwnedProject(pool, req, reply, id, scope))) return reply;
    const decision = await enforceCapability(pool, scope, "twin.read", `projects/${id}`, req.correlationId);
    if (!decision.allowed) {
      return problem(reply, 403, "capability_denied", decision.reason, { correlationId: req.correlationId });
    }
    const candidates = await listCandidates(pool, id);
    return reply.send({ candidates });
  });

  app.post("/projects/:id/candidates/:candidateId/confirm", async (req, reply) => {
    const scope = requireScope(req, reply);
    if (!scope) return reply;
    const { id, candidateId } = req.params as { id: string; candidateId: string };
    if (!(await requireOwnedProject(pool, req, reply, id, scope, "candidate.decide"))) return reply;
    const grant = await enforceCapability(pool, scope, "candidate.decide", `projects/${id}`, req.correlationId);
    if (!grant.allowed) {
      return problem(reply, 403, "capability_denied", grant.reason, { correlationId: req.correlationId });
    }
    const outcome = await confirmCandidate(pool, scope, id, candidateId);
    if (outcome.kind === "not_found") {
      return problem(reply, 404, "not_found", "candidate does not exist in this project");
    }
    if (outcome.kind === "not_pending") {
      return problem(reply, 409, "candidate_not_pending", "candidate has already been decided");
    }
    return reply.send({ candidate: outcome.candidate });
  });

  app.post("/projects/:id/candidates/:candidateId/reject", async (req, reply) => {
    const scope = requireScope(req, reply);
    if (!scope) return reply;
    const { id, candidateId } = req.params as { id: string; candidateId: string };
    if (!(await requireOwnedProject(pool, req, reply, id, scope, "candidate.decide"))) return reply;
    const grant = await enforceCapability(pool, scope, "candidate.decide", `projects/${id}`, req.correlationId);
    if (!grant.allowed) {
      return problem(reply, 403, "capability_denied", grant.reason, { correlationId: req.correlationId });
    }
    const body = (req.body ?? {}) as { reason?: string };
    const outcome = await rejectCandidate(pool, id, candidateId, body.reason);
    if (outcome.kind === "not_found") {
      return problem(reply, 404, "not_found", "candidate does not exist in this project");
    }
    if (outcome.kind === "not_pending") {
      return problem(reply, 409, "candidate_not_pending", "candidate has already been decided");
    }
    return reply.send({ candidate: outcome.candidate });
  });

  app.get("/projects/:id/diff", async (req, reply) => {
    const scope = requireScope(req, reply);
    if (!scope) return reply;
    const { id } = req.params as { id: string };
    if (!(await requireOwnedProject(pool, req, reply, id, scope))) return reply;
    const diff = await computeDiff(pool, id);
    if (!diff) {
      return problem(reply, 404, "not_found", "project does not exist");
    }
    return reply.send(diff);
  });

  app.post("/projects/:id/evidence", async (req, reply) => {
    const scope = requireScope(req, reply);
    if (!scope) return reply;
    const { id } = req.params as { id: string };
    if (!(await requireOwnedProject(pool, req, reply, id, scope, "evidence.write"))) return reply;
    const grant = await enforceCapability(pool, scope, "evidence.write", `projects/${id}`, req.correlationId);
    if (!grant.allowed) {
      return problem(reply, 403, "capability_denied", grant.reason, { correlationId: req.correlationId });
    }
    const body = (req.body ?? {}) as {
      type?: "humanStatement" | "referenceOnly";
      statement?: string;
      sourceReference?: string;
      sourceType?: string;
      sourceAuthority?: string;
    };
    if (!body.type) {
      return problem(reply, 422, "invalid_evidence", "type is required");
    }
    const outcome = await createEvidence(pool, scope, id, {
      type: body.type,
      ...(body.statement !== undefined ? { statement: body.statement } : {}),
      ...(body.sourceReference !== undefined ? { sourceReference: body.sourceReference } : {}),
      ...(body.sourceType !== undefined ? { sourceType: body.sourceType } : {}),
      ...(body.sourceAuthority !== undefined ? { sourceAuthority: body.sourceAuthority } : {}),
    });
    if (outcome.kind === "invalid") {
      return problem(reply, 422, "invalid_evidence", outcome.reason);
    }
    return reply.status(201).send({ evidenceId: outcome.evidenceId, status: "quarantine" });
  });

  app.post("/projects/:id/evidence/:evidenceId/activate", async (req, reply) => {
    const scope = requireScope(req, reply);
    if (!scope) return reply;
    const { id, evidenceId } = req.params as { id: string; evidenceId: string };
    if (!(await requireOwnedProject(pool, req, reply, id, scope, "evidence.write"))) return reply;
    const grant = await enforceCapability(pool, scope, "evidence.write", `projects/${id}`, req.correlationId);
    if (!grant.allowed) {
      return problem(reply, 403, "capability_denied", grant.reason, { correlationId: req.correlationId });
    }
    const outcome = await activateEvidence(pool, id, evidenceId);
    if (outcome.kind === "not_found") {
      return problem(reply, 404, "not_found", "evidence does not exist in this project");
    }
    return reply.send({ evidenceId, status: "active" });
  });

  app.get("/projects/:id/evidence", async (req, reply) => {
    const scope = requireScope(req, reply);
    if (!scope) return reply;
    const { id } = req.params as { id: string };
    if (!(await requireOwnedProject(pool, req, reply, id, scope))) return reply;
    const evidence = await listEvidence(pool, id);
    return reply.send({ evidence });
  });

  app.post("/projects/:id/claims", async (req, reply) => {
    const scope = requireScope(req, reply);
    if (!scope) return reply;
    const { id } = req.params as { id: string };
    if (!(await requireOwnedProject(pool, req, reply, id, scope, "claim.write"))) return reply;
    const grant = await enforceCapability(pool, scope, "claim.write", `projects/${id}`, req.correlationId);
    if (!grant.allowed) {
      return problem(reply, 403, "capability_denied", grant.reason, { correlationId: req.correlationId });
    }
    const body = (req.body ?? {}) as {
      statement?: string;
      epistemicType?: "fact" | "inference" | "hypothesis";
      evidenceIds?: string[];
    };
    if (!body.statement || !body.epistemicType) {
      return problem(reply, 422, "invalid_claim", "statement and epistemicType are required");
    }
    const outcome = await createClaim(pool, scope, id, {
      statement: body.statement,
      epistemicType: body.epistemicType,
      evidenceIds: body.evidenceIds ?? [],
    });
    switch (outcome.kind) {
      case "invalid":
        return problem(reply, 422, "claim_requires_evidence", outcome.reason);
      case "invalid_evidence_reference":
        return problem(
          reply,
          422,
          "invalid_evidence_reference",
          `evidence '${outcome.evidenceId}' does not belong to this project`,
        );
      case "evidence_not_active":
        return problem(
          reply,
          422,
          "evidence_not_active",
          `evidence '${outcome.evidenceId}' is not active yet`,
        );
      case "created":
        return reply.status(201).send({ claimId: outcome.claimId });
    }
  });

  app.get("/projects/:id/claims", async (req, reply) => {
    const scope = requireScope(req, reply);
    if (!scope) return reply;
    const { id } = req.params as { id: string };
    if (!(await requireOwnedProject(pool, req, reply, id, scope))) return reply;
    const claims = await listClaims(pool, id);
    return reply.send({ claims });
  });

  app.post("/projects/:id/signals", async (req, reply) => {
    const scope = requireScope(req, reply);
    if (!scope) return reply;
    const { id } = req.params as { id: string };
    if (!(await requireOwnedProject(pool, req, reply, id, scope, "signal.write"))) return reply;
    const grant = await enforceCapability(pool, scope, "signal.write", `projects/${id}`, req.correlationId);
    if (!grant.allowed) {
      return problem(reply, 403, "capability_denied", grant.reason, { correlationId: req.correlationId });
    }
    const body = (req.body ?? {}) as { claimId?: string };
    if (!body.claimId) {
      return problem(reply, 422, "invalid_signal", "claimId is required");
    }
    const outcome = await linkSignal(pool, scope, id, body.claimId);
    if (outcome.kind === "invalid_claim_reference") {
      return problem(reply, 422, "invalid_claim_reference", `claim '${body.claimId}' does not belong to this project`);
    }
    const status = outcome.kind === "created" ? 201 : 200;
    return reply.status(status).send({
      signalId: outcome.signalId,
      evidenceStrength: outcome.evidenceStrength,
      confidence: outcome.confidence,
    });
  });

  app.get("/projects/:id/signals", async (req, reply) => {
    const scope = requireScope(req, reply);
    if (!scope) return reply;
    const { id } = req.params as { id: string };
    if (!(await requireOwnedProject(pool, req, reply, id, scope))) return reply;
    const signals = await listSignals(pool, id);
    return reply.send({ signals });
  });

  app.post("/projects/:id/proposals", async (req, reply) => {
    const scope = requireScope(req, reply);
    if (!scope) return reply;
    const { id } = req.params as { id: string };
    if (!(await requireOwnedProject(pool, req, reply, id, scope, "proposal.write"))) return reply;
    const grant = await enforceCapability(pool, scope, "proposal.write", `projects/${id}`, req.correlationId);
    if (!grant.allowed) {
      return problem(reply, 403, "capability_denied", grant.reason, { correlationId: req.correlationId });
    }
    const body = (req.body ?? {}) as {
      title?: string;
      summary?: string;
      proposalType?: string;
      whyNow?: string;
      costOfInaction?: string;
      alternatives?: { id: string; type: string; title?: string }[];
      recommendedAlternativeId?: string;
      impact?: Record<string, unknown>;
      signalId?: string;
      investigationState?: string;
    };
    if (!body.title || !body.summary || !body.proposalType) {
      return problem(reply, 422, "invalid_proposal", "title, summary and proposalType are required");
    }
    const outcome = await createProposal(pool, scope, id, {
      title: body.title,
      summary: body.summary,
      proposalType: body.proposalType,
      ...(body.whyNow !== undefined ? { whyNow: body.whyNow } : {}),
      ...(body.costOfInaction !== undefined ? { costOfInaction: body.costOfInaction } : {}),
      ...(body.alternatives !== undefined ? { alternatives: body.alternatives } : {}),
      ...(body.recommendedAlternativeId !== undefined
        ? { recommendedAlternativeId: body.recommendedAlternativeId }
        : {}),
      ...(body.impact !== undefined ? { impact: body.impact } : {}),
      ...(body.signalId !== undefined ? { signalId: body.signalId } : {}),
      ...(body.investigationState !== undefined ? { investigationState: body.investigationState } : {}),
    });
    switch (outcome.kind) {
      case "requires_evidence":
        return problem(
          reply,
          422,
          "proposal_requires_evidence",
          "a proposal needs a signalId (claim-backed) or an explicit investigationState",
        );
      case "invalid_signal_reference":
        return problem(
          reply,
          422,
          "invalid_signal_reference",
          `signal '${body.signalId}' does not belong to this project`,
        );
      case "created":
        return reply.status(201).send({
          proposalId: outcome.proposalId,
          status: "draft",
          priorRelatedDecisions: outcome.priorRelatedDecisions,
        });
    }
  });

  app.post("/projects/:id/proposals/:proposalId/ready", async (req, reply) => {
    const scope = requireScope(req, reply);
    if (!scope) return reply;
    const { id, proposalId } = req.params as { id: string; proposalId: string };
    if (!(await requireOwnedProject(pool, req, reply, id, scope, "proposal.write"))) return reply;
    const grant = await enforceCapability(pool, scope, "proposal.write", `projects/${id}`, req.correlationId);
    if (!grant.allowed) {
      return problem(reply, 403, "capability_denied", grant.reason, { correlationId: req.correlationId });
    }
    const outcome = await moveProposalToReady(pool, id, proposalId);
    switch (outcome.kind) {
      case "not_found":
        return problem(reply, 404, "not_found", "proposal does not exist in this project");
      case "invalid_transition":
        return problem(reply, 409, "invalid_transition", "proposal is not in draft status");
      case "ready":
        return reply.send({ proposalId, status: "readyForReview", challengerFindings: outcome.findings });
    }
  });

  app.get("/projects/:id/proposals", async (req, reply) => {
    const scope = requireScope(req, reply);
    if (!scope) return reply;
    const { id } = req.params as { id: string };
    if (!(await requireOwnedProject(pool, req, reply, id, scope))) return reply;
    const { status } = req.query as { status?: string };
    const proposals = await listProposals(pool, id, status);
    return reply.send({ proposals });
  });

  app.post("/projects/:id/proposals/:proposalId/experiments", async (req, reply) => {
    const scope = requireScope(req, reply);
    if (!scope) return reply;
    const { id, proposalId } = req.params as { id: string; proposalId: string };
    if (!(await requireOwnedProject(pool, req, reply, id, scope, "experiment.write"))) return reply;
    const grant = await enforceCapability(pool, scope, "experiment.write", `projects/${id}`, req.correlationId);
    if (!grant.allowed) {
      return problem(reply, 403, "capability_denied", grant.reason, { correlationId: req.correlationId });
    }
    const body = (req.body ?? {}) as {
      variants?: unknown;
      verificationPlan?: unknown;
      environment?: Record<string, unknown>;
    };
    if (!isValidVariants(body.variants)) {
      return problem(reply, 422, "invalid_variants", "exactly 2 variants with id and name are required");
    }
    if (!isValidVerificationPlan(body.verificationPlan)) {
      return problem(
        reply,
        422,
        "invalid_verification_plan",
        "hypothesis, baselineMetric, threshold, comparison and observationWindow are required",
      );
    }
    const outcome = await startExperiment(pool, scope, id, proposalId, {
      variants: body.variants,
      verificationPlan: body.verificationPlan,
      ...(body.environment !== undefined ? { environment: body.environment } : {}),
    });
    switch (outcome.kind) {
      case "not_found":
        return problem(reply, 404, "not_found", "proposal does not exist in this project");
      case "invalid_transition":
        return problem(reply, 409, "invalid_transition", "proposal is not in readyForReview status");
      case "started":
        return reply
          .status(201)
          .send({ experimentId: outcome.experimentId, status: "running", proposalDigest: outcome.digest });
    }
  });

  app.get("/projects/:id/experiments/:experimentId", async (req, reply) => {
    const scope = requireScope(req, reply);
    if (!scope) return reply;
    const { id, experimentId } = req.params as { id: string; experimentId: string };
    if (!(await requireOwnedProject(pool, req, reply, id, scope))) return reply;
    const experiment = await getExperiment(pool, id, experimentId);
    if (!experiment) {
      return problem(reply, 404, "not_found", "experiment does not exist in this project");
    }
    return reply.send(experiment);
  });

  app.post("/projects/:id/experiments/:experimentId/artifacts", async (req, reply) => {
    const scope = requireScope(req, reply);
    if (!scope) return reply;
    const { id, experimentId } = req.params as { id: string; experimentId: string };
    if (!(await requireOwnedProject(pool, req, reply, id, scope, "experiment.write"))) return reply;
    const grant = await enforceCapability(pool, scope, "experiment.write", `projects/${id}`, req.correlationId);
    if (!grant.allowed) {
      return problem(reply, 403, "capability_denied", grant.reason, { correlationId: req.correlationId });
    }
    const body = (req.body ?? {}) as { artifactId?: string };
    if (!body.artifactId) {
      return problem(reply, 422, "invalid_artifact_reference", "artifactId is required");
    }
    const outcome = await attachProofArtifact(pool, id, experimentId, body.artifactId);
    switch (outcome.kind) {
      case "not_found":
        return problem(reply, 404, "not_found", "experiment does not exist in this project");
      case "invalid_transition":
        return problem(reply, 409, "invalid_transition", "experiment is not running");
      case "invalid_artifact_reference":
        return problem(
          reply,
          422,
          "invalid_artifact_reference",
          `artifact '${body.artifactId}' does not belong to this project`,
        );
      case "attached":
        return reply.status(201).send({ experimentId, artifactId: body.artifactId });
    }
  });

  app.get("/projects/:id/experiments/:experimentId/artifacts", async (req, reply) => {
    const scope = requireScope(req, reply);
    if (!scope) return reply;
    const { id, experimentId } = req.params as { id: string; experimentId: string };
    if (!(await requireOwnedProject(pool, req, reply, id, scope))) return reply;
    const experiment = await getExperiment(pool, id, experimentId);
    if (!experiment) {
      return problem(reply, 404, "not_found", "experiment does not exist in this project");
    }
    const artifacts = await listProofArtifacts(pool, experimentId);
    return reply.send({ artifacts });
  });

  app.post("/projects/:id/experiments/:experimentId/evaluate", async (req, reply) => {
    const scope = requireScope(req, reply);
    if (!scope) return reply;
    const { id, experimentId } = req.params as { id: string; experimentId: string };
    if (!(await requireOwnedProject(pool, req, reply, id, scope, "experiment.write"))) return reply;
    const grant = await enforceCapability(pool, scope, "experiment.write", `projects/${id}`, req.correlationId);
    if (!grant.allowed) {
      return problem(reply, 403, "capability_denied", grant.reason, { correlationId: req.correlationId });
    }
    const body = (req.body ?? {}) as { observedValue?: unknown };
    if (!("observedValue" in body)) {
      return problem(reply, 422, "invalid_observation", "observedValue is required (a finite number or null)");
    }
    if (!isValidObservedValue(body.observedValue)) {
      return problem(reply, 422, "invalid_observation", "observedValue must be a finite number or null");
    }
    const outcome = await submitEvaluation(pool, id, experimentId, body.observedValue);
    switch (outcome.kind) {
      case "not_found":
        return problem(reply, 404, "not_found", "experiment does not exist in this project");
      case "invalid_transition":
        return problem(reply, 409, "invalid_transition", "experiment is not running");
      case "evaluated":
        return reply.send({
          experimentId,
          status: "evaluated",
          verdict: outcome.verdict,
          rationale: outcome.rationale,
        });
    }
  });

  app.post("/projects/:id/experiments/:experimentId/close", async (req, reply) => {
    const scope = requireScope(req, reply);
    if (!scope) return reply;
    const { id, experimentId } = req.params as { id: string; experimentId: string };
    if (!(await requireOwnedProject(pool, req, reply, id, scope, "experiment.write"))) return reply;
    const grant = await enforceCapability(pool, scope, "experiment.write", `projects/${id}`, req.correlationId);
    if (!grant.allowed) {
      return problem(reply, 403, "capability_denied", grant.reason, { correlationId: req.correlationId });
    }
    const body = (req.body ?? {}) as { decision?: string; rationale?: string };
    if (!body.decision || !body.rationale) {
      return problem(reply, 422, "invalid_decision", "decision and rationale are required");
    }
    const outcome = await closeExperiment(pool, scope, id, experimentId, {
      decision: body.decision,
      rationale: body.rationale,
    });
    switch (outcome.kind) {
      case "not_found":
        return problem(reply, 404, "not_found", "experiment does not exist in this project");
      case "invalid_transition":
        return problem(reply, 409, "invalid_transition", "experiment is not evaluated");
      case "closed":
        return reply.send({
          experimentId,
          status: "closed",
          decision: outcome.decision,
          priorRelatedDecisions: outcome.priorRelatedDecisions,
        });
    }
  });

  app.post("/projects/:id/connectors/github", async (req, reply) => {
    const scope = requireScope(req, reply);
    if (!scope) return reply;
    const { id } = req.params as { id: string };
    if (!(await requireOwnedProject(pool, req, reply, id, scope, "connector.write"))) return reply;
    const grant = await enforceCapability(pool, scope, "connector.write", `projects/${id}`, req.correlationId);
    if (!grant.allowed) {
      return problem(reply, 403, "capability_denied", grant.reason, { correlationId: req.correlationId });
    }
    const body = (req.body ?? {}) as { owner?: string; repo?: string };
    if (!body.owner || !body.repo) {
      return problem(reply, 422, "invalid_connection", "owner and repo are required");
    }
    const outcome = await connectGitHub(pool, scope, id, { owner: body.owner, repo: body.repo });
    switch (outcome.kind) {
      case "already_connected":
        return problem(
          reply,
          409,
          "already_connected",
          `${body.owner}/${body.repo} is already connected to this project`,
        );
      case "connected":
        return reply.status(201).send({
          connectionId: outcome.connectionId,
          status: "connected",
          webhookSecret: outcome.webhookSecret,
        });
    }
  });

  // Rota deliberadamente sem requireScope: um webhook real do GitHub nunca
  // carrega um Bearer token nosso. Ver comentário em ingestWebhook.
  app.post("/projects/:id/connectors/github/:connectionId/webhook", async (req, reply) => {
    const { id, connectionId } = req.params as { id: string; connectionId: string };
    const deliveryIdHeader = req.headers["x-github-delivery"];
    if (typeof deliveryIdHeader !== "string" || !deliveryIdHeader) {
      return problem(reply, 422, "invalid_webhook", "x-github-delivery header is required");
    }
    const signatureHeader = req.headers["x-hub-signature-256"];
    const outcome = await ingestWebhook(
      pool,
      id,
      connectionId,
      deliveryIdHeader,
      typeof signatureHeader === "string" ? signatureHeader : undefined,
      req.body ?? {},
    );
    switch (outcome.kind) {
      case "not_found":
        return problem(reply, 404, "not_found", "connection does not exist in this project");
      case "invalid_signature":
        return problem(reply, 401, "invalid_signature", "webhook signature does not match");
      case "duplicate":
        return reply.status(200).send({ status: "duplicate" });
      case "ingested":
        return reply.status(200).send({ status: "ingested" });
    }
  });

  app.post("/projects/:id/connectors/github/actions", async (req, reply) => {
    const scope = requireScope(req, reply);
    if (!scope) return reply;
    const { id } = req.params as { id: string };
    if (!(await requireOwnedProject(pool, req, reply, id, scope, "connector.github.write"))) return reply;
    const grant = await enforceCapability(
      pool,
      scope,
      "connector.github.write",
      `projects/${id}`,
      req.correlationId,
    );
    if (!grant.allowed) {
      return problem(reply, 403, "capability_denied", grant.reason, { correlationId: req.correlationId });
    }
    const idempotencyKey = req.headers["idempotency-key"];
    if (typeof idempotencyKey !== "string" || !idempotencyKey) {
      return problem(reply, 422, "missing_idempotency_key", "Idempotency-Key header is required");
    }
    const body = (req.body ?? {}) as {
      connectionId?: string;
      actionType?: unknown;
      title?: string;
      proposalId?: string;
      experimentId?: string;
    };
    if (!isValidActionType(body.actionType)) {
      return problem(reply, 422, "invalid_action_type", "actionType must be issue, branch, or draftPr");
    }
    if (!body.connectionId || !body.title) {
      return problem(reply, 422, "invalid_action", "connectionId and title are required");
    }
    const outcome = await createGitHubAction(pool, scope, id, {
      connectionId: body.connectionId,
      actionType: body.actionType,
      title: body.title,
      idempotencyKey,
      ...(body.proposalId !== undefined ? { proposalId: body.proposalId } : {}),
      ...(body.experimentId !== undefined ? { experimentId: body.experimentId } : {}),
    });
    switch (outcome.kind) {
      case "invalid_connection_reference":
        return problem(
          reply,
          422,
          "invalid_connection_reference",
          `connection '${body.connectionId}' does not belong to this project`,
        );
      case "conflict":
        return problem(
          reply,
          409,
          "idempotency_conflict",
          "Idempotency-Key was already used with a different request digest",
        );
      case "created":
        return reply.status(201).send({ actionId: outcome.actionId, externalRef: outcome.externalRef });
      case "replayed":
        return reply.status(200).send({ actionId: outcome.actionId, externalRef: outcome.externalRef });
    }
  });

  app.post("/projects/:id/connectors/github/actions/:actionId/ci-status", async (req, reply) => {
    const scope = requireScope(req, reply);
    if (!scope) return reply;
    const { id, actionId } = req.params as { id: string; actionId: string };
    if (!(await requireOwnedProject(pool, req, reply, id, scope, "connector.github.write"))) return reply;
    const grant = await enforceCapability(
      pool,
      scope,
      "connector.github.write",
      `projects/${id}`,
      req.correlationId,
    );
    if (!grant.allowed) {
      return problem(reply, 403, "capability_denied", grant.reason, { correlationId: req.correlationId });
    }
    const body = (req.body ?? {}) as { context?: string; state?: string; targetUrl?: string };
    if (!body.context || !body.state) {
      return problem(reply, 422, "invalid_ci_status", "context and state are required");
    }
    const outcome = await recordCiStatus(pool, scope, id, actionId, {
      context: body.context,
      state: body.state,
      ...(body.targetUrl !== undefined ? { targetUrl: body.targetUrl } : {}),
    });
    switch (outcome.kind) {
      case "not_found":
        return problem(reply, 404, "not_found", "action does not exist in this project");
      case "recorded":
        return reply.status(201).send({ actionId, artifactAttached: outcome.artifactAttached });
    }
  });

  app.post("/projects/:id/harness/inventory", async (req, reply) => {
    const scope = requireScope(req, reply);
    if (!scope) return reply;
    const { id } = req.params as { id: string };
    if (!(await requireOwnedProject(pool, req, reply, id, scope, "harness.write"))) return reply;
    const grant = await enforceCapability(pool, scope, "harness.write", `projects/${id}`, req.correlationId);
    if (!grant.allowed) {
      return problem(reply, 403, "capability_denied", grant.reason, { correlationId: req.correlationId });
    }
    const body = (req.body ?? {}) as { skills?: unknown; mcps?: unknown; models?: unknown };
    if (
      !isValidComponentArray(body.skills) ||
      !isValidComponentArray(body.mcps) ||
      !isValidComponentArray(body.models)
    ) {
      return problem(
        reply,
        422,
        "invalid_inventory",
        "skills, mcps and models must be arrays of {id, name, version}",
      );
    }
    const outcome = await declareInventory(pool, scope, id, {
      skills: body.skills,
      mcps: body.mcps,
      models: body.models,
    });
    return reply.status(201).send({ version: outcome.version, status: "declared" });
  });

  app.get("/projects/:id/harness/inventory", async (req, reply) => {
    const scope = requireScope(req, reply);
    if (!scope) return reply;
    const { id } = req.params as { id: string };
    if (!(await requireOwnedProject(pool, req, reply, id, scope))) return reply;
    const inventory = await getCurrentInventory(pool, id);
    if (!inventory) {
      return problem(reply, 404, "not_found", "no inventory declared for this harness yet");
    }
    return reply.send(inventory);
  });

  app.post("/projects/:id/harness/eval-cases", async (req, reply) => {
    const scope = requireScope(req, reply);
    if (!scope) return reply;
    const { id } = req.params as { id: string };
    if (!(await requireOwnedProject(pool, req, reply, id, scope, "harness.write"))) return reply;
    const grant = await enforceCapability(pool, scope, "harness.write", `projects/${id}`, req.correlationId);
    if (!grant.allowed) {
      return problem(reply, 403, "capability_denied", grant.reason, { correlationId: req.correlationId });
    }
    const body = (req.body ?? {}) as { name?: string; invariantType?: unknown; params?: unknown };
    if (!body.name) {
      return problem(reply, 422, "invalid_eval_case", "name is required");
    }
    if (!isValidEvalCaseParams(body.invariantType, body.params)) {
      return problem(
        reply,
        422,
        "invalid_eval_case",
        "invariantType must be one of requires_skill, requires_mcp, forbids_mcp, min_component_count, with matching params",
      );
    }
    const { caseId } = await declareEvalCase(pool, scope, id, {
      name: body.name,
      invariantType: body.invariantType as InvariantType,
      params: body.params,
    });
    return reply.status(201).send({ caseId });
  });

  app.get("/projects/:id/harness/eval-cases", async (req, reply) => {
    const scope = requireScope(req, reply);
    if (!scope) return reply;
    const { id } = req.params as { id: string };
    if (!(await requireOwnedProject(pool, req, reply, id, scope))) return reply;
    const evalCases = await listEvalCases(pool, id);
    return reply.send({ evalCases });
  });

  app.post("/projects/:id/harness/eval-runs", async (req, reply) => {
    const scope = requireScope(req, reply);
    if (!scope) return reply;
    const { id } = req.params as { id: string };
    if (!(await requireOwnedProject(pool, req, reply, id, scope, "harness.write"))) return reply;
    const grant = await enforceCapability(pool, scope, "harness.write", `projects/${id}`, req.correlationId);
    if (!grant.allowed) {
      return problem(reply, 403, "capability_denied", grant.reason, { correlationId: req.correlationId });
    }
    const outcome = await runEval(pool, scope, id);
    switch (outcome.kind) {
      case "requires_inventory":
        return problem(reply, 422, "harness_requires_inventory", "declare a harness inventory before running evals");
      case "requires_eval_cases":
        return problem(
          reply,
          422,
          "harness_requires_eval_cases",
          "declare at least one eval case before running evals",
        );
      case "ran":
        return reply.status(201).send({
          runId: outcome.runId,
          score: { passed: outcome.passed, total: outcome.total },
          results: outcome.results,
        });
    }
  });

  app.post("/projects/:id/harness/experiments/:experimentId/evaluate-from-eval-run", async (req, reply) => {
    const scope = requireScope(req, reply);
    if (!scope) return reply;
    const { id, experimentId } = req.params as { id: string; experimentId: string };
    if (!(await requireOwnedProject(pool, req, reply, id, scope, "experiment.write"))) return reply;
    const grant = await enforceCapability(pool, scope, "experiment.write", `projects/${id}`, req.correlationId);
    if (!grant.allowed) {
      return problem(reply, 403, "capability_denied", grant.reason, { correlationId: req.correlationId });
    }
    const outcome = await evaluateExperimentFromEvalRun(pool, scope, id, experimentId);
    switch (outcome.kind) {
      case "requires_inventory":
        return problem(reply, 422, "harness_requires_inventory", "declare a harness inventory before running evals");
      case "requires_eval_cases":
        return problem(
          reply,
          422,
          "harness_requires_eval_cases",
          "declare at least one eval case before running evals",
        );
      case "not_found":
        return problem(reply, 404, "not_found", "experiment does not exist in this project");
      case "invalid_transition":
        return problem(reply, 409, "invalid_transition", "experiment is not running");
      case "evaluated":
        return reply.send({
          experimentId,
          status: "evaluated",
          runId: outcome.runId,
          score: { passed: outcome.passed, total: outcome.total },
          verdict: outcome.verdict,
          rationale: outcome.rationale,
        });
    }
  });

  app.get("/projects/:id/harness/observatory", async (req, reply) => {
    const scope = requireScope(req, reply);
    if (!scope) return reply;
    const { id } = req.params as { id: string };
    if (!(await requireOwnedProject(pool, req, reply, id, scope))) return reply;
    const observatory = await getHarnessObservatory(pool, id);
    return reply.send(observatory);
  });

  app.post("/orgs/current/modules", async (req, reply) => {
    const scope = requireScope(req, reply);
    if (!scope) return reply;
    const grant = await enforceCapability(pool, scope, "module.write", "orgs/current/modules", req.correlationId);
    if (!grant.allowed) {
      return problem(reply, 403, "capability_denied", grant.reason, { correlationId: req.correlationId });
    }
    const outcome = await publishModule(pool, scope, req.body);
    switch (outcome.kind) {
      case "invalid":
        return problem(reply, 422, "invalid_manifest", "manifest is malformed or missing required fields");
      case "conflict":
        return problem(reply, 409, "version_conflict", "this module id/version was already published with a different manifest, or belongs to another org");
      case "published":
        return reply.status(201).send({
          moduleId: outcome.moduleId,
          version: outcome.version,
          digest: outcome.digest,
          signature: outcome.signature,
          sbom: outcome.sbom,
        });
    }
  });

  app.get("/orgs/current/modules/:moduleId/versions/:version", async (req, reply) => {
    const scope = requireScope(req, reply);
    if (!scope) return reply;
    const { moduleId, version } = req.params as { moduleId: string; version: string };
    const moduleVersion = await getModuleVersion(pool, scope.orgId, moduleId, version);
    if (!moduleVersion) {
      return problem(reply, 404, "not_found", "module version does not exist in this org's registry");
    }
    return reply.send(moduleVersion);
  });

  app.get("/orgs/current/modules", async (req, reply) => {
    const scope = requireScope(req, reply);
    if (!scope) return reply;
    const modules = await listModules(pool, scope.orgId);
    return reply.send({ modules });
  });

  app.post("/projects/:id/modules/:moduleId/install", async (req, reply) => {
    const scope = requireScope(req, reply);
    if (!scope) return reply;
    const { id, moduleId } = req.params as { id: string; moduleId: string };
    if (!(await requireOwnedProject(pool, req, reply, id, scope, "module.write"))) return reply;
    const grant = await enforceCapability(pool, scope, "module.write", `projects/${id}`, req.correlationId);
    if (!grant.allowed) {
      return problem(reply, 403, "capability_denied", grant.reason, { correlationId: req.correlationId });
    }
    const body = (req.body ?? {}) as { version?: string };
    if (!body.version) {
      return problem(reply, 422, "invalid_install", "version is required");
    }
    const outcome = await installModule(pool, scope, id, moduleId, { version: body.version });
    switch (outcome.kind) {
      case "not_found":
        return problem(reply, 404, "not_found", "module or version does not exist in this org's registry");
      case "signature_invalid":
        return problem(reply, 409, "signature_invalid", "the module version's signature does not verify against its recomputed digest");
      case "missing_capabilities":
        return problem(reply, 422, "module_requires_capability_grant", "grant the missing capabilities before installing", {
          missing: outcome.missing,
        });
      case "already_installed":
        return problem(reply, 409, "already_installed", "a different version is already active - use update instead", {
          currentVersion: outcome.currentVersion,
        });
      case "installed":
        return reply.status(outcome.replay ? 200 : 201).send({
          installationId: outcome.installationId,
          moduleId,
          version: outcome.version,
          digest: outcome.digest,
          capabilities: outcome.capabilities,
          status: "active",
        });
    }
  });

  app.post("/projects/:id/modules/:moduleId/update", async (req, reply) => {
    const scope = requireScope(req, reply);
    if (!scope) return reply;
    const { id, moduleId } = req.params as { id: string; moduleId: string };
    if (!(await requireOwnedProject(pool, req, reply, id, scope, "module.write"))) return reply;
    const grant = await enforceCapability(pool, scope, "module.write", `projects/${id}`, req.correlationId);
    if (!grant.allowed) {
      return problem(reply, 403, "capability_denied", grant.reason, { correlationId: req.correlationId });
    }
    const body = (req.body ?? {}) as { version?: string };
    if (!body.version) {
      return problem(reply, 422, "invalid_update", "version is required");
    }
    const outcome = await updateModule(pool, scope, id, moduleId, { version: body.version });
    switch (outcome.kind) {
      case "not_found":
        return problem(reply, 404, "not_found", "module or version does not exist in this org's registry");
      case "signature_invalid":
        return problem(reply, 409, "signature_invalid", "the module version's signature does not verify against its recomputed digest");
      case "invalid_transition":
        return problem(reply, 409, "invalid_transition", "installation is not active");
      case "missing_capabilities":
        return problem(reply, 422, "module_requires_capability_grant", "grant the newly declared capabilities before updating", {
          added: outcome.added,
        });
      case "updated":
        return reply.status(200).send({
          installationId: outcome.installationId,
          moduleId,
          version: outcome.version,
          digest: outcome.digest,
          status: "active",
          permissionDiff: { added: outcome.added, removed: outcome.removed },
        });
    }
  });

  app.post("/projects/:id/modules/:moduleId/quarantine", async (req, reply) => {
    const scope = requireScope(req, reply);
    if (!scope) return reply;
    const { id, moduleId } = req.params as { id: string; moduleId: string };
    if (!(await requireOwnedProject(pool, req, reply, id, scope, "module.write"))) return reply;
    const grant = await enforceCapability(pool, scope, "module.write", `projects/${id}`, req.correlationId);
    if (!grant.allowed) {
      return problem(reply, 403, "capability_denied", grant.reason, { correlationId: req.correlationId });
    }
    const outcome = await quarantineInstallation(pool, scope, id, moduleId);
    switch (outcome.kind) {
      case "not_found":
        return problem(reply, 404, "not_found", "module is not installed in this project");
      case "invalid_transition":
        return problem(reply, 409, "invalid_transition", "installation is not active");
      case "quarantined":
        return reply.status(200).send({ installationId: outcome.installationId, moduleId, status: "quarantined" });
    }
  });

  app.post("/projects/:id/modules/:moduleId/rollback", async (req, reply) => {
    const scope = requireScope(req, reply);
    if (!scope) return reply;
    const { id, moduleId } = req.params as { id: string; moduleId: string };
    if (!(await requireOwnedProject(pool, req, reply, id, scope, "module.write"))) return reply;
    const grant = await enforceCapability(pool, scope, "module.write", `projects/${id}`, req.correlationId);
    if (!grant.allowed) {
      return problem(reply, 403, "capability_denied", grant.reason, { correlationId: req.correlationId });
    }
    const body = (req.body ?? {}) as { version?: string };
    if (!body.version) {
      return problem(reply, 422, "invalid_rollback", "version is required");
    }
    const outcome = await rollbackInstallation(pool, scope, id, moduleId, { version: body.version });
    switch (outcome.kind) {
      case "not_found":
        return problem(reply, 404, "not_found", "module is not installed in this project");
      case "invalid_transition":
        return problem(reply, 409, "invalid_transition", "installation is uninstalled");
      case "unproven_version":
        return problem(reply, 409, "unproven_version", "this project never had that version locked - rollback only replays proven history");
      case "rolled_back":
        return reply.status(200).send({
          installationId: outcome.installationId,
          moduleId,
          version: outcome.version,
          digest: outcome.digest,
          status: "active",
        });
    }
  });

  app.post("/projects/:id/modules/:moduleId/uninstall", async (req, reply) => {
    const scope = requireScope(req, reply);
    if (!scope) return reply;
    const { id, moduleId } = req.params as { id: string; moduleId: string };
    if (!(await requireOwnedProject(pool, req, reply, id, scope, "module.write"))) return reply;
    const grant = await enforceCapability(pool, scope, "module.write", `projects/${id}`, req.correlationId);
    if (!grant.allowed) {
      return problem(reply, 403, "capability_denied", grant.reason, { correlationId: req.correlationId });
    }
    const outcome = await uninstallModule(pool, scope, id, moduleId);
    switch (outcome.kind) {
      case "not_found":
        return problem(reply, 404, "not_found", "module is not installed in this project");
      case "invalid_transition":
        return problem(reply, 409, "invalid_transition", "installation is already uninstalled");
      case "uninstalled":
        return reply.status(200).send({ installationId: outcome.installationId, moduleId, status: "uninstalled" });
    }
  });

  app.get("/projects/:id/modules/lockfile", async (req, reply) => {
    const scope = requireScope(req, reply);
    if (!scope) return reply;
    const { id } = req.params as { id: string };
    if (!(await requireOwnedProject(pool, req, reply, id, scope))) return reply;
    const lockfile = await getProjectLockfile(pool, id);
    return reply.send({ lockfile });
  });

  app.post("/projects/:id/relations", async (req, reply) => {
    const scope = requireScope(req, reply);
    if (!scope) return reply;
    const { id } = req.params as { id: string };
    if (!(await requireOwnedProject(pool, req, reply, id, scope, "portfolio.write"))) return reply;
    const grant = await enforceCapability(pool, scope, "portfolio.write", `projects/${id}`, req.correlationId);
    if (!grant.allowed) {
      return problem(reply, 403, "capability_denied", grant.reason, { correlationId: req.correlationId });
    }
    const body = (req.body ?? {}) as { targetProjectId?: string; type?: string };
    if (!body.targetProjectId || !body.type) {
      return problem(reply, 422, "invalid_relation", "targetProjectId and type are required");
    }
    const outcome = await declareRelation(pool, scope, id, { targetProjectId: body.targetProjectId, type: body.type });
    switch (outcome.kind) {
      case "invalid_type":
        return problem(reply, 422, "invalid_relation_type", "type must be one of composition, dependency, implementation, ownership, influence");
      case "self_relation":
        return problem(reply, 422, "self_relation", "a project cannot relate to itself");
      case "not_found":
        return problem(reply, 404, "not_found", "target project does not exist in this org");
      case "declared":
        return reply.status(201).send({ relationId: outcome.relationId });
    }
  });

  app.get("/projects/:id/relations", async (req, reply) => {
    const scope = requireScope(req, reply);
    if (!scope) return reply;
    const { id } = req.params as { id: string };
    if (!(await requireOwnedProject(pool, req, reply, id, scope))) return reply;
    const relations = await listRelations(pool, id);
    return reply.send(relations);
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
