# Slice 8 — Portfolio Campaign Specification

## Problem Statement

Até o Slice 7, cada projeto evolui isoladamente — nada liga um `portfolio` a seus projetos-membro, e não existe um jeito de coordenar uma mudança comum (ex. uma dependência desatualizada compartilhada) através de vários projetos sem perder a autonomia de cada equipe. O `spec.relations` já é declarado no manifest schema v0 (`examples/evolution.project.example.yaml`, CORE-FR-002) mas nunca foi persistido/consultado por nenhum código do Hub. Este slice implementa CORE-FR-002 pela primeira vez e entrega o vertical slice de portfolio/campaign mandatado pelo [build-sequence](../../../docs/06-delivery/05-build-sequence.md) (Slice 8): "Multiple projects/relationships; Common finding; Cohort/canary/waves; Exceptions; Portfolio dashboard" — valor: "uma visão do portfólio que mostra onde obsolescência, dívida, risco ou perda de diferenciação estão se formando e permite campanhas coordenadas sem retirar autonomia das equipes" (PRD-001 §6).

**Fonte de verdade**: [PRD-001](../../../docs/01-product/PRD-001-core-platform.md) §8 "Portfólio e campanhas" (CORE-FR-050..054) e CORE-FR-002 (relações entre projetos), [topologias de implantação](../../../docs/02-architecture/07-deployment-topologies.md) (portfolio dashboard e campaign orchestration são recursos de perfil Team/Enterprise, nunca Lite), épico EP-052.

## Goals

- [ ] Um projeto pode declarar uma relação tipada com outro projeto do mesmo org (`composition`, `dependency`, `implementation`, `ownership` ou `influence` — os 5 termos de CORE-FR-002), consultável nos dois sentidos.
- [ ] Um portfolio tem um dashboard agregado que soma, por projeto-membro (relação `composition`), contagens determinísticas de proposals abertas, decisions rejeitadas e experiments em andamento — sem inventar uma fórmula de "score" de saúde não especificada em nenhuma doc-fonte.
- [ ] Uma campaign nasce de um finding comum e organiza os projetos-alvo em waves (cohorts) sequenciais — uma wave só libera para conclusão depois que a wave anterior está inteiramente resolvida (completed ou exempted), dando o comportamento canary/gradual exigido pelo build-sequence.
- [ ] Um projeto-alvo pode receber uma exceção local a uma campaign com justificativa obrigatória, contando como resolvido para efeito de liberar a próxima wave, sem apagar o rastro de que foi uma exceção.
- [ ] O progresso de uma campaign é comparável entre projetos sem nenhum campo de ranking/score — apenas status e wave, nunca uma posição relativa "punitiva" entre equipes (CORE-FR-053).

## Out of Scope

