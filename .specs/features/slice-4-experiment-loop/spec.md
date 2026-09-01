# Slice 4 — Experiment Loop Specification

## Problem Statement

Até o Slice 3, uma proposal pode chegar a `readyForReview` com contra-análise do Challenger e receber uma decisão — mas "decidir" e "provar" são coisas diferentes. O `AGENTS.md`/build-sequence exige que o Slice 4 feche o próximo elo do vertical slice: **decisão de experimentar → plano de verificação com duas variantes → evidência coletada (proof artifacts) → veredito determinístico → decisão final de outcome preservada**. Valor do slice ([sequência de construção](../../../docs/06-delivery/05-build-sequence.md), Slice 4): "o sistema prova antes de recomendar adoção" — nenhuma proposal vira `adopted` sem ter passado por um experimento verificável.

**Fonte de verdade**: [PRD-003](../../../docs/01-product/PRD-003-evolution-engine.md) (EVO-FR-001..018, especialmente EVO-FR-006/007/011/016/017), [proposal spec](../../../docs/07-specifications/04-evolution-proposal-spec.md) (lifecycle `decided → executing → verifying → closed`, invariantes §5), [modelo de avaliação agentic](../../../docs/03-agents/06-agent-evaluation-model.md), ADR-011 (execução isolada), ADR-013 (model provider abstraction), épicos EP-032, EP-033, EP-042.

## Goals

- [x] Uma proposal `readyForReview` pode iniciar um experimento com exatamente duas variantes e um plano de verificação explícito, capturando um digest do conteúdo da proposal no momento da decisão.
- [x] Artefatos de prova (proof artifacts) podem ser anexados a um experimento em andamento, reusando o mecanismo de artifacts do Slice 1.
- [x] Uma métrica observada é avaliada deterministicamente contra o plano de verificação, produzindo um veredito (`hypothesis_met`/`hypothesis_not_met`/`inconclusive`) — nunca um "parece que funcionou" opaco.
- [x] O fechamento do experimento preserva a decisão de outcome pelo mesmo mecanismo genérico de decisões do Slice 1/3, fechando a proposal.

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Execução real em sandbox isolado (containers/VM/WASM) | ADR-011 define isolamento real como contrato por profile, mas implementar um runtime de sandboxing é infraestrutura fora do escopo de um vertical slice spec-driven; este slice registra um `environment` declarado (metadados) em vez de executar algo de fato — mesmo padrão de deferimento do ADR-013 usado no Slice 3 para o Analysis Provider |
| Deploy real de duas variantes de código | "Prepare two variants" aqui significa capturar a definição estruturada de cada variante (id/nome/descrição), não fazer deploy, canary ou rollout real — isso é Slice 5 (reversible external action) e além |
| Scheduler/timer real para `observationWindow` | Seria durable execution (ADR-006 já provê apenas um motor mínimo); `observationWindow` é um descritor livre registrado para auditoria, não uma janela imposta automaticamente |
| Avaliação por LLM-as-judge / eval infra real | Sem credenciais de model provider confirmadas neste ambiente (mesma razão do Slice 3); a avaliação aqui é 100% determinística contra o plano declarado — LLM-as-judge é Slice 6 (harness-vertical, EP-041) |
| Validação do conjunto de verbos de decisão (`accept`/`reject`/...) | Já não era feita no Slice 3 (endpoint genérico aceita qualquer string); este slice não adiciona validação nova — mantém o comportamento existente |
| Reabertura ou re-experimentação de uma proposal já fechada | Uma proposal fechada permanece fechada neste slice; retry/nova iteração é decisão de produto fora de alcance aqui |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | --------------- | --------- | ---------- |
| Algoritmo de digest da proposal | sha256 sobre JSON canônico (chaves ordenadas) dos campos materiais (`title`, `summary`, `whyNow`, `costOfInaction`, `proposalType`, `alternatives`, `recommendedAlternativeId`) | `alternatives` é jsonb e volta do Postgres sem preservar ordem de inserção de chaves (bug real corrigido no Slice 2 — `payloadEquals`); usar `JSON.stringify` cru reintroduziria a mesma classe de bug. A função `canonicalJson` do Cartographer (Slice 2) será extraída para um util compartilhado e reusada aqui | y |
| Operador de comparação do plano de verificação | Campo explícito `comparison: 'gte' \| 'lte'` no plano, não inferido | Uma métrica "boa" pode ser maior-é-melhor (ex. conversão) ou menor-é-melhor (ex. latência); inferir a direção seria adivinhação, não determinismo | y |
| Valor observado `null` no submit de avaliação | Veredito `inconclusive` com rationale fixa, distinto de omitir a chave (que é 422) | Distingue "não sei ainda" (dado explícito) de "requisição malformada" (campo ausente) — alinhado a EVO-FR-004 (`insufficient_context`) | y |
| Sandbox/environment do experimento | Campo `environment` (jsonb, opcional, default `{}`) armazenado como metadado declarado, nunca executado | Ver Out of Scope — nenhuma infra de isolamento real está disponível/necessária para provar o loop de decisão | y |
| Proof artifacts | Reusa `artifacts`/`artifact_versions` do Slice 1 via tabela de junção `experiment_artifacts` (padrão `claim_evidence` do Slice 3) | Evita duplicar o conceito de "artifact versionado" já provado; um artifact pode servir mais de um experimento (N:N) | y |
| Estados do experimento nesta fatia | `running → evaluated → closed` (subconjunto de `executing → verifying → closed` do proposal spec) | MVP do "prova antes de recomendar" não precisa de todos os 8 estados do proposal lifecycle completo; os demais (`investigating`, `underReview`) já não fazem parte do Slice 3 e continuam fora de alcance aqui | y |
| Verbo de decisão de fechamento do experimento | Qualquer string aceita pelo endpoint genérico de decisões (sem novo enum) | Consistente com o Slice 3 — decisions.ts não valida o conjunto de verbos hoje; introduzir validação seria scope creep não pedido | y |

