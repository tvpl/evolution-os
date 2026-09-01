# Slice 3 — Evidence to Decision Specification

## Problem Statement

Até o Slice 2, o Twin sabe o que existe (declarado + observado), mas não tem mecanismo para transformar um sinal externo em uma decisão registrada. Este slice fecha o loop central do produto — "unidade central completa" ([sequência de construção](../../../docs/06-delivery/05-build-sequence.md), Slice 3) — exatamente o vertical slice mandatado pelo `AGENTS.md`: **registrar projeto → construir snapshot → ingerir evidência → relacionar impacto → propor evolução → aprovar/rejeitar → preservar decisão**. As primeiras cinco etapas já existem (Slices 0-2); este slice entrega ingestão de evidência, claims, sinal ligado a projeto, análise de relevância, proposta, Challenger, inbox e decisão — com o guard de "rejeição não reaparece" estendido de hipóteses/candidates para propostas.

**Fonte de verdade**: [PRD-003](../../../docs/01-product/PRD-003-evolution-engine.md) (EVO-FR-001..018), [runtime agentic](../../../docs/02-architecture/04-agentic-runtime.md), [evidence spec](../../../docs/07-specifications/03-evidence-record-spec.md), [proposal spec](../../../docs/07-specifications/04-evolution-proposal-spec.md), [policy spec](../../../docs/07-specifications/05-policy-model-spec.md), [catálogo de agentes](../../../docs/03-agents/01-agent-catalog.md), épicos EP-020/021/023/024/025/040/041, ADR-006, ADR-009, ADR-010, ADR-013.

## Goals

- [ ] Evidência manual/URL-reference entra em quarentena e vira `active` antes de sustentar qualquer claim material.
- [ ] Claims linkam evidência(s) a uma afirmação com tipo epistêmico explícito (fact/inference/hypothesis).
- [ ] Um signal liga uma claim a exatamente um projeto com relevância decomposta (nunca um score único opaco).
- [ ] Proposals seguem o schema mínimo do spec (claims, alternativas incl. do-nothing, recomendação, impacto, custo de inação) e passam por um Challenger determinístico antes de chegar ao inbox.
- [ ] Decisão sobre proposta reusa o guard de "rejeição anterior" já provado no Slice 1/2, agora para `subjectType='proposal'`.

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Specialist/Challenger como agente LLM real | Sem credenciais de model provider confirmadas neste ambiente e sem infra de eval/shadow/canary (EP-041, ADR-013); este slice implementa a análise por trás de uma interface plugável (`AnalysisProvider`) com um adapter determinístico — trocar por um LLM real é extensão local quando a infra existir (Slice 6) |
| Orchestrator/DAG/Run/Task/Checkpoint completos do runtime agentic | `04-agentic-runtime.md` descreve um motor de execução de dias/budgets/model routing — desproporcional para este vertical slice; a análise aqui é síncrona e determinística, sem necessidade de durable execution ainda |
| Motor de policy OPA/Rego com 6 camadas | O `capability_grants` deny-by-default já provado nos Slices 0-2 é policy engine suficiente na granularidade deste slice (policy spec §10: "domain contract is engine-neutral"); o motor completo é EP-051 |
| Crawling/fetch real de URL | "Manual/URL evidence ingestion" (build-sequence) significa referenciar a URL como fonte, não buscar e processar seu conteúdo — vira `evidence.type=referenceOnly`; fetch real exige threat model de conteúdo externo (evidence spec §7) fora deste slice |
| Lifecycle completo de proposal (investigating/underReview/executing/verifying) | Proposal spec §2 lista 8 estados; este slice cobre `draft → readyForReview → decided`; os estados de execução/verificação exigem o Slice 4 (experiment loop) |
| Campaigns e consolidação de proposals duplicadas (EVO-FR-014/015) | Portfolio/Slice 8; uma proposta por vez neste slice |
| Extração automática de claims via NLP/LLM | Mesma razão do Specialist: quem submete a evidência declara a claim explicitamente (statement + tipo epistêmico), evitando fingir extração automática sem model provider real |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | --------------- | --------- | ---------- |
| Specialist/Challenger são determinísticos, não LLM | Interface `AnalysisProvider` com um adapter de regras fixas (mesma forma do Cartographer do Slice 2) | Ver Out of Scope; ADR-013 exige "provider adapters" — a interface plugável cumpre a decisão, o adapter real fica para quando houver credencial/eval | y |
| Roteamento de aprovação de proposal | Reusa `capability_grants` (nova capability `proposal.decide`), mesmo padrão de `decision.write`/`candidate.decide` | Suficiente para "Policy engine determina recipients" (PRD-003 §4.9) nesta granularidade; motor completo é EP-051 | y |
| Claim-evidence é muitos-para-muitos | Tabela de junção `claim_evidence` | Evidence spec §4 exige explicitamente suportar múltiplas evidências por claim | y |
| Dimensões subjetivas do score (impact/urgency/effort/risk) | Informadas pelo humano ao criar a proposal, não inferidas | "Score não pode ser a única razão" (proposal spec §5invariants) e fingir determinismo para julgamento genuinamente subjetivo seria pior que pedir input explícito; `evidenceStrength`/`confidence` esses sim são calculados deterministicamente a partir de metadados da evidência | y |
| Reuso da tabela `decisions` do Slice 1 para decisões de proposal | `subjectType='proposal'`, `subjectId=<proposalId>` — mesma tabela/endpoint `POST /projects/:id/decisions` | O guard de "decisão anterior relacionada" já existe e funciona genericamente por `(project_id, subject_type, subject_id)`; recriar um endpoint separado duplicaria lógica já testada (IDEA-15/TWIN-11) | y |
| Formato de evidência aceito | Texto manual (`humanStatement`) ou referência de URL (`referenceOnly`, sem fetch) | Cobre os dois casos citados literalmente em "Manual/URL evidence ingestion quarantine" sem exigir parsing de conteúdo externo | y |

