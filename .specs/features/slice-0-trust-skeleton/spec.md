# Slice 0 — Trust Skeleton Specification

## Problem Statement

Nada do EvolutionOS pode ser construído com confiança antes de existir o esqueleto que prova identidade, tenancy, eventos, workflow durável e observabilidade ponta a ponta ([sequência de construção](../../../docs/06-delivery/05-build-sequence.md), Slice 0; milestone M0 do [roadmap](../../../docs/06-delivery/01-mvp-and-roadmap.md)). Este slice entrega o walking skeleton: um comando `register project` que atravessa UI → API → outbox → projection → UI com isolamento de tenant, idempotência e trace correlacionado — o stop gate antes de qualquer desenvolvimento de agente.

**Fonte de verdade**: [PRD-001](../../../docs/01-product/PRD-001-core-platform.md) (CORE-FR-001), épicos EP-001..004 ([épicos](../../../docs/06-delivery/02-implementation-epics.md)), [event contract](../../../docs/07-specifications/06-event-contract-spec.md), ADR-001..006 e ADR-014 ([decisões](../../../docs/04-decisions/README.md)).

## Goals

- [ ] Registro de projeto percorre UI → API → outbox → projection → UI (exit M0).
- [ ] Node local faz enroll e sync de artefato dummy (exit M0).
- [ ] Testes negativos de isolamento de tenant e idempotência passam (exit M0).
- [ ] Schemas v0 (project, evidence, proposal, decision, event) versionados e validados.

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Sensores, snapshot ou Twin real | Slice 1–2; stop gate proíbe agentes antes deste slice passar |
| Qualquer agente de análise ou proposta | Slices 2–3 (anti-sequence da sequência de construção) |
| Capacidade de escrita externa (SCM, issues, PRs) | Slice 5; M0..M1 são read-only |
| UI além do shell autenticado + confirmação do registro | PRD-006 entra por fatia a cada slice |
| Marketplace, módulos, microservices | Anti-sequence explícita; ADR-004 (monólito modular primeiro) |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | --------------- | --------- | ---------- |
| Nome do event type de registro | `io.evolutionos.project.project.registered.v1` | Taxonomia `io.evolutionos.<context>.<entity>.<past-tense-event>.v1` com este type listado explicitamente em `docs/02-architecture/10-api-event-model.md` §5 | y |
| Stack e tooling concretos (frameworks, filas, engine de workflow) | Diferidos para a fase Design deste slice, respeitando ADR-003 (Next.js console/BFF), ADR-004 (monólito modular), ADR-005 (relacional) e ADR-006 (outbox + workflows duráveis) | Specify captura O QUE; escolhas de ferramenta são decisão de Design com os ADRs como restrição | n |
| Identidade em M0 | OIDC real ou dev identity aceitável, conforme deliverable M0 "OIDC/dev identity" | O roadmap admite dev identity no M0; produção exige OIDC (ADR-014) | n |
| Persistência do walking skeleton | Postgres (perfil team) com perfil Lite/SQLite preservado como requisito de compatibilidade, não implementado neste slice | ADR-002/ADR-004 e perfis do README; implementar dois storages no M0 viola o corte mínimo | n |

**Open questions:** none - all resolved or logged above.

---

## User Stories

### P1: Registro de projeto ponta a ponta ⭐ MVP

**User Story**: As a usuário autenticado, I want registrar um projeto no console e vê-lo aparecer via projeção so that o caminho completo comando→evento→projeção→UI esteja provado.

**Why P1**: É o exit criterion central do M0 e a espinha de todos os slices seguintes.

**Acceptance Criteria**:

1. WHEN an authenticated user submits the register-project command in the console THEN the system SHALL persist the project and SHALL emit a CloudEvents envelope of type `io.evolutionos.project.project.registered.v1` through the transactional outbox in the same transaction.
2. WHEN the projection consumes the registration event THEN the console SHALL display the registered project from the projected read model.
3. The registration event SHALL carry the required extensions `tenantid`, `workspaceid`, `projectid`, `correlationid`, `classification` and `schemaversion`.
4. IF the same register-project command is resubmitted with the same idempotency key and digest THEN the system SHALL return the prior result without emitting a duplicate event.
5. IF an idempotency key is reused with a different request digest THEN the system SHALL reject the command as a conflict.

**Independent Test**: Registrar um projeto no shell; verificar evento no outbox com extensions, projeção atualizada na UI; repetir o comando com a mesma key e conferir ausência de segundo evento.

---

### P1: Identidade, tenancy e deny-by-default

**User Story**: As a operador da plataforma, I want toda requisição amarrada a organização/workspace com política negando por padrão so that isolamento de tenant seja um invariante desde o primeiro commit.

**Why P1**: Exit M0 ("tenant isolation and idempotency tests pass"); EP-002; ADR-014.

**Acceptance Criteria**:

1. WHEN a user authenticates via the OIDC or dev identity provider THEN the system SHALL establish a session scoped to exactly one organization and workspace.
2. IF a request references a project belonging to another tenant THEN the API SHALL deny the request.
3. WHEN a request is denied by policy or tenancy THEN the system SHALL record an audit entry with actor, action and reason.
4. The policy engine SHALL deny any capability that is not explicitly granted.

**Independent Test**: Suite negativa cross-tenant: criar dois tenants, acessar projeto do tenant A com sessão do tenant B, conferir negação + registro de auditoria.

---

### P2: Observabilidade e workflow durável (hello path)

**User Story**: As a engenheiro operando o sistema, I want trace correlacionado ponta a ponta e um workflow durável mínimo so that toda ação seja atribuível, observável e reexecutável (princípio do `AGENTS.md`).

