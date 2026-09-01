# Slice 3 — Evidence to Decision Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/slice-3-evidence-to-decision/design.md`
**Status**: Approved

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec - confirm before Execute. Guidelines found: `AGENTS.md` + testes reais já existentes (Slices 0-2: integration contra Postgres real via `freshDb`). Reusado sem alteração.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------- | --------------------- | ----------------- | ------------ |
| Hub domain (evolution: evidence, claims, signals, proposals, analysis-provider) | integration (Postgres real) | 1:1 com ACs da spec; todo edge case listado tem teste | `apps/hub/test/*.test.ts` | `pnpm test:int` |
| `analysis-provider` puro (scoreEvidence/challenge) | integration (co-locado, sem chamada a DB) | Funções puras testadas diretamente; `apps/hub` não separa unit/integration (convenção do repo desde o Slice 0) — o arquivo roda junto de `test:int` mas não chama `freshDb` | `apps/hub/test/*.test.ts` | `pnpm test:int` |
| Migration / docs | none | - (build gate only) | - | build gate only |

## Gate Check Commands

> Reusa os comandos confirmados nos Slices 0-2.

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Full | After tasks with integration tests | `bash scripts/dev-db.sh start && pnpm test:unit && pnpm test:int` |
| Build | After phase completion or docs-only tasks | `pnpm typecheck && bash scripts/dev-db.sh start && pnpm test && python3 scripts/check_docs.py` |

---

## Execution Plan

### Phase 1: Fundação

```
T1
```

### Phase 2: Evidência e claims

```
T2 → T3
```

### Phase 3: Signal e analysis provider

```
T4 → T5
```

### Phase 4: Proposal e Challenger

```
T6 → T7
```

### Phase 5: Inbox, decisão e fechamento

```
T8 → T9 → T10
```

---

## Task Breakdown

### T1: Migration 004 — evolution + capabilities

**What**: `apps/hub/migrations/004_evolution.sql` criando `evidence`, `claims`, `claim_evidence`, `signals`, `proposals`; estender `seedDevGrants` com `evidence.write`, `claim.write`, `signal.write`, `proposal.write`, `proposal.decide` para os dois tenants dev.
**Where**: `apps/hub/migrations/004_evolution.sql`, `apps/hub/src/policy/policy.ts`
**Depends on**: None
**Reuses**: runner de migrations e padrão de grants dos Slices 0-2
**Requirement**: — (base para todo o resto do slice)

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [x] Migration aplica de zero e é idempotente
- [x] Novos grants aparecem para os dois tenants dev
- [x] Gate check passes: full
- [x] Test count: ≥2 tests pass

**Tests**: integration
**Gate**: full

**Commit**: `feat(hub): add evolution migration and capability grants`

---

### T2: Evidência — criação, ativação, listagem

**What**: `POST /projects/:id/evidence` (cria `quarantine`, exige type+reference/statement, digest determinístico); `POST /projects/:id/evidence/:evidenceId/activate`; `GET /projects/:id/evidence`.
**Where**: `apps/hub/src/evolution/evidence.ts`
**Depends on**: T1
**Reuses**: `requireOwnedProject`, `enforceCapability`
**Requirement**: FLOW-01, FLOW-02, FLOW-03, FLOW-04

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [x] Evidência manual/URL cria em `quarantine` com digest
- [x] Ativação muda para `active` preservando digest
- [x] Submissão sem fonte é rejeitada 422 sem gravar
- [x] Listagem retorna status e digest
- [x] Gate check passes: full
- [x] Test count: ≥6 tests pass

**Tests**: integration
**Gate**: full

**Commit**: `feat(hub): add evidence quarantine and activation`

---

### T3: Claims — criação com evidência N:N, listagem

**What**: `POST /projects/:id/claims` (statement+epistemicType+evidenceIds[], exige ≥1 evidência `active` do mesmo projeto, grava `claim_evidence`); `GET /projects/:id/claims`.
**Where**: `apps/hub/src/evolution/claims.ts`
**Depends on**: T2
**Reuses**: mesmo padrão de T2
**Requirement**: FLOW-05, FLOW-06, FLOW-07, FLOW-08

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [x] Claim referenciando 2 evidências ativas persiste com ambas
- [x] Claim referenciando evidência em quarentena é rejeitada 422
- [x] Claim referenciando evidência de outro projeto é rejeitada 422
- [x] Claim sem nenhuma evidência é rejeitada 422 (edge case)
- [x] Listagem retorna evidence IDs por claim
- [x] Gate check passes: full
- [x] Test count: ≥7 tests pass

**Tests**: integration
**Gate**: full

**Commit**: `feat(hub): add claims with many-to-many evidence linkage`

---

