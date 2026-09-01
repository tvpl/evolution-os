# Slice 8 — Portfolio Campaign Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/slice-8-portfolio-campaign/design.md`
**Status**: Approved

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec - confirm before Execute. Guidelines found: `AGENTS.md` + testes reais já existentes (Slices 0-7: integration contra Postgres real via `freshDb`). Reusado sem alteração.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------- | --------------------- | ----------------- | ------------ |
| Hub domain (evolution: portfolio) | integration (Postgres real) | 1:1 com ACs da spec; todo edge case listado tem teste | `apps/hub/test/*.test.ts` | `pnpm test:int` |
| Migration | none | - (build gate only) | - | build gate only |

## Gate Check Commands

> Reusa os comandos confirmados nos Slices 0-7.

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

### Phase 2: Relações e dashboard

```
T2 → T3
```

### Phase 3: Campaign — criação e ciclo de vida dos items

```
T4 → T5
```

### Phase 4: Progresso, export e encerramento

```
T6 → T7 → T8
```

---

## Task Breakdown

### T1: Migration 009 — portfolio + capability grant

**What**: `apps/hub/migrations/009_portfolio.sql` criando `project_relations`, `campaigns`, `campaign_waves`, `campaign_items`; estender `seedDevGrants` com `portfolio.write` para os dois tenants dev.
**Where**: `apps/hub/migrations/009_portfolio.sql`, `apps/hub/src/policy/policy.ts`
**Depends on**: None
**Reuses**: runner de migrations e padrão de grants dos Slices 0-7
**Requirement**: — (base para todo o resto do slice)

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [x] Migration aplica de zero e é idempotente
- [x] Novo grant `portfolio.write` aparece para os dois tenants dev
- [x] Gate check passes: full
- [x] Test count: ≥2 tests pass

**Tests**: integration
**Gate**: full

**Commit**: `feat(hub): add portfolio campaign migration and capability grant`

---

### T2: Declarar e listar relações entre projetos

**What**: `POST /projects/:id/relations` (declara `targetProjectId`+`type` no set fechado `{composition,dependency,implementation,ownership,influence}`; idempotente por `(source,target,type)`; rejeita self-relation, tipo inválido, ou target inexistente/outro org); `GET /projects/:id/relations` (retorna outbound e inbound).
**Where**: `apps/hub/src/evolution/portfolio.ts`
**Depends on**: T1
**Reuses**: `requireOwnedProject`, `enforceCapability`, `withTx`
**Requirement**: PORT-01, PORT-02, PORT-03, PORT-04

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [ ] Declarar uma relação `composition` persiste e aparece no outbound do source e no inbound do target
- [ ] Declarar com `type` fora do set fechado é rejeitado 422
- [ ] Declarar para projeto inexistente ou de outro org é rejeitado 404
- [ ] Declarar de um projeto para si mesmo é rejeitado 422
- [ ] Declarar a mesma `(source,target,type)` duas vezes não duplica
- [ ] Gate check passes: full
- [ ] Test count: ≥7 tests pass

**Tests**: integration
**Gate**: full

**Commit**: `feat(hub): declare and list typed project relations`

---

### T3: Dashboard agregado do portfolio

**What**: `GET /projects/:id/portfolio/dashboard` — para cada projeto ligado por relação `composition`, retorna `openProposalsCount`/`rejectedDecisionsCount`/`runningExperimentsCount` exatos; lista vazia quando não há membros; 404 para projeto inexistente.
**Where**: `apps/hub/src/evolution/portfolio.ts` (extensão)
**Depends on**: T2
**Reuses**: tabelas `proposals`/`decisions`/`experiments` (Slices 3/4) sem alteração
**Requirement**: PORT-05, PORT-06, PORT-07

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [ ] Dashboard com 2 membros `composition` retorna as contagens exatas de cada um
- [ ] Dashboard sem nenhuma relação `composition` retorna lista vazia, não erro
- [ ] Dashboard de projeto inexistente é rejeitado 404
- [ ] Membro sem nenhuma proposal/decision/experiment aparece com todas as contagens em 0
- [ ] Gate check passes: full
- [ ] Test count: ≥5 tests pass

