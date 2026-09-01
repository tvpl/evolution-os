# Slice 6 — Harness Vertical Specification

## Problem Statement

Até o Slice 5, o EvolutionOS decide sobre ideias, sistemas e repositórios — mas não olha para o próprio harness agentic (modelos, skills, MCPs) que o produto usa para decidir. O `AGENTS.md`/build-sequence exige que o Slice 6 feche esse elo: **declarar o inventário de um harness (skills/MCPs/modelos) → declarar um dataset de eval → rodar o eval deterministicamente contra o inventário atual → alimentar um experimento de upgrade/remoção (reusando o loop do Slice 4) com o score → expor tudo numa visão agregada (Harness Observatory)**. Valor do slice ([sequência de construção](../../../docs/06-delivery/05-build-sequence.md), Slice 6): "diferenciação explícita do produto" — o EvolutionOS aplica a si mesmo a mesma disciplina que aplica a qualquer outro sistema que evolui.

**Fonte de verdade**: PRD-001 (`CORE-FR-001`: harness é um tipo de `project` de primeira classe no Project Twin), [catálogo de skills](../../../docs/03-agents/04-skill-catalog.md) (harness intelligence: inventory, audits, model-upgrade-experiment, agent-eval-design), [catálogo de MCPs](../../../docs/03-agents/05-mcp-connector-catalog.md) (§10 AI/harness sources), [observabilidade e evals](../../../docs/02-architecture/09-observability-evals.md) (§6 pirâmide de eval, §8 golden datasets, §9 gate de promoção genérico model/prompt/skill/policy/module), [PRD-006](../../../docs/01-product/PRD-006-dashboards-experience.md) §3.6 (Harness Observatory), ADR-013 (providers plugáveis, eval antes de promoção), épicos EP-041, EP-043.

## Goals

- [x] Um projeto do tipo `harness` pode declarar um inventário versionado (skills/MCPs/modelos) e ler o inventário mais recente.
- [x] Um dataset de eval (casos com invariantes determinísticos) pode ser declarado e listado para um harness.
- [x] Rodar o dataset contra o inventário atual produz um score determinístico (passed/total) por caso, sem chamada a LLM.
- [x] O score de um eval run alimenta a avaliação de um experimento de upgrade/remoção do Slice 4 SEM nenhuma mudança no mecanismo de experimento — reuso direto, não duplicação.
- [x] Uma visão agregada (Harness Observatory) expõe inventário + eval cases + último eval run num único lugar.

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Avaliação por LLM-as-judge / execução real de skills e MCPs | Sem credenciais de model provider confirmadas neste ambiente para o produto (mesma razão dos Slices 3-5); os 4 tipos de invariante deste slice são checks estruturais determinísticos sobre o inventário DECLARADO, nunca uma execução real — mesmo padrão de deferimento do ADR-013 |
| Auditorias automáticas (`skill-lifecycle-audit`, `mcp-capability-audit`, `instruction-debt-review`, `context-strategy-review` do catálogo de skills) | São skills/módulos completos do produto final, não um vertical slice; este slice entrega a base de dados (inventory + eval) que essas auditorias consumiriam depois |
| Shadow runs e canary real (observability-evals.md §6 L4/L5) | Exigiriam tráfego real de produção contra duas versões — infra fora de alcance; o gate de promoção deste slice usa o mesmo mecanismo síncrono de experimento do Slice 4 (proof + veredito determinístico), não canary ao vivo |
| Dashboard visual do Harness Observatory (PRD-006 §3.6) | Este slice entrega o endpoint de dados agregados; a UI é responsabilidade do `apps/console`, fora do escopo do Hub |
| Novo mecanismo de promoção/rollback | Reusa o gate genérico já documentado (`observability-evals.md` §9) via o experimento do Slice 4 (`start → evaluate → close`) sem alteração — nenhuma tabela ou endpoint novo de "promoção" é criado |
| Múltiplas versões de dataset de eval (dataset splits, holdout, adversarial sets per `agent-evaluation-model.md` §7) | MVP usa um único conjunto de casos por harness; segmentação de dataset é extensão futura |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | --------------- | --------- | ---------- |
| "Harness" é um `project` de tipo `harness` | Reusa a tabela `projects`/`registerProject` (Slice 0) sem tabela nova para a entidade harness em si | `PRD-001` CORE-FR-001 já lista `harness` como exemplo de `metadata.type`; o schema v0 aceita qualquer string não vazia (sem enum fechado) — nenhuma mudança de schema necessária | y |
| Tipos de invariante do eval determinístico | 4 tipos fechados: `requires_skill` (skillId), `requires_mcp` (mcpId), `forbids_mcp` (mcpId), `min_component_count` (category em `{skills,mcps,models}` + min) | Cobre os casos mais objetivamente checáveis sem julgamento (presença/ausência/contagem); mesma disciplina do Challenger do Slice 3 — só o que é determinável sem LLM | y |
| Score do eval run | Razão `passed/total` (0 a 1), usada como `observedValue` do experimento do Slice 4 sem conversão | `VerificationPlan.threshold` do Slice 4 já é `number` com `comparison: gte\|lte` — uma proporção 0-1 é o formato mais direto, sem inventar uma escala nova | y |
| Upgrade/removal experiment | Reusa `POST /projects/:id/proposals/:proposalId/experiments` e `submitEvaluation` do Slice 4 inalterados; este slice só adiciona um endpoint de conveniência que roda o eval e chama `submitEvaluation` internamente | `observability-evals.md` §9 descreve o MESMO gate genérico para "model, prompt, skill, policy ou module" — duplicar o mecanismo de experimento seria contradizer a própria doc-fonte | y |
| Versionamento do inventário | Append-only com coluna `version` incremental por projeto (mesmo padrão de `artifact_versions` do Slice 1); `GET` sempre retorna a versão mais recente | Consistente com o padrão já estabelecido; permite auditoria de mudanças de inventário sem endpoint extra | y |
| Capability nova | `harness.write` (inventário + eval cases + eval runs) — reusa o mesmo `capability_grants` deny-by-default | Consistente com uma capability por domínio desde o Slice 0; o endpoint de avaliação-por-eval-run reusa `experiment.write` do Slice 4 (é uma operação sobre um experimento existente, não uma operação nova de harness) | y |