### T4: Analysis provider determinístico

**What**: `scoreEvidence(evidenceList): {evidenceStrength, confidence}` (função pura: conta fontes + soma authority conhecida) e `challenge(proposal, claims, evidenceList): string[]` (checklist: `missing_do_nothing_alternative`, `single_source_evidence`, `missing_cost_of_inaction`, `contradictory_claims`).
**Where**: `apps/hub/src/evolution/analysis-provider.ts`
**Depends on**: T3
**Reuses**: mesmo padrão de função pura do `cartographer.ts` (Slice 2)
**Requirement**: FLOW-09 (base), FLOW-13, FLOW-14 (base)

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [x] `scoreEvidence` com 2 evidências corroborantes retorna `evidenceStrength`/`confidence` como campos separados
- [x] `challenge` sinaliza `missing_do_nothing_alternative` quando não há alternativa do-nothing/watch
- [x] `challenge` sinaliza `single_source_evidence` quando todas as claims dependem de 1 evidência só
- [x] `challenge` sinaliza `missing_cost_of_inaction` quando o campo está vazio
- [x] Gate check passes: full
- [x] Test count: ≥6 tests pass

**Tests**: integration
**Gate**: full

**Commit**: `feat(hub): add deterministic analysis provider`

---

### T5: Signal — link claim×projeto com relevância decomposta

**What**: `POST /projects/:id/signals` (claimId → calcula via `scoreEvidence` das evidências da claim, grava com unique `(project_id, claim_id)`); relinkar retorna o existente; `GET /projects/:id/signals`.
**Where**: `apps/hub/src/evolution/signals.ts`
**Depends on**: T4
**Reuses**: `scoreEvidence` de T4
**Requirement**: FLOW-09, FLOW-10, FLOW-11

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [x] Signal criado tem `evidenceStrength`/`confidence` separados
- [x] Relinkar a mesma claim retorna o signal existente sem duplicar (índice único comprovado)
- [x] Signal de claim de outro projeto é rejeitado 422
- [x] Gate check passes: full
- [x] Test count: ≥5 tests pass

**Tests**: integration
**Gate**: full

**Commit**: `feat(hub): add signal linking with decomposed relevance`

---

### T6: Proposal — criação draft

**What**: `POST /projects/:id/proposals` (title/summary/whyNow/costOfInaction/proposalType/alternatives[]/recommendedAlternativeId, a partir de um `signalId`; exige claims via o signal OU investigation state explícito); grava `status='draft'`.
**Where**: `apps/hub/src/evolution/proposals.ts`
**Depends on**: T5
**Reuses**: padrão de validação 422 dos slices anteriores
**Requirement**: FLOW-12, FLOW-15

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [x] Proposal com alternativas incl. `do nothing` persiste em `draft`
- [x] Proposal sem claims e sem investigation state é rejeitada 422
- [x] Proposal referenciando signal de outro projeto é rejeitada 422
- [x] Gate check passes: full
- [x] Test count: ≥5 tests pass

**Tests**: integration
**Gate**: full

**Commit**: `feat(hub): add proposal draft creation`

---

### T7: Proposal — transição a readyForReview com Challenger

**What**: `POST /projects/:id/proposals/:proposalId/ready` roda `challenge()` (T4) contra a proposal+claims+evidências ligadas, grava `challenger_findings` e `status='readyForReview'` na mesma operação; Challenger nunca bloqueia a transição.
**Where**: `apps/hub/src/evolution/proposals.ts` (extensão)
**Depends on**: T6
**Reuses**: `challenge()` de T4
**Requirement**: FLOW-13, FLOW-14

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [x] Proposal sem do-nothing e com 1 evidência só ganha os 2 findings esperados e MUDA de status (não bloqueia)
- [x] Proposal bem formada (com do-nothing, custo de inação, múltiplas fontes) vai a readyForReview com findings vazios
- [x] Gate check passes: full
- [x] Test count: ≥4 tests pass

**Tests**: integration
**Gate**: full

**Commit**: `feat(hub): run challenger on proposal ready transition`

---

### T8: Inbox — listagem de propostas prontas

**What**: `GET /projects/:id/proposals` com filtro opcional `?status=readyForReview` retornando findings do Challenger junto, ordenado mais-recente-primeiro.
**Where**: `apps/hub/src/evolution/proposals.ts` (extensão)
**Depends on**: T7
**Reuses**: mesmo módulo de T6/T7
**Requirement**: FLOW-16

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [x] Inbox filtrado por `readyForReview` retorna só essas, com findings, ordenado desc
- [x] Draft não aparece no inbox filtrado
- [x] Gate check passes: full
- [x] Test count: ≥3 tests pass

**Tests**: integration
**Gate**: full