| Feature | Reason |
| --- | --- |
| Detecção automática de "finding comum" entre projetos (correlação de sinais/claims por similaridade) | Exigiria embeddings/LLM não confirmados neste ambiente (mesma razão dos Slices 3-7, ADR-013); o finding comum é declarado explicitamente por quem cria a campaign, não inferido |
| Fórmula de "health score" ponderado (0-100, "saúde"/"risco" como número único) | Nenhuma doc-fonte define os pesos; inventar uma fabricaria um contrato não ancorado. O dashboard expõe contagens determinísticas diretas (proposals/decisions/experiments), não um score sintético |
| Agrupamento do dashboard por `domain`/`owner`/`technology` (labels livres do manifest) | CORE-FR-050 menciona esses eixos, mas `metadata.labels` é um mapa livre sem taxonomia fechada em nenhuma doc-fonte; construir um índice genérico de labels é desproporcional a este MVP. O dashboard agrega por portfolio (relações `composition`), o eixo com semântica já definida por CORE-FR-002 |
| Execução real de uma mudança por campaign (merge/deploy automático em cada projeto-alvo) | Uma campaign referencia, por item, um `proposalId` opcional do projeto-alvo — a execução real da mudança reusa o loop de proposal→experiment→decisão já existente (Slices 3-5), nunca um mecanismo de rollout paralelo |
| UI de dashboard/campaign (visualização) | Responsabilidade do `apps/console`, fora do escopo do Hub (mesmo precedente dos Slices 6/7) |
| Perfil Lite | Portfolio dashboard e campaign orchestration são explicitamente recursos Team/Enterprise (`07-deployment-topologies.md` §11: "Portfolio dashboard: Lite —"), nunca Lite; este slice não precisa preservar compatibilidade Lite |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Tipos de relação fechados | `{composition, dependency, implementation, ownership, influence}` | Os 5 termos vêm literalmente de CORE-FR-002 ("composição, dependência, implementação, ownership e influência"); nenhuma doc-fonte lista um set diferente | y |
| Direção da relação | `sourceProjectId`→`targetProjectId` explícito na tabela, sem um campo `direction` separado (o exemplo do manifest tem `direction: outbound`, mas isso é redundante quando source/target já são colunas distintas) | Simplifica sem perder informação — quem declarou e o alvo já determinam a direção | y |
| Escopo do dashboard | Agrega SOMENTE os projetos ligados ao portfolio por relação `composition` (membros diretos); não segue relações transitivas (portfolio de portfolios) | MVP; nenhuma doc-fonte pede agregação transitiva, e a query fica O(1 join) em vez de recursiva | y |
| Métricas do dashboard | Contagens diretas e determinísticas por projeto-membro: `openProposalsCount` (`draft`+`readyForReview`), `rejectedDecisionsCount`, `runningExperimentsCount` — reusando as tabelas dos Slices 3/4 sem nenhuma nova coluna de score | "Nunca fabricar": esses três números já existem no schema; um "health score" ponderado precisaria de pesos que nenhuma doc-fonte define | y |
| Item de campaign referencia mudança real | `campaign_items.proposal_id` é opcional, aponta para uma `proposals` row (Slice 3) já existente daquele projeto-alvo | Reusa o loop de proposal→experimento→decisão em vez de inventar um mecanismo de execução paralelo por campaign | y |
| Estado de um campaign item | `pending → completed` OU `pending → exempted`; ambos terminais, ambos contam como "resolvido" para liberar a wave seguinte | Modelo binário simples e suficiente para o gate de wave; nenhuma doc-fonte pede um terceiro estado | y |
| Liberação de wave (canary) | A wave N+1 só aceita `complete`/`exception` em seus items depois que TODOS os items da wave N estão `completed` ou `exempted` | É a semântica literal de "cohort/canary/waves" do build-sequence — uma wave prova antes da próxima avançar | y |
| Meta-capability do slice | `portfolio.write` cobre declarar relação, criar campaign, marcar item completed, conceder exceção; concedida aos dois tenants dev na mesma edição | Consistente com uma capability por domínio por slice desde o Slice 0 | y |
| Export de campaign | Retorna waves/items com status e justificativa de exceção, e — quando o item tem `proposalId` — as decisions daquele proposal via `listDecisions` (Slice 1) já existente, sem duplicar o mecanismo de decisão | "Reuse is king"; CORE-FR-054 pede "evidência e auditoria de decisões", que já são persistidas pelo Slice 1 | y |

**Open questions:** none - all resolved or logged above.

---

## User Stories

### P1: Declarar relações entre projetos ⭐ MVP

**User Story**: As a project owner, I want declarar uma relação tipada do meu projeto com outro projeto do mesmo org so that composição, dependência, implementação, ownership e influência fiquem consultáveis nos dois sentidos (CORE-FR-002).

**Why P1**: É o degrau zero — sem relações persistidas, não existe portfolio nem "membro".

**Acceptance Criteria**:

1. WHEN a client declares a relation with a `type` in `{composition, dependency, implementation, ownership, influence}` from a source project to a target project in the same org THEN the system SHALL persist it and it SHALL be listable from both the source's outbound relations and the target's inbound relations.
2. IF a client declares a relation with a `type` outside that set THEN the system SHALL reject it with 422.
3. IF a client declares a relation whose source or target project does not exist, or whose target belongs to a different org THEN the system SHALL reject it with 404.
4. IF a client declares the exact same `(source, target, type)` relation twice THEN the system SHALL treat it as an idempotent no-op (no duplicate row).

**Independent Test**: Declarar uma relação `composition` de um portfolio para um projeto; listar as relações do portfolio (outbound) e do projeto-membro (inbound) e conferir que ambas mostram a relação; declarar de novo e conferir que não duplica.

---

### P1: Dashboard agregado do portfolio