**Tests**: integration
**Gate**: full

**Commit**: `feat(hub): add deterministic portfolio dashboard`

---

### T4: Criar uma campaign com waves

**What**: `POST /projects/:id/campaigns` (body `{finding, waves: [{targetProjectIds: [...]}]}`) — cria a campaign, uma `campaign_waves` por wave (seq incremental), um `campaign_items` `pending` por target project por wave; rejeita wave vazia, zero waves, ou target inválido, sem persistir nada. `GET /projects/:id/campaigns/:campaignId` lê a campaign com suas waves/items.
**Where**: `apps/hub/src/evolution/portfolio.ts` (extensão)
**Depends on**: T3
**Reuses**: `withTx` (toda a criação numa única transação)
**Requirement**: PORT-08, PORT-09

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [ ] Criar uma campaign com 2 waves persiste campaign+waves+items `pending`, em ordem
- [ ] Criar com wave vazia é rejeitado 422, nada persistido
- [ ] Criar com zero waves é rejeitado 422, nada persistido
- [ ] Criar com target project inexistente/outro org é rejeitado 404, nada persistido
- [ ] Ler a campaign retorna waves/items exatos
- [ ] Gate check passes: full
- [ ] Test count: ≥7 tests pass

**Tests**: integration
**Gate**: full

**Commit**: `feat(hub): create campaigns organized into sequential waves`

---

### T5: Completar item e conceder exceção com gate canary entre waves

**What**: `POST .../items/:itemId/complete` (body opcional `{proposalId}`) — só aceita se todo item da(s) wave(s) anterior(es) estiver `completed`/`exempted`; rejeita item já terminal (409). `POST .../items/:itemId/exception` (body `{justification}`) — exige justificativa não vazia (422 sem ela); mesmo gate de wave anterior; conta como resolvido para liberar a wave seguinte junto com `completed`.
**Where**: `apps/hub/src/evolution/portfolio.ts` (extensão)
**Depends on**: T4
**Reuses**: mesma função de gate (`isPriorWaveResolved`) para as duas rotas
**Requirement**: PORT-10, PORT-11, PORT-12, PORT-13, PORT-14, PORT-15

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [ ] Completar o item da wave 1 (sem wave anterior) sempre sucede
- [ ] Completar item da wave 2 enquanto a wave 1 tem item `pending` é rejeitado 409
- [ ] Completar item da wave 2 depois que TODOS os items da wave 1 estão `completed` sucede
- [ ] Conceder exceção sem justificativa é rejeitado 422
- [ ] Conceder exceção com justificativa muda status para `exempted` e persiste a justificativa
- [ ] Uma wave com 1 `completed` + 1 `exempted` (mix) libera a wave seguinte
- [ ] Completar/excepcionar um item já terminal é rejeitado 409
- [ ] Gate check passes: full
- [ ] Test count: ≥9 tests pass

**Tests**: integration
**Gate**: full

**Commit**: `feat(hub): gate campaign wave progression behind full resolution`

---

### T6: Visão de progresso sem ranking

**What**: `GET .../campaigns/:campaignId/progress` — retorna a lista de items ordenada por wave/seq então por ordem de declaração, cada um com exatamente `{projectId, wave, status}`, nenhum outro campo; 404 para campaign inexistente/outro org.
**Where**: `apps/hub/src/evolution/portfolio.ts` (extensão)
**Depends on**: T5
**Reuses**: leitura de `campaign_items`/`campaign_waves` já criada em T4
**Requirement**: PORT-16, PORT-17

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [ ] Progresso de uma campaign com 2 waves retorna a lista ordenada com exatamente os 3 campos por item, nenhum campo extra (asserção de shape exato, não `toHaveProperty`)
- [ ] Progresso de campaign inexistente/outro org é rejeitado 404
- [ ] Gate check passes: full
- [ ] Test count: ≥4 tests pass