**Why P2**: Deliverables M0 (OTel correlation, one durable workflow hello path); EP-003/EP-004; não bloqueia a demo do registro, mas bloqueia o exit do slice.

**Acceptance Criteria**:

1. WHEN the register-project command executes THEN the system SHALL correlate UI, API, outbox and projection spans under a single OTel trace via the propagated `correlationid`.
2. The walking skeleton SHALL include one durable workflow hello path whose checkpoint survives a process restart.
3. IF the workflow process is killed after a checkpoint THEN the workflow SHALL resume from that checkpoint on restart without repeating completed steps.

**Independent Test**: Executar o registro, abrir o trace e conferir spans correlacionados; matar o processo do workflow após checkpoint e conferir retomada sem repetição.

---

### P2: Node enroll e sync dummy

**User Story**: As a operador de um projeto local, I want um Node skeleton que se registra no Hub e sincroniza um artefato dummy so that o protocolo Hub↔Node exista desde o M0 (ADR-001).

**Why P2**: Exit M0 ("Node enroll/sync dummy artifact"); base do EP-031.

**Acceptance Criteria**:

1. WHEN a local Node enrolls with the Hub THEN the Hub SHALL register the Node identity and SHALL acknowledge the enrollment.
2. WHEN the enrolled Node syncs a dummy artifact THEN the Hub SHALL record the artifact reference with its content digest.
3. IF a non-enrolled Node attempts to sync THEN the Hub SHALL reject the request.

**Independent Test**: `node init` + enroll contra o Hub local, sync de artefato dummy, conferir registro com digest; tentar sync sem enroll e conferir rejeição.

---

### P2: Schemas v0 dos contratos

**User Story**: As a agente construindo os próximos slices, I want schemas v0 versionados para project, evidence, proposal, decision e event so that todo contrato seja validado por schema desde o início (`AGENTS.md`).

**Why P2**: Deliverable M0 ("schemas v0"); EP-001 (schema validation).

**Acceptance Criteria**:

1. The repository SHALL provide versioned v0 schemas for project, evidence, proposal, decision and event.
2. WHEN a manifest or event payload is validated against its v0 schema THEN the system SHALL reject payloads that violate the schema.
3. WHEN the example manifests in `examples/` are validated against the v0 schemas THEN validation SHALL pass.

**Independent Test**: Rodar a validação de schema contra `examples/*.yaml` (passa) e contra um payload mutilado (falha).

---

## Edge Cases

- IF the projection consumer receives a duplicate delivery of the registration event THEN it SHALL apply it as a no-op returning the prior result (inbox pattern, event contract §4).
- IF the outbox dispatcher is down WHILE a project is registered THEN the event SHALL remain pending and SHALL be delivered after recovery without loss.
- IF a session carries no workspace scope THEN any project-scoped request SHALL be denied.
- WHEN two projects are registered concurrently in the same workspace THEN both events SHALL carry distinct `projectid` values and neither registration SHALL be lost.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| TRUST-01 | P1: Registro ponta a ponta — comando+outbox (CORE-FR-001, EP-003, exit M0) | Design | Pending |
| TRUST-02 | P1: Registro ponta a ponta — projeção→UI (exit M0) | Design | Pending |
| TRUST-03 | P1: Registro ponta a ponta — extensions obrigatórias (event contract §2) | Design | Pending |
| TRUST-04 | P1: Registro ponta a ponta — idempotência de comando (event contract §4, exit M0) | Design | Pending |
| TRUST-05 | P1: Registro ponta a ponta — conflito de key reutilizada (event contract §4) | Design | Pending |
| TRUST-06 | P1: Identidade/tenancy — sessão escopada (EP-002, ADR-014) | Design | Pending |
| TRUST-07 | P1: Identidade/tenancy — negação cross-tenant (exit M0) | Design | Pending |
| TRUST-08 | P1: Identidade/tenancy — auditoria de negação (EP-002) | Design | Pending |
| TRUST-09 | P1: Identidade/tenancy — deny-by-default (deliverable M0) | Design | Pending |
| TRUST-10 | P2: Observabilidade — trace correlacionado (deliverable M0, EP-004) | Design | Pending |
| TRUST-11 | P2: Workflow durável — hello path com checkpoint (deliverable M0, EP-003) | Design | Pending |
| TRUST-12 | P2: Node — enroll/ack (exit M0, ADR-001) | Design | Pending |
| TRUST-13 | P2: Node — sync dummy com digest (exit M0) | Design | Pending |
| TRUST-14 | P2: Node — rejeição sem enroll (EP-002) | Design | Pending |
| TRUST-15 | P2: Schemas v0 — cinco contratos versionados (deliverable M0, EP-001) | Design | Pending |
| TRUST-16 | P2: Schemas v0 — validação rejeita payload inválido (EP-001) | Design | Pending |

**ID format:** `TRUST-NN`

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

**Coverage:** 16 total, 0 mapped to tasks (tasks são criadas na fase Tasks deste slice), 0 unmapped — cada ID cita sua âncora nas docs-fonte.

---

## Success Criteria

- [ ] Demo: registrar projeto no console e vê-lo aparecer via projeção, com trace único no OTel.
- [ ] Suites negativas de cross-tenant e idempotência verdes.
- [ ] Node enroll + sync dummy demonstrados contra o Hub local.
- [ ] `examples/*.yaml` validam contra os schemas v0.
- [ ] Checklist de review do slice (sequência de construção) respondido antes de abrir o Slice 1.