**Open questions:** none - all resolved or logged above.

---

## User Stories

### P1: Declarar e ler o inventário do harness ⭐ MVP

**User Story**: As a responsável pelo harness, I want declarar quais skills, MCPs e modelos compõem o harness so that exista uma fonte de verdade versionada do que o harness realmente usa (`harness-inventory`, catálogo de skills).

**Why P1**: É o degrau zero — sem inventário, não há o que avaliar.

**Acceptance Criteria**:

1. WHEN a client declares an inventory (`skills`, `mcps`, `models` arrays, each item with `id`, `name`, `version`) for a `harness` project THEN the system SHALL persist it as a new versioned entry and it SHALL become the current inventory.
2. WHEN a client requests a harness's current inventory THEN the system SHALL return the most recently declared version.
3. IF a client declares an inventory for an unknown project THEN the system SHALL reject it with 404.

**Independent Test**: Declarar um inventário com 1 skill e 1 MCP; ler o inventário e conferir os mesmos itens; declarar um segundo inventário e conferir que a leitura retorna o segundo, não o primeiro.

---

### P1: Declarar e listar o dataset de eval

**User Story**: As a responsável pelo harness, I want declarar casos de eval com invariantes determinísticos so that a qualidade do harness seja checável sem depender de julgamento de LLM (`agent-eval-design`, catálogo de skills).

**Why P1**: Sem dataset, não há o que rodar.

**Acceptance Criteria**:

1. WHEN a client declares an eval case with a `name`, an `invariantType` in `{requires_skill, requires_mcp, forbids_mcp, min_component_count}`, and matching `params` THEN the system SHALL persist it linked to the harness project.
2. IF a client declares an eval case with an `invariantType` outside that set, or with `params` missing the fields that type requires THEN the system SHALL reject it with 422.
3. WHEN a client lists a harness's eval cases THEN the system SHALL return all of them.

**Independent Test**: Declarar um caso `requires_skill` e um caso `min_component_count`; listar e conferir os dois; declarar um caso com `invariantType` desconhecido e conferir 422.

---

### P1: Rodar o eval determinístico contra o inventário atual

**User Story**: As a responsável pelo harness, I want rodar o dataset contra o inventário atual e receber um score por caso so that eu saiba objetivamente se o harness atende os invariantes declarados.

**Why P1**: É o coração do slice — sem isso, inventário e dataset não produzem nenhum valor.

**Acceptance Criteria**:

1. WHEN a client runs the eval dataset for a harness that has both a current inventory and at least one eval case THEN the system SHALL evaluate every case deterministically against that inventory, persist a run with a per-case pass/fail result and reason, and return an overall score (`passed`/`total`).
2. IF the harness has no inventory declared yet THEN running the eval SHALL be rejected with 422.
3. IF the harness has no eval cases declared THEN running the eval SHALL be rejected with 422.

**Independent Test**: Declarar um inventário sem o skill exigido por um caso `requires_skill`; rodar o eval e conferir que esse caso falha com um motivo específico; declarar o skill, rodar de novo, e conferir que o caso passa.

---

### P1: Score do eval run alimenta um experimento de upgrade/remoção (reuso do Slice 4)

**User Story**: As a responsável pelo harness, I want que o score do eval run vire a avaliação de um experimento de upgrade/remoção já em andamento so that a decisão de promover ou reverter uma mudança de harness siga o MESMO gate genérico usado para qualquer outra proposta (`observability-evals.md` §9), sem um mecanismo paralelo.

