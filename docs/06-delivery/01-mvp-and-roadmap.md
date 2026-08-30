# MVP e roadmap

## Estratégia

O maior risco não é construir connectors ou dashboards; é produzir recomendações que usuários considerem confiáveis e específicas. O roadmap prova primeiro o loop de decisão, depois execução e escala.

## M0 — Contracts and walking skeleton

Entregas:

- repository structure e ADR enforcement;
- schemas v0 para project, evidence, proposal, decision e event;
- Next.js shell;
- Control Plane modular skeleton;
- local Node skeleton;
- OIDC/dev identity, policy stub deny-by-default;
- OTel correlation;
- one durable workflow hello path.

Exit:

- project registration event percorre UI → API → outbox → projection → UI;
- Node enroll/sync dummy artifact;
- tenant isolation and idempotency tests pass.

## M1 — Project Twin read-only

Entregas:

- idea/project registration;
- manifest import/export;
- artifacts, relationships, owners e decisions;
- local filesystem/Git sensor;
- snapshot and coverage;
- Project Cockpit basic;
- evidence record and lineage viewer.

Exit:

- idea sem código e repo existente produzem Twins úteis;
- declared/observed/inferred separados;
- no write capability exposed.

## M2 — Evolution intelligence vertical slice

Entregas:

- manual/URL external signal ingest;
- Evidence Curator, Relevance Analyst e Product/Architecture specialist mínimo;
- deterministic analyzers;
- proposal draft;
- Challenger;
- Evolution Inbox;
- decision memory and review trigger;
- eval harness and golden scenarios.

Exit:

- fluxo completo signal → proposal → reject/defer/experiment decision;
- lineage e score decomposition;
- injection/conflict/rejected-history cases pass.

## M3 — Experiment and verification

Entregas:

- sandbox A2;
- experiment spec;
- branch/patch preparation local;
- verification plan and proof artifacts;
- run explorer;
- model/skill version tracking;
- outcome learning.

Exit:

- duas variants comparadas sem write externo;
- exact plan digest and capability enforcement;
- result verified/inconclusive/failed preserved.

## M4 — Team collaboration and reversible writes

Entregas:

- GitHub app/connector;
- issues/branches/draft PR A3;
- approval workflows;
- modules private registry/profile;
- shared policies;
- notifications;
- campaigns pilot.

Exit:

- draft PR gerada com proof and lineage;
- timeout/retry/reconciliation proven;
- module permission diff and rollback.

## M5 — Harness Intelligence

Entregas:

- harness inventory;
- Agent Skills and MCP inventory;
- eval datasets/model comparison;
- instruction/skill/MCP audits;
- Harness Observatory dashboard;
- promotion gates.

Exit:

- detects redundant/stale component;
- validates removal/update via task eval;
- no automatic latest model.

## M6 — Portfolio and enterprise beta

Entregas:

- organizations/workspaces/SSO/SCIM;
- multi-Node fleets;
- catalog imports;
- portfolio views;
- campaigns/waves/exceptions;
- retention/residency/KMS;
- SIEM/audit export;
- self-hosted reference deployment.

Exit:

- hundreds-of-project synthetic scale test;
- cross-tenant/redaction suite;
- campaign canary pause/rollback;
- Node protocol compatibility.

## M7 — Ecosystem

Entregas:

- OCI module conformance;
- verified/private marketplace;
- author SDK and testing kit;
- public extension docs;
- A2A adapter where justified;
- broader connector catalog.

Exit:

- third party builds safe module without core changes;
- signature/SBOM/provenance verified;
- quarantine/revocation works.

## Explicitly postponed

- Full autonomous production changes.
- Public marketplace without verified supply chain.
- Universal competitive crawling.
- Graph database mandatory.
- Multi-cloud write agents.
- Auto-generated business pivots.

## Release principles

- Feature incomplete can ship behind profile; trust invariant cannot.
- Every milestone has negative/security cases.
- Evaluation dataset grows before autonomy.
- New integration does not bypass normalized capability contract.
- Outcomes decide roadmap, not demo fluency.

