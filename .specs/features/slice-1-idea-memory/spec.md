# Slice 1 — Idea Memory Specification

## Problem Statement

O trust skeleton (Slice 0) registra um projeto como um blob de manifest opaco: não há hipóteses, artefatos, decisões ou timeline navegáveis — exatamente o "graph-shaped domain model" que o [modelo de conhecimento](../../../docs/02-architecture/03-knowledge-model.md) exige em vez de "JSON blobs sem relações tipadas" (rejeitado por ADR-005). Este slice entrega a primeira Project Twin útil sem exigir código: capturar intenção e hipóteses no registro, anexar artefatos versionados, registrar decisões com review triggers, e servir um Project Overview e uma Timeline — provando que "o produto serve sem código" ([sequência de construção](../../../docs/06-delivery/05-build-sequence.md), Slice 1; milestone M1 do [roadmap](../../../docs/06-delivery/01-mvp-and-roadmap.md)).

**Fonte de verdade**: [PRD-002](../../../docs/01-product/PRD-002-project-registry.md) (REG-FR-001..015), [modelo de conhecimento](../../../docs/02-architecture/03-knowledge-model.md), [manifest spec](../../../docs/07-specifications/01-project-manifest-spec.md), épicos EP-010/EP-011/EP-013, ADR-002, ADR-005, ADR-009, ADR-014.

## Goals

- [ ] Hipóteses e constraints do manifest viram entidades tipadas e consultáveis, não apenas campos dentro do JSONB do manifest.
- [ ] Artefatos são anexáveis e versionáveis, com histórico de versões preservado.
- [ ] Decisões são registradas com review trigger e aparecem antes de qualquer proposta relacionada (base para REG-FR-014/015 e o guard de "rejeição não reaparece" do `AGENTS.md`).
- [ ] Project Overview e Timeline agregam identidade, hipóteses, artefatos e decisões em uma única leitura.
- [ ] Export produz um manifest portável que reimporta preservando IDs e relações (REG-FR-012).

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Sensores/discovery automático (observed values) | Slice 2; este slice só cobre `declared` — `observed`/`inferred` exigem o Node/Cartographer |
| Qualquer agente, proposal ou finding | Slices 3+; anti-sequence explícita da sequência de construção |
| Reconciliação de duplicatas de enterprise import | PRD-002 §6 "Enterprise import"; fora do escopo deste slice (não há import de catálogo ainda) |
| UI de edição rica (drag-and-drop, graph canvas) | PRD-006/Slice 8+; este slice usa formulários simples, como o Slice 0 |
| Multi-tipo de projeto além de `idea`/`product` nos testes | O schema já suporta os 7 tipos; os fluxos são exercitados com `idea` e `product`, suficientes para provar o modelo sem exigir todos os tipos |
| Portfolio/relações cross-workspace | REG-FR-005 cobre relações; relações cross-workspace autorizadas ficam para quando portfolio existir (Slice 8) |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | --------------- | --------- | ---------- |
| Estratégia de versionamento de artifact | Uma linha por versão em `artifact_versions` (append-only), nunca diff/patch | Espelha o padrão já usado em `outbox`/`workflow_steps` no Slice 0; diffing é complexidade sem requisito que a exija agora | n |
| Onde persistir hipóteses/constraints | Tabelas tipadas próprias (`hypotheses`, `constraints`) referenciando `projects`, populadas na mesma transação do registro/update do manifest | ADR-005 rejeita "JSON blobs sem relações tipadas"; o knowledge model lista Hypothesis/Constraint como entidades de primeira classe | y |
| Autoridade dos campos neste slice | Todo campo gravado por este slice tem `authority = declared` | REG-FR-003 exige separar declared/observed/inferred; só `declared` existe até o Slice 2 introduzir sensores | y |
| Formato do export | JSON com `apiVersion`/`kind: EvolutionProject` (mesma forma do manifest de registro) mais os arrays de hipóteses/artifacts/decisions materializados, IDs preservados | Manifest spec §5 exige apiVersion/kind sempre presentes no export; reaproveita o schema v0 já existente | y |
| Escopo do "timeline" | Endpoint que une hypothesis status changes, artifact versions e decisions por `occurred_at`, ordenado desc, sem paginação cursor-based neste slice | Timeline é um requisito de leitura (PRD-002 §9); paginação cursor-based é regra geral da API (`10-api-event-model.md` §3) mas adicionar cursor a uma lista que cabe inteira em memória no M1 é escopo prematuro — resultado limitado a 200 itens com nota se truncado | n |

