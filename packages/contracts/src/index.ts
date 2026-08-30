import { Ajv2020, type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";
import addFormatsImport from "ajv-formats";

// Interop CJS/ESM sob NodeNext: ajv-formats exporta uma função CJS que o TS
// enxerga como namespace; em runtime o default é o próprio callable.
const addFormatsResolved =
  (addFormatsImport as unknown as { default?: unknown }).default ?? addFormatsImport;
const addFormats = addFormatsResolved as (ajv: Ajv2020) => void;

import projectSchema from "./schemas/project.v0.json" with { type: "json" };
import evidenceSchema from "./schemas/evidence.v0.json" with { type: "json" };
import proposalSchema from "./schemas/proposal.v0.json" with { type: "json" };
import decisionSchema from "./schemas/decision.v0.json" with { type: "json" };
import eventSchema from "./schemas/event.v0.json" with { type: "json" };
import moduleSchema from "./schemas/module.v0.json" with { type: "json" };
import policySchema from "./schemas/policy.v0.json" with { type: "json" };

/** Taxonomia documentada em docs/02-architecture/10-api-event-model.md §5. */
export const EVENT_TYPES = {
  PROJECT_REGISTERED: "io.evolutionos.project.project.registered.v1",
  PROJECT_SNAPSHOT_OBSERVED: "io.evolutionos.project.snapshot.observed.v1",
  EVIDENCE_INGESTED: "io.evolutionos.evidence.evidence.ingested.v1",
  FINDING_CREATED: "io.evolutionos.intelligence.finding.created.v1",
  PROPOSAL_CREATED: "io.evolutionos.evolution.proposal.created.v1",
  DECISION_RECORDED: "io.evolutionos.evolution.decision.recorded.v1",
  RUN_STARTED: "io.evolutionos.agent.run.started.v1",
  TASK_DISPATCHED: "io.evolutionos.agent.task.dispatched.v1",
  VERIFICATION_OUTCOME_RECORDED: "io.evolutionos.verification.outcome.recorded.v1",
  MODULE_INSTALLATION_QUARANTINED: "io.evolutionos.module.installation.quarantined.v1",
  NODE_HEARTBEAT_RECEIVED: "io.evolutionos.node.node.heartbeat-received.v1",
} as const;

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];

/** Extensions obrigatórias do envelope (event contract §2). */
export interface EventEnvelope {
  specversion: "1.0";
  id: string;
  source: string;
  type: string;
  subject?: string;
  time: string;
  datacontenttype: string;
  dataschema?: string;
  data: Record<string, unknown>;
  tenantid: string;
  workspaceid: string;
  projectid?: string;
  correlationid: string;
  causationid?: string;
  traceparent?: string;
  classification: string;
  schemaversion: string;
  idempotencykey?: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);

function compile(schema: object): ValidateFunction {
  return ajv.compile(schema);
}

function toResult(validate: ValidateFunction, data: unknown): ValidationResult {
  const ok = validate(data) as boolean;
  const errors = (validate.errors ?? []).map(
    (e: ErrorObject) => `${e.instancePath || "/"} ${e.message ?? "invalid"}`,
  );
  return { ok, errors };
}

const validators = {
  project: compile(projectSchema),
  evidence: compile(evidenceSchema),
  proposal: compile(proposalSchema),
  decision: compile(decisionSchema),
  event: compile(eventSchema),
  module: compile(moduleSchema),
  policy: compile(policySchema),
} as const;

export type SchemaName = keyof typeof validators;

export const SCHEMA_VERSIONS: Record<SchemaName, string> = {
  project: "v0",
  evidence: "v0",
  proposal: "v0",
  decision: "v0",
  event: "v0",
  module: "v0",
  policy: "v0",
};

export function validateProject(data: unknown): ValidationResult {
  return toResult(validators.project, data);
}
export function validateEvidence(data: unknown): ValidationResult {
  return toResult(validators.evidence, data);
}
export function validateProposal(data: unknown): ValidationResult {
  return toResult(validators.proposal, data);
}
export function validateDecision(data: unknown): ValidationResult {
  return toResult(validators.decision, data);
}
export function validateEvent(data: unknown): ValidationResult {
  return toResult(validators.event, data);
}
export function validateModule(data: unknown): ValidationResult {
  return toResult(validators.module, data);
}
export function validatePolicy(data: unknown): ValidationResult {
  return toResult(validators.policy, data);
}

const KIND_TO_SCHEMA: Record<string, SchemaName> = {
  EvolutionProject: "project",
  EvolutionProposal: "proposal",
  EvolutionModule: "module",
  EvolutionPolicy: "policy",
};

/** Valida um manifesto YAML/JSON já parseado despachando pelo campo `kind`. */
export function validateManifest(data: unknown): ValidationResult {
  if (typeof data !== "object" || data === null || !("kind" in data)) {
    return { ok: false, errors: ["/ manifest must be an object with a kind"] };
  }
  const kind = String((data as { kind: unknown }).kind);
  const schema = KIND_TO_SCHEMA[kind];
  if (!schema) {
    return { ok: false, errors: [`/kind unknown manifest kind '${kind}'`] };
  }
  return toResult(validators[schema], data);
}