**Open questions:** none - all resolved or logged above.

---

## User Stories

### P1: Ingestão de evidência em quarentena ⭐ MVP

**User Story**: As a pessoa investigando um sinal externo, I want registrar uma evidência (texto manual ou referência de URL) que entre em quarentena so that nada vira claim material sem passar por um estado revisável primeiro.

**Why P1**: É o degrau zero do pipeline — sem evidência, não há claim, signal ou proposal.

**Acceptance Criteria**:

1. WHEN a client submits a manual evidence statement or a URL reference for a project THEN the system SHALL create it with `status='quarantine'`, the declared `type` (`humanStatement` or `referenceOnly`), source metadata and a content digest.
2. WHEN a client activates a quarantined evidence THEN the system SHALL transition it to `status='active'` preserving its original content and digest unchanged.
3. IF a client submits evidence without source information (type + reference/statement) THEN the system SHALL reject it with 422 without creating a row.
4. WHEN a client lists a project's evidence THEN the system SHALL return them with their current status and digest.

**Independent Test**: Submeter uma evidência manual, conferir `status=quarantine`; ativá-la e conferir `status=active` com o mesmo digest; submeter sem fonte e conferir 422.

---

### P1: Claims com tipo epistêmico e provenance

**User Story**: As a pessoa analisando uma evidência, I want declarar uma claim ligada a uma ou mais evidências com seu tipo epistêmico so that fato, inferência e hipótese nunca se confundam (ADR-009).

**Why P1**: Base de tudo que segue — signal, proposal e Challenger dependem de claims tipadas.

**Acceptance Criteria**:

1. WHEN a client creates a claim referencing one or more active evidence records THEN the system SHALL persist the claim with its `statement` and `epistemicType` (`fact`, `inference` or `hypothesis`) linked to each evidence.
2. IF a claim references evidence still in `quarantine` THEN the system SHALL reject it with 422 (only active evidence supports a claim).
3. IF a claim references evidence not belonging to the same project THEN the system SHALL reject it with 422.
4. WHEN a client lists claims for a project THEN the system SHALL return each with its linked evidence IDs.