**Open questions:** none - all resolved or logged above.

---

## User Stories

### P1: Hipóteses e constraints como entidades tipadas ⭐ MVP

**User Story**: As a fundador de uma ideia sem código, I want registrar minha ideia com hipóteses e constraints so that a plataforma preserve minha intenção de forma consultável, não apenas como texto solto.

**Why P1**: É o requisito central do modo "idea" do PRD-002 e a base de tudo que segue (decisões e proposals referenciam hipóteses).

**Acceptance Criteria**:

1. WHEN a project manifest submitted to register-project includes `spec.hypotheses` THEN the system SHALL persist each hypothesis as a typed row linked to the project, preserving its `id`, `statement`, `type`, `evidenceState`, `metric`, `threshold` and `status`.
2. WHEN a project manifest includes `spec.constraints` THEN the system SHALL persist each constraint as a typed row linked to the project, preserving its `id`, `category`, `statement`, `severity` and `authority`.
3. The system SHALL record `authority = 'declared'` on every hypothesis and constraint persisted by this story.
4. WHEN a client lists a project's hypotheses THEN the system SHALL return them ordered by creation order with their current `status`.
5. IF a manifest declares two hypotheses with the same `id` THEN the system SHALL reject the registration with a 422 naming the duplicate ID.

**Independent Test**: Registrar um projeto `idea` com 2 hipóteses e 1 constraint; buscar `GET /projects/:id/hypotheses` e conferir os 3 campos e `authority=declared`; reenviar com ID de hipótese duplicado e conferir 422.

---

### P1: Project Overview agregado

**User Story**: As a stakeholder de um projeto, I want uma visão única com identidade, hipóteses, artefatos e decisões so that eu entenda o estado do projeto sem navegar múltiplas telas.

**Why P1**: É a "Experiência principal" do PRD-002 §9 e a prova de valor sem código do Slice 1.

**Acceptance Criteria**:

1. WHEN a client requests the overview of an existing project THEN the system SHALL return identity, intent, hypotheses, constraints, artifact count and decision count in one response.
2. IF the requesting session belongs to a different tenant THEN the system SHALL deny the overview request the same way it denies a direct project read (TRUST-07 pattern).
3. The console SHALL render the Project Overview page from this single aggregated response.

**Independent Test**: Abrir a página de overview de um projeto registrado com hipóteses/artefatos/decisões e conferir que todos os blocos aparecem numa carga; tentar com sessão de outro tenant e conferir negação.

---

### P2: Artefatos versionados

**User Story**: As a mantenedor de um projeto, I want anexar artefatos (PRD, ADR, diagrama) e atualizar suas versões so that o histórico de evidência declarada seja preservado.

**Why P2**: REG-FR-006/007; necessário para decisões referenciarem artefatos, mas não bloqueia a demo do overview.

**Acceptance Criteria**:

1. WHEN a client attaches an artifact to a project with a type, title and reference THEN the system SHALL create the artifact at version 1.
2. WHEN a client submits a new version of an existing artifact THEN the system SHALL append a new `artifact_versions` row incrementing the version number and SHALL preserve every prior version unchanged.
3. WHEN a client lists a project's artifacts THEN the system SHALL return each artifact's current version and version count.
4. IF a client requests a specific past version of an artifact THEN the system SHALL return that exact version's content, not the current one.

**Independent Test**: Anexar um artifact, atualizar sua versão duas vezes, listar artifacts (mostra v3), buscar v1 explicitamente e conferir que retorna o conteúdo original.

---

### P2: Decisões com review trigger

**User Story**: As a responsável por uma decisão de projeto, I want registrar a decisão com alternativas, justificativa e review trigger so that decisões rejeitadas não sejam propostas de novo sem evidência nova (regra do `AGENTS.md`).

**Why P2**: Base direta do guard "rejected decision é encontrada antes de nova proposal relacionada" (critério de aceite transversal); usado pelos Slices 3+.

**Acceptance Criteria**:

1. WHEN a client records a decision for a project THEN the system SHALL persist the decision, its author, rationale, alternatives considered and an optional review trigger.
2. WHEN a decision references a hypothesis or artifact THEN the system SHALL store that link so the decision is retrievable from the referenced entity.
3. WHEN a client lists a project's decisions THEN the system SHALL return them ordered most-recent-first with their review trigger status (`none`, `pending`, `satisfied`).
4. IF a new decision is recorded for the same subject as a prior rejected decision THEN the system SHALL surface the prior rejected decision in the response rather than silently accepting the new one as unrelated.