**Tests**: integration
**Gate**: full

**Commit**: `feat(hub): expose campaign progress without a ranking field`

---

### T7: Exportar auditoria da campaign

**What**: `GET .../campaigns/:campaignId/export` — retorna `finding` + waves com items (status, `exceptionReason` quando presente) e, para cada item com `proposalId`, as decisions daquele proposal via `getProposalDecisions` (nova leitura filtrada por `subject_id` sobre a tabela `decisions` do Slice 1); 404 para campaign de outro org.
**Where**: `apps/hub/src/evolution/portfolio.ts` (extensão)
**Depends on**: T6
**Reuses**: tabela `decisions` (Slice 1), sem alterar `recordDecision`
**Requirement**: PORT-18, PORT-19

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [ ] Exportar uma campaign com 1 item completed (com proposal+decision) e 1 exempted (com justificativa) retorna ambos com seus dados exatos, incluindo a decision do proposal vinculado
- [ ] Exportar campaign de outro org é rejeitado 404
- [ ] Gate check passes: full
- [ ] Test count: ≥4 tests pass

**Tests**: integration
**Gate**: full

**Commit**: `feat(hub): export campaign audit trail with linked decisions`

---

### T8: Fechamento do slice — docs e review

**What**: Atualizar status do slice 8 no plano de execução para `implemented` e responder o checklist de review do slice em `design.md`.
**Where**: `docs/06-delivery/09-spec-driven-execution-plan.md`, `.specs/features/slice-8-portfolio-campaign/design.md`
**Depends on**: T7
**Reuses**: mesmo padrão de fechamento dos slices anteriores
**Requirement**: — (AGENTS.md: manter documentação atualizada)

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [ ] Plano de execução marca slice 8 como `implemented`
- [ ] Checklist de review do slice respondido
- [ ] Gate check passes: build (inclui `check_docs.py`)

**Tests**: none
**Gate**: build

**Commit**: `docs(delivery): close slice 8 portfolio campaign`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4

Phase 1:  T1
Phase 2:  T2 ------→ T3
Phase 3:  T4 ------→ T5
Phase 4:  T6 ------→ T7 ------→ T8

Transições de fase (fronteiras):
T1 → T2
T3 → T4
T5 → T6
```

Execution is strictly sequential - there is no intra-phase parallelism. Total tasks: 8 (≤ ~8) — execução inline, sem sub-agents de batch.

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1 | 1 migration + wiring de grant | ✅ Granular |
| T2 | 1 módulo (relações) | ✅ Granular |
| T3 | extensão do mesmo módulo (dashboard) | ✅ Granular |
| T4 | extensão do mesmo módulo (criação de campaign) | ✅ Granular |
| T5 | extensão do mesmo módulo (complete+exception, mesmo gate) | ✅ Granular |
| T6 | extensão do mesmo módulo (progresso) | ✅ Granular |
| T7 | extensão do mesmo módulo (export) | ✅ Granular |
| T8 | atualização de docs | ✅ Granular |

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
| T8 | T7 | Phase 4 após T7 | ✅ Match |

Nenhuma dependência aponta para fase posterior. A cadeia é estritamente sequencial (T1→T2→T3→T4→T5→T6→T7→T8).

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | ---------------------------- | ----------------- | ---------- | ------ |
| T1 | Hub migration | integration | integration | ✅ OK |
| T2 | Hub evolution (portfolio) | integration | integration | ✅ OK |
| T3 | Hub evolution (portfolio) | integration | integration | ✅ OK |
| T4 | Hub evolution (portfolio) | integration | integration | ✅ OK |
| T5 | Hub evolution (portfolio) | integration | integration | ✅ OK |
| T6 | Hub evolution (portfolio) | integration | integration | ✅ OK |
| T7 | Hub evolution (portfolio) | integration | integration | ✅ OK |
| T8 | Docs | none | none | ✅ OK |