**Commit**: `feat(hub): add proposal inbox listing`

---

### T9: Decisão sobre proposal + guard de rejeição

**What**: Estender `SUBJECT_TABLE` em `apps/hub/src/idea-memory/decisions.ts` com `proposal: 'proposals'` — nenhum endpoint novo; `POST /projects/:id/decisions` com `subjectType='proposal'` já funciona, incluindo o guard de decisões anteriores relacionadas.
**Where**: `apps/hub/src/idea-memory/decisions.ts`
**Depends on**: T8
**Reuses**: `recordDecision`/`listDecisions` do Slice 1 sem outra alteração
**Requirement**: FLOW-17, FLOW-18

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [x] Decisão `reject` sobre uma proposal persiste via o endpoint existente
- [x] Nova proposal relacionada ao mesmo subject expõe a decisão rejeitada anterior em `priorRelatedDecisions`
- [x] Decisão sobre proposal de outro projeto é rejeitada 422
- [x] Gate check passes: full
- [x] Test count: ≥4 tests pass

**Tests**: integration
**Gate**: full

**Commit**: `feat(hub): extend decision guard to proposal subjects`

---

### T10: Fechamento do slice — docs e review

**What**: Atualizar status do slice 3 no plano de execução para `implemented` e responder o checklist de review do slice em `design.md`.
**Where**: `docs/06-delivery/09-spec-driven-execution-plan.md`, `.specs/features/slice-3-evidence-to-decision/design.md`
**Depends on**: T9
**Reuses**: mesmo padrão de fechamento dos slices anteriores
**Requirement**: — (AGENTS.md: manter documentação atualizada)

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [x] Plano de execução marca slice 3 como `implemented`
- [x] Checklist de review do slice respondido
- [x] Gate check passes: build (inclui `check_docs.py`)

**Tests**: none
**Gate**: build

**Commit**: `docs(delivery): close slice 3 evidence to decision`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5

Phase 1:  T1
Phase 2:  T2 ------→ T3
Phase 3:  T4 ------→ T5
Phase 4:  T6 ------→ T7
Phase 5:  T8 ------→ T9 ------→ T10

Transições de fase (fronteiras):
T1 → T2
T3 → T4
T5 → T6
T7 → T8
```

Execution is strictly sequential - there is no intra-phase parallelism.

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1 | 1 migration + wiring de grants | ✅ Granular |
| T2 | 1 módulo (evidence: criação+ativação+listagem) | ✅ Granular |
| T3 | 1 módulo (claims: criação N:N+listagem) | ✅ Granular |
| T4 | 1 módulo (2 funções puras coesas) | ✅ Granular |
| T5 | 1 módulo (signals) | ✅ Granular |
| T6 | 1 módulo (proposals: criação) | ✅ Granular |
| T7 | extensão do mesmo módulo (ready+challenger) | ✅ Granular |
| T8 | extensão do mesmo módulo (inbox) | ✅ Granular |
| T9 | 1 linha de wiring (SUBJECT_TABLE) | ✅ Granular |
| T10 | atualização de docs | ✅ Granular |

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ----------------------- | -------------- | ------ |
| T1 | None | início Phase 1 | ✅ Match |
| T2 | T1 | Phase 2 após Phase 1 (T1 → T2) | ✅ Match |
| T3 | T2 | Phase 2 após T2 | ✅ Match |
| T4 | T3 | Phase 3 após Phase 2 (T3 → T4) | ✅ Match |
| T5 | T4 | Phase 3 após T4 | ✅ Match |
| T6 | T5 | Phase 4 após Phase 3 (T5 → T6) | ✅ Match |
| T7 | T6 | Phase 4 após T6 | ✅ Match |
| T8 | T7 | Phase 5 após Phase 4 (T7 → T8) | ✅ Match |
| T9 | T8 | Phase 5 após T8 | ✅ Match |
| T10 | T9 | Phase 5 após T9 | ✅ Match |

Nenhuma dependência aponta para fase posterior.

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | ---------------------------- | ----------------- | ---------- | ------ |
| T1 | Hub migration | integration | integration | ✅ OK |
| T2 | Hub evolution | integration | integration | ✅ OK |
| T3 | Hub evolution | integration | integration | ✅ OK |
| T4 | Hub evolution (puro) | integration | integration | ✅ OK |
| T5 | Hub evolution | integration | integration | ✅ OK |
| T6 | Hub evolution | integration | integration | ✅ OK |
| T7 | Hub evolution | integration | integration | ✅ OK |
| T8 | Hub evolution | integration | integration | ✅ OK |
| T9 | Hub idea-memory | integration | integration | ✅ OK |
| T10 | Docs | none | none | ✅ OK |