**Open questions:** none - all resolved or logged above.

---

## User Stories

### P1: Iniciar experimento a partir de uma proposal pronta ⭐ MVP

**User Story**: As a responsável pelo projeto, I want iniciar um experimento formal a partir de uma proposal `readyForReview`, com duas variantes e um plano de verificação explícito, so that a decisão de adoção nunca se baseie em "parece bom" sem um teste desenhado antes (proposal spec §5: "verification criteria fixed before result").

**Why P1**: É o degrau zero do loop — sem experimento formalmente iniciado, não há o que avaliar ou provar.

**Acceptance Criteria**:

1. WHEN a client starts an experiment on a proposal in `readyForReview` with exactly two variants and a complete verification plan (`hypothesis`, `baselineMetric`, `threshold`, `comparison` in `{gte, lte}`, `observationWindow`) THEN the system SHALL create the experiment with `status='running'`, capture a canonical content digest of the proposal at that moment, and transition the proposal to `status='executing'`.
2. IF a client starts an experiment with a `variants` array whose length is not exactly 2 THEN the system SHALL reject it with 422 without creating a row.
3. IF a client starts an experiment with a verification plan missing any of `hypothesis`, `baselineMetric`, `threshold`, `comparison`, or `observationWindow` THEN the system SHALL reject it with 422 without creating a row.
4. IF a client attempts to start an experiment on a proposal that is not in `readyForReview` THEN the system SHALL reject it with 409.

**Independent Test**: Criar uma proposal, movê-la a `readyForReview`, iniciar um experimento com 2 variantes e um plano completo; conferir `status=running`, digest presente, e a proposal em `executing`.

---

### P1: Anexar artefatos de prova a um experimento em andamento

**User Story**: As a pessoa conduzindo o experimento, I want anexar evidência coletada (artifacts) ao experimento em andamento so that o veredito final tenha rastro auditável até a prova, não apenas até a opinião.

**Why P1**: Sem prova anexada, "provar antes de recomendar" vira só um texto — o artifact é a prova.

**Acceptance Criteria**:

1. WHEN a client attaches an existing project artifact to a `running` experiment THEN the system SHALL link it without duplicating the artifact record.
2. IF a client attaches an artifact that belongs to another project THEN the system SHALL reject it with 422.
3. WHEN a client lists an experiment's proof artifacts THEN the system SHALL return every linked artifact.

**Independent Test**: Criar um artifact via o endpoint existente do Slice 1; anexá-lo ao experimento; listar os artifacts do experimento e conferi-lo presente.

---

### P1: Avaliação determinística contra o plano de verificação

**User Story**: As a responsável pelo projeto, I want submeter a métrica observada e receber um veredito calculado deterministicamente contra o plano declarado antes do experimento so that o resultado não seja reinterpretado depois dos fatos.

**Why P1**: É o coração do "provar antes de recomendar" — sem isso o experimento é só um rótulo.

**Acceptance Criteria**:

1. WHEN a client submits an observed numeric value for a `running` experiment's baseline metric that satisfies the verification plan's threshold per its `comparison` operator THEN the system SHALL persist `verdict='hypothesis_met'` and transition the experiment to `status='evaluated'`.
2. WHEN a client submits an observed numeric value that does not satisfy the threshold per the `comparison` operator THEN the system SHALL persist `verdict='hypothesis_not_met'` and transition the experiment to `status='evaluated'`.
3. WHEN a client submits an explicit `null` observed value THEN the system SHALL persist `verdict='inconclusive'` with a rationale stating the metric was unavailable, and transition the experiment to `status='evaluated'`.
4. IF a client submits an evaluation request omitting the observed-value field entirely THEN the system SHALL reject it with 422 without persisting a verdict.
5. IF a client attempts to evaluate an experiment that is not `running` THEN the system SHALL reject it with 409.

