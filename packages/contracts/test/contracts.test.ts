import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

import {
  EVENT_TYPES,
  SCHEMA_VERSIONS,
  validateDecision,
  validateEvent,
  validateEvidence,
  validateManifest,
  validateProject,
  validateProposal,
} from "../src/index.js";

const EXAMPLES = join(import.meta.dirname, "..", "..", "..", "examples");

function loadExample(name: string): unknown {
  return parse(readFileSync(join(EXAMPLES, name), "utf8"));
}

// TRUST-15 AC1: "The repository SHALL provide versioned v0 schemas for
// project, evidence, proposal, decision and event."
describe("v0 schema set", () => {
  it("provides the five M0 schemas at version v0", () => {
    for (const name of ["project", "evidence", "proposal", "decision", "event"] as const) {
      expect(SCHEMA_VERSIONS[name]).toBe("v0");
    }
  });
});

// TRUST-16 AC3: "WHEN the example manifests in examples/ are validated against
// the v0 schemas THEN validation SHALL pass."
describe("example manifests validate against v0 schemas", () => {
  it("project example passes", () => {
    expect(validateManifest(loadExample("evolution.project.example.yaml"))).toEqual({
      ok: true,
      errors: [],
    });
  });

  it("proposal example passes", () => {
    expect(validateManifest(loadExample("evolution.proposal.example.yaml"))).toEqual({
      ok: true,
      errors: [],
    });
  });

  it("module example passes", () => {
    expect(validateManifest(loadExample("evolution.module.example.yaml"))).toEqual({
      ok: true,
      errors: [],
    });
  });

  it("policy example passes", () => {
    expect(validateManifest(loadExample("evolution.policy.example.yaml"))).toEqual({
      ok: true,
      errors: [],
    });
  });
});

// TRUST-16 AC2: "WHEN a manifest or event payload is validated against its v0
// schema THEN the system SHALL reject payloads that violate the schema."
describe("schema violations are rejected", () => {
  it("project without metadata.slug fails naming the missing field", () => {
    const project = loadExample("evolution.project.example.yaml") as {
      metadata: Record<string, unknown>;
    };
    delete project.metadata["slug"];
    const result = validateProject(project);
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("slug");
  });

  it("idea project without intent.problem fails (manifest spec rule 3)", () => {
    const idea = {
      apiVersion: "evolutionos.io/v1alpha1",
      kind: "EvolutionProject",
      metadata: { name: "Ideia", slug: "ideia", type: "idea", status: "discovery" },
      spec: { intent: { audiences: ["ops"] } },
    };
    expect(validateProject(idea).ok).toBe(false);
  });

  it("proposal without recommendation.optionRef fails", () => {
    const proposal = loadExample("evolution.proposal.example.yaml") as {
      spec: { recommendation: Record<string, unknown> };
    };
    delete proposal.spec.recommendation["optionRef"];
    const result = validateProposal(proposal);
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("optionRef");
  });

  it("unknown manifest kind is rejected", () => {
    const result = validateManifest({ kind: "EvolutionUnknown" });
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("EvolutionUnknown");
  });
});

describe("evidence v0", () => {
  const evidence = {
    id: "evd_001",
    type: "sourceSnapshot",
    status: "active",
    createdAt: "2026-08-30T12:00:00Z",
    source: { type: "url", uri: "https://example.com/release-notes" },
    integrity: { contentDigest: "sha256:abc", digestAlgorithm: "sha256" },
    governance: { classification: "public" },
  };

  it("valid record passes", () => {
    expect(validateEvidence(evidence)).toEqual({ ok: true, errors: [] });
  });

  it("record without integrity digest fails", () => {
    const bad = { ...evidence, integrity: { digestAlgorithm: "sha256" } };
    const result = validateEvidence(bad);
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("contentDigest");
  });
});

describe("decision v0", () => {
  const decision = {
    proposalRef: { id: "ep-01", digest: "sha256:def" },
    decision: "experiment",
    actor: { id: "user_1", kind: "human", role: "service-owner" },
    decidedAt: "2026-08-30T12:00:00Z",
    rationale: "Pilotar preserva reversibilidade.",
  };

  it("valid decision passes", () => {
    expect(validateDecision(decision)).toEqual({ ok: true, errors: [] });
  });

  it("decision outside the documented enum fails", () => {
    // Enum de docs/07-specifications/04-evolution-proposal-spec.md §4.
    const result = validateDecision({ ...decision, decision: "approve" });
    expect(result.ok).toBe(false);
  });

  it("proposalRef without version or digest fails (approval bound to exact digest)", () => {
    const result = validateDecision({ ...decision, proposalRef: { id: "ep-01" } });
    expect(result.ok).toBe(false);
  });
});

describe("event envelope v0", () => {
  // Espelha o exemplo de docs/07-specifications/06-event-contract-spec.md §8.
  const event = {
    specversion: "1.0",
    id: "evt_01J",
    source: "urn:evolutionos:hub",
    type: EVENT_TYPES.PROJECT_REGISTERED,
    subject: "projects/prj_123",
    time: "2026-08-30T12:00:00Z",
    datacontenttype: "application/json",
    data: { projectId: "prj_123" },
    tenantid: "ten_123",
    workspaceid: "wrk_123",
    projectid: "prj_123",
    correlationid: "req_123",
    classification: "internal",
    schemaversion: "1",
  };

  it("valid envelope passes", () => {
    expect(validateEvent(event)).toEqual({ ok: true, errors: [] });
  });

  it("envelope without tenantid fails (required extension, contract section 2)", () => {
    const { tenantid: _drop, ...rest } = event;
    const result = validateEvent(rest);
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("tenantid");
  });

  it("type outside the documented taxonomy pattern fails", () => {
    const result = validateEvent({ ...event, type: "project.registered" });
    expect(result.ok).toBe(false);
  });

  it("registration event type matches the documented taxonomy string", () => {
    // docs/02-architecture/10-api-event-model.md §5.
    expect(EVENT_TYPES.PROJECT_REGISTERED).toBe("io.evolutionos.project.project.registered.v1");
  });
});