**User Story**: As a portfolio owner, I want ver contagens agregadas de proposals abertas, decisions rejeitadas e experiments em andamento por projeto-membro so that eu saiba onde dívida/risco estão se formando sem inventar um score que ninguém confirmou (CORE-FR-050).

**Why P1**: É a entrega de valor visível mínima do portfolio — sem isso, "portfolio" é só uma lista de nomes.

**Acceptance Criteria**:

1. WHEN a client requests a portfolio's dashboard THEN the system SHALL return every project linked to it by a `composition` relation, each with its exact `openProposalsCount`, `rejectedDecisionsCount`, and `runningExperimentsCount`.
2. IF a client requests the dashboard for an unknown project THEN the system SHALL reject it with 404.
3. WHILE a portfolio has zero `composition` relations THE system SHALL return an empty members list, not an error.

**Independent Test**: Ligar dois projetos a um portfolio por `composition`; criar 1 proposal aberta e 1 decision de rejeição num deles; pedir o dashboard e conferir as contagens exatas por projeto.

---

### P1: Criar uma campaign a partir de um finding comum, em waves

**User Story**: As a portfolio owner, I want criar uma campaign com um finding comum e organizar os projetos-alvo em waves sequenciais so that a mudança avance de forma gradual (canary), provando numa wave antes de seguir para a próxima (CORE-FR-051).

**Why P1**: É o coração do slice — sem waves, "campaign" é só uma lista plana sem a semântica canary exigida pelo build-sequence.

**Acceptance Criteria**:

1. WHEN a client creates a campaign with a non-empty `finding` and at least one wave, each wave a non-empty list of target project ids THEN the system SHALL persist the campaign with its waves and one `pending` item per target project per wave, in wave order.
2. IF a client creates a campaign with an empty wave, zero waves, or a target project that does not exist or belongs to a different org THEN the system SHALL reject it with 422 or 404 as appropriate, persisting nothing.
3. WHEN a client marks a campaign item in the FIRST wave as `completed` (optionally referencing a `proposalId` belonging to that target project) THEN the system SHALL update its status.
4. IF a client attempts to mark an item in wave N+1 as `completed` while any item in wave N is still `pending` THEN the system SHALL reject it with 409.
5. WHEN every item in wave N is `completed` or `exempted` THEN the system SHALL allow items in wave N+1 to be marked `completed` or granted an exception.

**Independent Test**: Criar uma campaign com 2 waves (1 projeto cada); tentar completar o item da wave 2 antes da wave 1 estar resolvida e conferir 409; completar o item da wave 1; completar o da wave 2 e conferir sucesso.

---

### P1: Exceções locais justificadas

**User Story**: As a project owner, I want pedir uma exceção local a um item de campaign com uma justificativa so that meu projeto não seja forçado a adotar a mudança sem que a razão fique registrada (CORE-FR-052).

**Why P1**: PRD-001 exige explicitamente "baseline organizacional com exceções locais justificadas" — sem isso, a campaign remove a autonomia que o produto promete preservar.

**Acceptance Criteria**:

1. WHEN a client grants an exception to a `pending` campaign item with a non-empty justification THEN the system SHALL set its status to `exempted` and persist the justification.
2. IF a client grants an exception with an empty or missing justification THEN the system SHALL reject it with 422.
3. WHEN every item in a wave is `completed` or `exempted` (mixed) THEN the system SHALL treat the wave as resolved for the purpose of unlocking the next wave (same rule as the completed-only case).

**Independent Test**: Conceder uma exceção sem justificativa e conferir 422; conceder com justificativa e conferir status `exempted`; misturar 1 `completed` + 1 `exempted` numa wave de 2 itens e conferir que a wave seguinte libera.

---

### P1: Comparar progresso sem ranking punitivo

**User Story**: As a portfolio owner, I want ver o progresso de uma campaign por projeto sem nenhum campo de ranking so that a comparação nunca vire um placar punitivo entre equipes (CORE-FR-053).

**Why P1**: É um requisito explícito e não-negociável do PRD-001 ("comparar progresso sem criar um ranking punitivo de equipes").

**Acceptance Criteria**:

1. WHEN a client requests a campaign's progress THEN the system SHALL return every item's `projectId`, `wave`, and `status` ordered by wave then by declaration order, and the response SHALL contain no rank, score, or relative-position field of any kind.
2. IF a client requests progress for an unknown campaign THEN the system SHALL reject it with 404.