**Independent Test**: Criar 2 evidências ativas e 1 claim referenciando ambas; listar claims e ver os 2 evidence IDs; tentar referenciar evidência em quarentena e receber 422.

---

### P1: Signal ligado a um projeto com relevância decomposta

**User Story**: As a analista, I want que uma claim vire um signal ligado a um projeto com dimensões de relevância separadas so that eu nunca receba um score único opaco (PRD-003 §5).

**Why P1**: É o "Relevance analysis" do build-sequence e o requisito central EVO-FR-012 (score decomponível).

**Acceptance Criteria**:

1. WHEN a client links a claim to a project as a signal THEN the system SHALL compute and persist `evidenceStrength` and `confidence` deterministically from the claim's linked evidence (source authority and evidence count), never as a single opaque number.
2. The signal response SHALL expose `evidenceStrength` and `confidence` as separate fields, not merged into one score.
3. IF the same claim is linked to the same project again THEN the system SHALL return the existing signal instead of creating a duplicate.

**Independent Test**: Ligar uma claim com 2 evidências corroborantes a um projeto; conferir `evidenceStrength`/`confidence` separados; religar a mesma claim e conferir que não duplica.

---

### P1: Proposal com Challenger determinístico

**User Story**: As a responsável pelo projeto, I want que uma proposta gerada a partir de um signal já venha com contra-análise do Challenger so that eu nunca veja só o lado favorável (EVO-FR-009).

**Why P1**: É o "Proposal schema" + "Challenger" do build-sequence — a proposta sem contra-análise não é confiável o suficiente para virar decisão.

**Acceptance Criteria**:

1. WHEN a client creates a proposal from a signal with title, summary, why-now, cost of inaction, at least one alternative including `do nothing`/`watch`, and a recommended alternative THEN the system SHALL persist it with `status='draft'`.
2. WHEN a proposal moves to `readyForReview` THEN the system SHALL run the deterministic Challenger against it and SHALL attach its findings (e.g. `missing_do_nothing_alternative`, `single_source_evidence`, `missing_cost_of_inaction`) to the proposal before it becomes visible in the inbox.
3. IF a proposal has no `do nothing`/`watch` alternative among its options THEN the Challenger SHALL flag `missing_do_nothing_alternative` without blocking the transition (Challenger informs, never blocks — EVO-FR-009 spirit).
4. IF a client attempts to create a proposal with no claims and no explicit investigation state THEN the system SHALL reject it with 422 (proposal spec §5 invariant: material proposal needs evidence-backed claim or explicit investigation state).

**Independent Test**: Criar proposal com 1 alternativa `adopt` (sem `do nothing`) a partir de uma claim única; mover a `readyForReview`; conferir que o Challenger anexou `missing_do_nothing_alternative` e `single_source_evidence`.

---

### P1: Inbox e decisão com guard de rejeição

**User Story**: As a responsável pelo projeto, I want ver as propostas prontas para revisão e decidir sobre elas, sendo avisado se uma proposta relacionada já foi rejeitada antes so that a decisão de hoje não ignore o histórico (regra do `AGENTS.md`).

**Why P1**: É o fechamento do vertical slice mandatado pelo `AGENTS.md` — "propor evolução → aprovar/rejeitar → preservar decisão".

**Acceptance Criteria**:

1. WHEN a client requests a project's inbox THEN the system SHALL return proposals with `status='readyForReview'` ordered most-recent-first, including their Challenger findings.
2. WHEN a client records a decision on a proposal (`accept`, `reject`, `defer`, `investigate`, `experiment`, `supersede`) THEN the system SHALL persist it via the same decision mechanism used for hypotheses/candidates (`subjectType='proposal'`) and SHALL surface any prior decision on the same proposal in the response.
3. IF a client attempts to create a new proposal whose subject was already rejected without a new claim/evidence THEN the system SHALL surface the prior rejected decision so it is not silently ignored (does not block creation — visibility, not a hard block, matching the existing guard pattern).