**Why P1**: Fecha o vertical slice mandatado pelo `AGENTS.md`: proposta de mudança de harness → experimento (Slice 4) → prova (este eval) → decisão preservada (Slice 1/3).

**Acceptance Criteria**:

1. WHEN a client requests evaluating a `running` harness experiment from the eval dataset THEN the system SHALL run the dataset against the harness's current inventory, compute the score, and submit it as the `observedValue` to that experiment's evaluation via the unchanged Slice 4 `submitEvaluation` mechanism, returning the same verdict shape Slice 4 already returns.
2. IF the referenced experiment does not belong to this harness project THEN the system SHALL reject it with 404.
3. IF the referenced experiment is not `running` THEN the system SHALL reject it with 409 (the same guard already enforced by Slice 4, surfaced here).

**Independent Test**: Iniciar um experimento (Slice 4) a partir de uma proposal `readyForReview` do harness; chamar o endpoint de avaliação-por-eval-run; conferir que o experimento vai a `evaluated` com o veredito calculado a partir do score do eval run, exatamente como uma chamada direta a `POST .../evaluate` faria.

---

### P1: Harness Observatory — visão agregada

**User Story**: As a responsável pelo harness, I want ver inventário, dataset e último eval run num único lugar so that eu não precise juntar informação de 3 endpoints manualmente (PRD-006 §3.6).

**Why P1**: É a entrega de valor visível do slice — sem uma visão agregada, o restante fica disperso em endpoints isolados.

**Acceptance Criteria**:

1. WHEN a client requests the Harness Observatory view for a harness project THEN the system SHALL return the current inventory, the count of declared eval cases, and the most recent eval run's score (or an explicit absence marker if no run exists yet).
2. IF requested for an unknown project THEN the system SHALL reject it with 404.

**Independent Test**: Antes de qualquer eval run, conferir que a Observatory mostra a ausência explícita de run; depois de um eval run, conferir que a Observatory mostra o score desse run.

---

## Edge Cases

- IF a client accesses any new route cross-tenant THEN the system SHALL return 403.
- IF an eval case's `params` reference a `category` outside `{skills, mcps, models}` for `min_component_count` THEN the system SHALL reject it with 422 (same closure as Edge Case in P1 story 2).
- WHEN an eval run's score is `0/total` (every case fails) THEN the system SHALL still persist and return the run — a zero score is a real result, never treated as an error.
- IF a client requests the current inventory for a harness with no inventory declared yet THEN the system SHALL return 404 (distinct from an empty inventory, which is a declared-but-empty state and would return 200 with empty arrays).

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| HRN-01 | P1: Inventário — declaração versionada | Execute | Verified |
| HRN-02 | P1: Inventário — leitura da versão mais recente | Execute | Verified |
| HRN-03 | P1: Inventário — rejeita projeto inexistente | Execute | Verified |
| HRN-04 | P1: Eval dataset — declaração de caso | Execute | Verified |
| HRN-05 | P1: Eval dataset — rejeita invariantType/params inválidos | Execute | Verified |
| HRN-06 | P1: Eval dataset — listagem | Execute | Verified |
| HRN-07 | P1: Eval run — execução determinística com score | Execute | Verified |
| HRN-08 | P1: Eval run — rejeita sem inventário | Execute | Verified |
| HRN-09 | P1: Eval run — rejeita sem eval cases | Execute | Verified |
| HRN-10 | P1: Avaliação de experimento via eval run (reuso Slice 4) | Execute | Verified |
| HRN-11 | P1: Avaliação — rejeita experimento de outro projeto | Execute | Verified |
| HRN-12 | P1: Avaliação — rejeita experimento não running | Execute | Verified |
| HRN-13 | P1: Observatory — visão agregada | Execute | Verified |
| HRN-14 | P1: Observatory — rejeita projeto inexistente | Execute | Verified |

**ID format:** `HRN-NN`

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

**Coverage:** 14 total, 0 mapped to tasks (mapeado na fase Tasks), 0 unmapped — cada ID cita sua âncora na spec acima.

---

## Success Criteria

- [x] `validate_spec.py` sai 0 para esta spec.
- [x] O vertical slice completo roda ponta a ponta: declarar inventário → declarar dataset → rodar eval determinístico → score alimenta a avaliação de um experimento do Slice 4 sem nenhuma mudança no mecanismo de experimento → Observatory mostra tudo agregado.
- [x] Um caso `requires_skill` cujo skill não está no inventário falha com um motivo específico, não um erro genérico.
- [x] Nenhuma chamada a LLM ou execução real de skill/MCP acontece em nenhum endpoint deste slice.
- [x] Verifier independente reporta PASS em `validation.md`.
