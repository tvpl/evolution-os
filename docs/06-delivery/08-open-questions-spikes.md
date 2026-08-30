# Questões abertas e spikes

## Prioridade 0 — antes do walking skeleton

### Q-001 — Backend reference stack

Next.js está decidido; a implementação do Control Plane não. Avaliar TypeScript modular backend versus Java/Micronaut ou outra opção considerando velocity, workflow SDKs, shared schemas, enterprise ops e equipe.

**Spike output:** ADR com benchmark pequeno, não preferência abstrata.

### Q-002 — Durable workflow engine

Comparar Temporal, Restate, cloud-managed options e lightweight Lite implementation. Testar wait humano, retry/reconciliation, versioning e Node task lease.

### Q-003 — Policy engine

Validar OPA/Rego ou Cedar-equivalent para capability constraints, explanations, bundles e Node offline enforcement.

## Prioridade 1 — antes do M2

### Q-010 — Confidence model

Definir bands, components, human UX e calibration. Evitar fórmula falsa. Testar com contradictory evidence.

### Q-011 — Evidence licensing and retention

Quais fontes podem ser snapshot, extract, hash ou apenas reference? Definir legal/source policy.

### Q-012 — Graph projection

Benchmark PostgreSQL edge tables/recursive CTE/materialized paths para queries reais. Graph DB somente se trigger do ADR ocorrer.

### Q-013 — Web research boundary

Decidir source allowlists, robots/licensing, refresh, archive e anti-injection pipeline.

### Q-014 — Human review research

Testar proposal UI, score decomposition e evidence lineage com founder, PM e architect.

## Prioridade 2 — antes do execution

### Q-020 — Sandbox profiles

Comparar containers, microVMs, OS sandbox e WASI para Lite/Team/Enterprise. Provar egress, filesystem e credential broker.

### Q-021 — Unknown side-effect protocol

Implementar connector reconciliation contract em GitHub draft PR case.

### Q-022 — Coding agent delegation

Definir adapter/API versus A2A; garantir exact plan digest and proof.

### Q-023 — Model providers and eval platform

Escolher primeira abstraction sem reduzir features importantes ao mínimo comum.

## Prioridade 3 — módulos e enterprise

### Q-030 — OCI module package

Executar spike do ADR-008.

### Q-031 — CALM fit

Executar spike do ADR-012 em small/system/harness cases.

### Q-032 — Node packaging and updates

Single binary, container, package managers, Kubernetes operator e offline bundles.

### Q-033 — Tenancy tiers

Shared, schema/database-isolated e dedicated deployments; definir triggers e costs.

### Q-034 — Shared intelligence privacy

Como aprender patterns entre tenants sem expor data? Iniciar sem cross-tenant learning; investigar opt-in aggregate/federated approaches.

## Product questions

- Qual persona sente dor suficiente para primeiro wedge: solo AI builder, architect ou platform modernization?
- Primeiro valor será product relevance ou technical/harness evolution?
- Qual frequência de signal é útil sem noise?
- Quanto contexto o usuário aceita estruturar no onboarding?
- Marketplace é estratégia de distribuição ou distração inicial?
- O nome EvolutionOS comunica valor ou parece operating system literal?

## Decision discipline

Cada spike termina com:

- question and alternatives;
- prototype/measurement;
- security/operational implications;
- recommendation and confidence;
- ADR accepted/rejected/deferred;
- review trigger.