**Independent Test**: Registrar uma decisão `reject` com review trigger; registrar uma segunda decisão sobre o mesmo assunto e conferir que a resposta expõe a decisão rejeitada anterior.

---

### P3: Timeline e export/import

**User Story**: As a agente ou pessoa retomando um projeto, I want uma timeline unificada e um export portável so that eu reconstrua o histórico e migre o projeto sem depender do Hub.

**Why P3**: Valor real (REG-FR-012, PRD-002 §9), mas o produto já demonstra valor sem essas duas capacidades — não bloqueia o MVP do slice.

**Acceptance Criteria**:

1. WHEN a client requests a project's timeline THEN the system SHALL return hypothesis status changes, artifact version events and decisions merged and ordered by `occurred_at` descending.
2. WHEN a client exports a project THEN the system SHALL return a portable manifest containing `apiVersion`, `kind`, identity, intent, hypotheses, constraints, current artifact versions and decisions.
3. WHEN a previously exported manifest is submitted to import THEN the system SHALL recreate the project preserving the original entity IDs and relations.
4. IF an import target ID already exists in the tenant THEN the system SHALL reject the import as a conflict rather than overwriting silently.

**Independent Test**: Exportar um projeto com hipóteses/artifacts/decisions; importar o export em um novo registro e comparar IDs; reimportar o mesmo export e conferir rejeição por conflito.

---

## Edge Cases

- IF a manifest has no `spec.hypotheses` or `spec.constraints` THEN the system SHALL register the project with empty hypothesis/constraint lists rather than failing.
- IF an artifact version submission omits the reference/content THEN the system SHALL reject it with 422 before creating any row.
- WHEN a decision has no review trigger THEN its trigger status SHALL be `none`, distinguishing it from a real pending trigger.
- IF a hypothesis or artifact referenced by a decision does not belong to the same project THEN the system SHALL reject the decision with 422.
- IF the overview is requested for a project with zero hypotheses, artifacts and decisions THEN the system SHALL return the identity block with empty arrays, not an error.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| IDEA-01 | P1: Hipóteses/constraints — persistência tipada (REG-FR-003/009) | Design | Pending |
| IDEA-02 | P1: Hipóteses/constraints — authority declared (REG-FR-003) | Design | Pending |
| IDEA-03 | P1: Hipóteses/constraints — listagem ordenada | Design | Pending |
| IDEA-04 | P1: Hipóteses/constraints — ID duplicado rejeitado | Design | Pending |
| IDEA-05 | P1: Overview — agregação única (PRD-002 §9) | Design | Pending |
| IDEA-06 | P1: Overview — isolamento cross-tenant (ADR-014) | Design | Pending |
| IDEA-07 | P1: Overview — renderizado no console | Design | Pending |
| IDEA-08 | P2: Artefatos — criação v1 (REG-FR-006) | Design | Pending |
| IDEA-09 | P2: Artefatos — nova versão preserva histórico (REG-FR-007) | Design | Pending |
| IDEA-10 | P2: Artefatos — listagem com versão atual | Design | Pending |
| IDEA-11 | P2: Artefatos — leitura de versão específica | Design | Pending |
| IDEA-12 | P2: Decisões — registro com rationale/alternatives | Design | Pending |
| IDEA-13 | P2: Decisões — link a hipótese/artifact | Design | Pending |
| IDEA-14 | P2: Decisões — listagem com review trigger status | Design | Pending |
| IDEA-15 | P2: Decisões — rejeição anterior exposta (guard AGENTS.md) | Design | Pending |
| IDEA-16 | P3: Timeline — merge ordenado | Design | Pending |
| IDEA-17 | P3: Export — manifest portável (REG-FR-012) | Design | Pending |
| IDEA-18 | P3: Import — preserva IDs | Design | Pending |
| IDEA-19 | P3: Import — conflito de ID existente | Design | Pending |

**ID format:** `IDEA-NN`

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

**Coverage:** 19 total, 0 mapped to tasks (mapeado na fase Tasks), 0 unmapped — cada ID cita sua âncora nas docs-fonte.

---

## Success Criteria

- [ ] `validate_spec.py` sai 0 para esta spec.
- [ ] Uma ideia sem código é registrável com hipóteses e constraints e aparece completa no Project Overview.
- [ ] Um artifact ganha 3 versões e a versão 1 permanece recuperável e inalterada.
- [ ] Uma decisão rejeitada é encontrada ao registrar uma decisão relacionada nova (guard funcional).
- [ ] Export → import round-trip preserva IDs sem duplicar.
- [ ] Verifier independente reporta PASS em `validation.md`.