**Independent Test**: Mover uma proposta a `readyForReview`, buscar o inbox e vê-la; decidir `reject`; criar nova proposta relacionada ao mesmo signal e conferir que a API expõe a decisão rejeitada anterior.

---

## Edge Cases

- IF an evidence source becomes unavailable (marked externally) THEN derived claims SHALL be flagged, not silently kept as if still fresh (evidence spec §6) — out of full scope, but the evidence status field SHALL support `source_unavailable` so future slices can set it.
- IF a claim has zero linked evidence THEN claim creation SHALL be rejected 422 (a claim always needs at least one evidence per evidence spec §4).
- WHEN two evidences share the same content digest THEN the system SHALL still create both records (deduplication policy is out of scope for this slice) but SHALL NOT error.
- IF a proposal has contradicting claims (claims with opposing epistemic weight on the same subject) THEN the Challenger SHALL flag `contradictory_claims` rather than silently picking a side.
- IF a decision references a proposal from another project THEN the system SHALL reject it with 422 (same guard already proven for hypothesis/artifact subjects).

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| FLOW-01 | P1: Evidência — criação em quarentena (EVO-FR-002) | Design | Pending |
| FLOW-02 | P1: Evidência — ativação preserva digest | Design | Pending |
| FLOW-03 | P1: Evidência — rejeição sem fonte | Design | Pending |
| FLOW-04 | P1: Evidência — listagem com status | Design | Pending |
| FLOW-05 | P1: Claims — criação com tipo epistêmico (ADR-009, EVO-FR-003) | Design | Pending |
| FLOW-06 | P1: Claims — rejeita evidência em quarentena | Design | Pending |
| FLOW-07 | P1: Claims — rejeita evidência de outro projeto | Design | Pending |
| FLOW-08 | P1: Claims — listagem com evidence IDs | Design | Pending |
| FLOW-09 | P1: Signal — relevância decomposta (EVO-FR-012) | Design | Pending |
| FLOW-10 | P1: Signal — campos separados na resposta | Design | Pending |
| FLOW-11 | P1: Signal — sem duplicação ao relinkar | Design | Pending |
| FLOW-12 | P1: Proposal — criação com alternativas e do-nothing | Design | Pending |
| FLOW-13 | P1: Proposal — Challenger roda ao ir a readyForReview | Design | Pending |
| FLOW-14 | P1: Proposal — Challenger nunca bloqueia (EVO-FR-009) | Design | Pending |
| FLOW-15 | P1: Proposal — rejeita sem claims/investigation state | Design | Pending |
| FLOW-16 | P1: Inbox — lista readyForReview com findings | Design | Pending |
| FLOW-17 | P1: Decisão — reusa mecanismo de subject genérico | Design | Pending |
| FLOW-18 | P1: Decisão — guard de rejeição anterior para proposal | Design | Pending |

**ID format:** `FLOW-NN`

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

**Coverage:** 18 total, 0 mapped to tasks (mapeado na fase Tasks), 0 unmapped — cada ID cita sua âncora nas docs-fonte.

---

## Success Criteria

- [ ] `validate_spec.py` sai 0 para esta spec.
- [ ] O vertical slice completo do `AGENTS.md` roda ponta a ponta: evidência → claim → signal → proposal → Challenger → inbox → decisão preservada.
- [ ] Uma proposta sem alternativa `do nothing` é sinalizada pelo Challenger sem ser bloqueada.
- [ ] Uma decisão sobre proposta relacionada expõe a rejeição anterior (guard funcional, reuso comprovado do Slice 1/2).
- [ ] Verifier independente reporta PASS em `validation.md`.
