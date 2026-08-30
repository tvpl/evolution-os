import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { freshDb } from "./helpers.js";
import { seedDevData } from "../src/identity/seed.js";
import {
  checkCapability,
  enforceCapability,
  recordAudit,
  seedDevGrants,
} from "../src/policy/policy.js";
import type { DbPool } from "../src/platform/db.js";
import type { AuthScope } from "../src/identity/session.js";

let pool: DbPool;

const scopeA: AuthScope = { userId: "user_dev_a", orgId: "org_dev_a", workspaceId: "ws_dev_a" };

beforeAll(async () => {
  pool = await freshDb("evoos_test_policy");
  await seedDevData(pool);
  await seedDevGrants(pool);
});

afterAll(async () => {
  await pool.end();
});

describe("policy deny-by-default (TRUST-08/09)", () => {
  it("denies a capability that has no explicit grant, naming the reason", async () => {
    const decision = await checkCapability(pool, scopeA, "module.install");
    expect(decision).toEqual({
      allowed: false,
      reason: "no grant for capability 'module.install' in workspace 'ws_dev_a'",
    });
  });

  it("allows a capability explicitly granted to the workspace members", async () => {
    const decision = await checkCapability(pool, scopeA, "project.register");
    expect(decision).toEqual({ allowed: true });
  });

  it("a grant in another workspace does not leak into this scope", async () => {
    const foreign: AuthScope = { userId: "user_dev_a", orgId: "org_dev_a", workspaceId: "ws_dev_b" };
    const decision = await checkCapability(pool, foreign, "project.register");
    expect(decision.allowed).toBe(false);
  });

  it("enforceCapability records an audit entry on denial", async () => {
    const decision = await enforceCapability(
      pool,
      scopeA,
      "module.install",
      "modules/mod_x",
      "req_audit_1",
    );
    expect(decision.allowed).toBe(false);
    const audit = await pool.query(
      "select actor, action, resource, outcome, reason, correlation_id from audit_log where correlation_id = 'req_audit_1'",
    );
    expect(audit.rows[0]).toEqual({
      actor: "user_dev_a",
      action: "module.install",
      resource: "modules/mod_x",
      outcome: "denied",
      reason: "no grant for capability 'module.install' in workspace 'ws_dev_a'",
      correlation_id: "req_audit_1",
    });
  });

  it("recordAudit persists allowed outcomes too", async () => {
    await recordAudit(pool, {
      orgId: "org_dev_a",
      actor: "user_dev_a",
      action: "project.register",
      resource: "projects/prj_1",
      outcome: "allowed",
      correlationId: "req_audit_2",
    });
    const audit = await pool.query(
      "select outcome from audit_log where correlation_id = 'req_audit_2'",
    );
    expect(audit.rows[0]?.outcome).toBe("allowed");
  });
});
