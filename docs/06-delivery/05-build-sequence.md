# Sequência recomendada de construção

## Regra

Construir por vertical slices demonstráveis, mantendo contracts. Não criar todas as tabelas/agentes/conectores antes do primeiro loop de valor.

## Slice 0 — Trust skeleton

Objetivo: provar identity, tenant, event, workflow e observability.

1. Repo/docs/ADR checks.
2. Organization/workspace/project IDs.
3. Next.js authenticated shell.
4. API command `register project`.
5. Transaction + outbox event.
6. Projection and UI update.
7. OTel trace and audit record.
8. Cross-tenant/idempotency negative tests.

Stop gate: nenhum desenvolvimento de agente antes de trust skeleton passar.

## Slice 1 — Idea memory

1. Idea manifest.
2. Intent/hypothesis capture.
3. Artifacts and versioning.
4. Decision/review trigger.
5. Project Overview and Timeline.
6. Export/import.

Valor: produto serve sem código.

## Slice 2 — Local repo Twin

1. Node CLI init/doctor.
2. Local Git/files sensors.
3. Deterministic inventory and snapshot.
4. Cartographer proposal of entities/relations.
5. Human confirmation.
6. Declared/observed/inferred diff.

Valor: primeiro digital twin técnico; ainda read-only.

## Slice 3 — Evidence to decision

1. Manual/URL evidence ingestion quarantine.
2. Claim extraction and provenance.
3. Signal linked to one project.
4. Relevance analysis.
5. Proposal schema.
6. Challenger.
7. Inbox and decision.
8. Rejected-memory guard.

Valor: unidade central completa.

## Slice 4 — Experiment loop

1. Experiment spec and exact approval digest.
2. Sandbox.
3. Prepare two variants.
4. Verification plan and eval.
5. Proof artifacts.
6. Outcome learning.

Valor: o sistema prova antes de recomendar adoção.

## Slice 5 — Reversible external action

1. GitHub read connector/app.
2. Webhook and reconciliation.
3. Capability gateway.
4. Create issue/branch/draft PR only.
5. CI status/proof.
6. Unknown side-effect recovery.

Valor: proposta vira trabalho real com controle.

## Slice 6 — Harness vertical

1. Harness manifest/inventory.
2. Skill/MCP/model mapping.
3. Task eval dataset.
4. Upgrade/removal experiment.
5. Harness Observatory.
6. Promotion/rollback.

Valor: diferenciação explícita do produto.

## Slice 7 — Module lifecycle

1. Local module dev format.
2. Module manifest and capabilities.
3. Signature/SBOM/provenance spike.
4. Install/lock/update permission diff.
5. Sandbox/quarantine/rollback.
6. Private registry.

## Slice 8 — Portfolio campaign

1. Multiple projects/relationships.
2. Common finding.
3. Cohort/canary/waves.
4. Exceptions.
5. Portfolio dashboard.
6. Aggregate outcome.

## Slice 9 — Enterprise hardening

SSO/SCIM, KMS, residency, retention, audit export, Node fleet, self-hosted, performance and DR.

## Anti-sequence

Não começar por:

- vinte agentes;
- crawling de toda internet;
- marketplace público;
- graph database cluster;
- microservices;
- auto-merge/deploy;
- centenas de MCP tools;
- polished executive dashboard sem verified project data.

## Review em cada slice

- Usuário entende o valor?
- O novo artifact está no knowledge model?
- Evidence/decision lineage existe?
- Policy e classification cobrem fluxo?
- Failure/retry/idempotency definidos?
- Evals incluem negative cases?
- O profile Lite continua possível?
- Alguma hipótese do ecossistema foi invalidada? Atualizar ADR/PRD.

