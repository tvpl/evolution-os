import { createHash, randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { DbPool } from "../platform/db.js";
import { problem, requireScope } from "../http.js";
import { enforceCapability } from "../policy/policy.js";

function sha256(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

/**
 * Protocolo Hub<->Node mínimo do M0 (ADR-001, TRUST-12/13/14):
 * enroll autorizado por sessão de operador; sync autenticado pelo token do
 * Node (hash armazenado). Nunca aceita tenant do payload.
 */
export function registerNodeRoutes(app: FastifyInstance, pool: DbPool): void {
  app.post("/nodes/enroll", async (req, reply) => {
    const scope = requireScope(req, reply);
    if (!scope) return reply;
    const decision = await enforceCapability(
      pool,
      scope,
      "node.enroll",
      "nodes",
      req.correlationId,
    );
    if (!decision.allowed) {
      return problem(reply, 403, "capability_denied", decision.reason, {
        correlationId: req.correlationId,
      });
    }
    const body = (req.body ?? {}) as { name?: string };
    if (!body.name) {
      return problem(reply, 422, "invalid_request", "name is required");
    }
    const nodeId = `node_${randomUUID().replaceAll("-", "")}`;
    const token = `nodetok_${randomUUID().replaceAll("-", "")}`;
    await pool.query(
      "insert into node_agents (id, org_id, workspace_id, name, token_hash) values ($1, $2, $3, $4, $5)",
      [nodeId, scope.orgId, scope.workspaceId, body.name, sha256(token)],
    );
    // Ack de enrollment: o token aparece UMA única vez; só o hash persiste.
    return reply.status(201).send({ nodeId, token, enrolled: true });
  });

  app.post("/nodes/:id/artifacts", async (req, reply) => {
    const { id } = req.params as { id: string };
    const tokenHeader = req.headers["x-node-token"];
    const token = typeof tokenHeader === "string" ? tokenHeader : "";
    const node = await pool.query(
      "select org_id, workspace_id, token_hash, revoked_at from node_agents where id = $1",
      [id],
    );
    const row = node.rows[0] as
      | { org_id: string; workspace_id: string; token_hash: string; revoked_at: Date | null }
      | undefined;
    if (!row || !token || row.token_hash !== sha256(token) || row.revoked_at) {
      // TRUST-14: Node sem enrollment válido é rejeitado sem detalhes.
      return problem(reply, 401, "node_unauthorized", "node is not enrolled");
    }
    const body = (req.body ?? {}) as { name?: string; digest?: string; content?: string };
    if (!body.name || !body.digest) {
      return problem(reply, 422, "invalid_request", "name and digest are required");
    }
    if (typeof body.content === "string" && sha256(body.content) !== body.digest) {
      return problem(reply, 422, "digest_mismatch", "content does not match the declared digest");
    }
    const artifactId = `art_${randomUUID().replaceAll("-", "")}`;
    await pool.query(
      `insert into node_artifacts (id, node_id, org_id, workspace_id, name, digest)
       values ($1, $2, $3, $4, $5, $6)`,
      [artifactId, id, row.org_id, row.workspace_id, body.name, body.digest],
    );
    return reply.status(201).send({ artifactId, digest: body.digest, recorded: true });
  });
}