**Independent Test**: Iniciar um experimento com `threshold=10, comparison=gte`; submeter `9` e conferir `hypothesis_not_met`; iniciar outro e submeter `11` e conferir `hypothesis_met`; submeter `null` num terceiro e conferir `inconclusive`.

---

### P1: Fechamento com aprendizado de outcome preservado

**User Story**: As a responsável pelo projeto, I want fechar o experimento com uma decisão de outcome que fique registrada pelo mesmo mecanismo de decisões já usado no resto do produto so that o histórico de "o que decidimos e por quê" nunca fique fragmentado por feature.

**Why P1**: É o fechamento do vertical slice do Slice 4 — sem isso, o experimento prova algo mas a decisão correspondente não fica preservada.

**Acceptance Criteria**:

1. WHEN a client closes an `evaluated` experiment with a decision and rationale THEN the system SHALL record it via the same decision mechanism used for proposal decisions (`subjectType='proposal'`, `subjectId=<the proposal>`), transition the experiment to `status='closed'`, and transition the proposal to `status='closed'`.
2. IF a client attempts to close an experiment that has not been `evaluated` THEN the system SHALL reject it with 409 (verification criteria and result are fixed before closure — proposal spec §5).
3. WHEN an experiment is closed THEN the response SHALL surface any prior related decisions on the same proposal (reusing the guard proven since Slice 1/3).

**Independent Test**: Avaliar um experimento até `evaluated`; fechá-lo com `decision=accept`; conferir a proposal em `closed` e a decisão listada em `GET /projects/:id/decisions`.

---

## Edge Cases

- IF a client requests an unknown experiment THEN the system SHALL return 404.
- IF a client starts an experiment on a proposal from another project THEN the system SHALL return 404 (existence check precedes tenant check, same pattern as every route since Slice 1).
- IF a client accesses any new route cross-tenant THEN the system SHALL return 403.
- WHEN the same artifact is attached to an experiment twice THEN the system SHALL NOT create a duplicate link row (idempotent attach, mirroring the signal-dedup pattern from Slice 3).
- IF a client submits an observed value that is neither a finite number nor explicitly `null` (e.g. a string, `NaN`, `Infinity`) THEN the system SHALL reject it with 422.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| EXP-01 | P1: Iniciar experimento — criação com digest e transição de status | Execute | Implementing |
| EXP-02 | P1: Iniciar experimento — rejeita variantes != 2 | Execute | Implementing |
| EXP-03 | P1: Iniciar experimento — rejeita plano de verificação incompleto | Execute | Implementing |
| EXP-04 | P1: Iniciar experimento — rejeita proposal fora de readyForReview | Execute | Implementing |
| EXP-05 | P1: Proof artifacts — anexar sem duplicar | Execute | Implementing |
| EXP-06 | P1: Proof artifacts — rejeita artifact de outro projeto | Execute | Implementing |
| EXP-07 | P1: Proof artifacts — listagem | Execute | Implementing |
| EXP-08 | P1: Avaliação — hypothesis_met | Execute | Implementing |
| EXP-09 | P1: Avaliação — hypothesis_not_met | Execute | Implementing |
| EXP-10 | P1: Avaliação — inconclusive em null explícito | Execute | Implementing |
| EXP-11 | P1: Avaliação — rejeita campo ausente | Execute | Implementing |
| EXP-12 | P1: Avaliação — rejeita se não running | Execute | Implementing |
| EXP-13 | P1: Fechamento — decisão preservada + status closed | Execute | Implementing |
| EXP-14 | P1: Fechamento — rejeita se não evaluated | Execute | Implementing |
| EXP-15 | P1: Fechamento — expõe decisões relacionadas anteriores | Execute | Implementing |

**ID format:** `EXP-NN`

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

**Coverage:** 15 total, 0 mapped to tasks (mapeado na fase Tasks), 0 unmapped — cada ID cita sua âncora na spec acima.

---

## Success Criteria

- [x] `validate_spec.py` sai 0 para esta spec.
- [x] O vertical slice completo roda ponta a ponta: proposal readyForReview → experimento iniciado (2 variantes + plano) → proof artifact anexado → avaliação determinística → fechamento com decisão preservada e proposal `closed`.
- [x] Uma avaliação com métrica observada abaixo do threshold produz `hypothesis_not_met` sem exigir julgamento humano para a classificação.
- [x] Um valor `null` explícito produz `inconclusive`, distinto de um campo ausente (422).
- [ ] Verifier independente reporta PASS em `validation.md`.