**Independent Test**: Pedir o progresso de uma campaign com 2 waves e conferir que a resposta é uma lista ordenada por wave contendo apenas `projectId`/`wave`/`status` por item — nenhum outro campo.

---

### P1: Exportar evidência e auditoria da campaign

**User Story**: As a compliance reviewer, I want exportar uma campaign com o status de cada item, justificativas de exceção e as decisions dos proposals vinculados so that eu tenha uma trilha de auditoria completa (CORE-FR-054).

**Why P1**: Fecha o requisito explícito de exportação de evidência/auditoria do PRD-001.

**Acceptance Criteria**:

1. WHEN a client exports a campaign THEN the system SHALL return its finding, every wave with its items (status, exception justification when present), and — for each item with a linked `proposalId` — that proposal's decisions via the existing decision ledger (Slice 1), unchanged.
2. IF a client exports a campaign belonging to another org THEN the system SHALL reject it with 404.

**Independent Test**: Criar uma campaign com 1 item completed referenciando um proposal com 1 decision registrada e 1 item exempted com justificativa; exportar e conferir que ambos aparecem com seus dados exatos.

---

## Edge Cases

- IF a client accesses any route introduced by this slice cross-tenant THEN the system SHALL return 403.
- IF a client marks an already-`completed` or already-`exempted` item as `completed` or grants it an exception again THEN the system SHALL reject it with 409 (terminal states are not re-enterable).
- IF a client declares a relation from a project to itself THEN the system SHALL reject it with 422 (a project cannot be its own member).
- WHEN a portfolio has a `composition` relation to a project that itself has zero proposals/decisions/experiments THEN the dashboard SHALL show that project with all counts at `0`, never omit it.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| PORT-01 | P1: Relações — declaração tipada, consultável nos 2 sentidos | Design | Pending |
| PORT-02 | P1: Relações — rejeita tipo fora do set fechado (422) | Design | Pending |
| PORT-03 | P1: Relações — rejeita projeto inexistente/outro org (404) | Design | Pending |
| PORT-04 | P1: Relações — idempotência do mesmo (source,target,type) | Design | Pending |
| PORT-05 | P1: Dashboard — agrega contagens exatas por membro | Design | Pending |
| PORT-06 | P1: Dashboard — rejeita projeto inexistente (404) | Design | Pending |
| PORT-07 | P1: Dashboard — lista vazia quando não há membros | Design | Pending |
| PORT-08 | P1: Campaign — criação com waves e items pending | Design | Pending |
| PORT-09 | P1: Campaign — rejeita wave vazia/target inválido (422/404) | Design | Pending |
| PORT-10 | P1: Campaign — completar item da wave 1 | Design | Pending |
| PORT-11 | P1: Campaign — bloqueia wave N+1 com wave N pending (409) | Design | Pending |
| PORT-12 | P1: Campaign — libera wave N+1 quando wave N resolvida | Design | Pending |
| PORT-13 | P1: Exceção — concede com justificativa | Design | Pending |
| PORT-14 | P1: Exceção — rejeita sem justificativa (422) | Design | Pending |
| PORT-15 | P1: Exceção — mix completed+exempted libera wave seguinte | Design | Pending |
| PORT-16 | P1: Progresso — sem campo de rank/score | Design | Pending |
| PORT-17 | P1: Progresso — rejeita campaign inexistente (404) | Design | Pending |
| PORT-18 | P1: Export — waves/items/decisions do proposal vinculado | Design | Pending |
| PORT-19 | P1: Export — rejeita campaign de outro org (404) | Design | Pending |

**ID format:** `PORT-NN`

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

**Coverage:** 19 total, 0 mapped to tasks (mapeado na fase Tasks), 0 unmapped — cada ID cita sua âncora na spec acima.

---

## Success Criteria

- [ ] `validate_spec.py` sai 0 para esta spec.
- [ ] O vertical slice completo roda ponta a ponta: declarar relações `composition` → dashboard agregado do portfolio → criar campaign em waves a partir de um finding comum → completar/excepcionar items respeitando o gate canary entre waves → progresso comparável sem ranking → exportar auditoria completa.
- [ ] Nenhuma wave avança enquanto a anterior tiver algum item `pending`.
- [ ] Nenhuma resposta de progresso ou dashboard contém um campo de rank/score sintético.
- [ ] Verifier independente reporta PASS em `validation.md`.
