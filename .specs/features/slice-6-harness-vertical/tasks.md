# Slice 6 — Harness Vertical Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/slice-6-harness-vertical/design.md`
**Status**: Approved

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec - confirm before Execute. Guidelines found: `AGENTS.md` + testes reais já existentes (Slices 0-5: integration contra Postgres real via `freshDb`). Reusado sem alteração.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------- | --------------------- | ----------------- | ------------ |
| Hub domain (evolution: harness) | integration (Postgres real) | 1:1 com ACs da spec; todo edge case listado tem teste | `apps/hub/test/*.test.ts` | `pnpm test:int` |
| `runEvalCase` puro | integration (co-locado, sem chamada a DB) | Função pura testada diretamente, mesmo padrão do `evaluateExperiment` do Slice 4 | `apps/hub/test/*.test.ts` | `pnpm test:int` |
| Migration | none | - (build gate only) | - | build gate only |

## Gate Check Commands

> Reusa os comandos confirmados nos Slices 0-5.

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

### Phase 2: Inventário e dataset

```
T2 → T3
```

### Phase 3: Execução do eval e reuso do experimento

```
T4 → T5
```

### Phase 4: Observatory e encerramento

```
T6 → T7
```

---

## Task Breakdown

### T1: Migration 007 — harness + capability grant

**What**: `apps/hub/migrations/007_harness.sql` criando `harness_inventories`, `harness_eval_cases`, `harness_eval_runs`; estender `seedDevGrants` com `harness.write` para os dois tenants dev.
**Where**: `apps/hub/migrations/007_harness.sql`, `apps/hub/src/policy/policy.ts`
**Depends on**: None
**Reuses**: runner de migrations e padrão de grants dos Slices 0-5
**Requirement**: — (base para todo o resto do slice)

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [x] Migration aplica de zero e é idempotente
- [x] Novo grant `harness.write` aparece para os dois tenants dev
- [x] Gate check passes: full
- [x] Test count: ≥2 tests pass

**Tests**: integration
**Gate**: full

**Commit**: `feat(hub): add harness migration and capability grant`

---

### T2: Inventário versionado — declarar e ler

**What**: `POST /projects/:id/harness/inventory` (declara `skills`/`mcps`/`models`, cria nova versão incremental); `GET /projects/:id/harness/inventory` (retorna a versão mais recente, 404 se nenhuma existir).
**Where**: `apps/hub/src/evolution/harness.ts`
**Depends on**: T1
**Reuses**: `requireOwnedProject`, `enforceCapability`, padrão de versionamento de `artifact_versions` (Slice 1)
**Requirement**: HRN-01, HRN-02, HRN-03

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [x] Declarar um inventário persiste como nova versão e vira a versão corrente
- [x] Ler o inventário retorna a versão mais recente após uma segunda declaração
- [x] Declarar/ler para projeto inexistente é rejeitado 404
- [x] Gate check passes: full
- [x] Test count: ≥5 tests pass

**Tests**: integration
**Gate**: full

**Commit**: `feat(hub): add versioned harness inventory`

---

### T3: Dataset de eval — declarar e listar

**What**: `POST /projects/:id/harness/eval-cases` (exige `name`, `invariantType` em `{requires_skill, requires_mcp, forbids_mcp, min_component_count}` e `params` compatível com o tipo); `GET /projects/:id/harness/eval-cases`.
**Where**: `apps/hub/src/evolution/harness.ts` (extensão)
**Depends on**: T2
**Reuses**: mesmo padrão de validação 422 dos slices anteriores
**Requirement**: HRN-04, HRN-05, HRN-06

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [x] Declarar um caso `requires_skill` e um `min_component_count` persiste ambos
- [x] `invariantType` desconhecido é rejeitado 422
- [x] `params` incompletos para o tipo declarado é rejeitado 422 (todos os 4 tipos cobertos)
- [x] Listagem retorna todos os casos
- [x] Gate check passes: full
- [x] Test count: ≥7 tests pass

**Tests**: integration
**Gate**: full

**Commit**: `feat(hub): add deterministic harness eval dataset`

---

### T4: Rodar o eval determinístico

**What**: `runEvalCase(inventory, evalCase): {passed, reason}` (função pura, um branch por `invariantType`); `POST /projects/:id/harness/eval-runs` (roda todos os casos contra o inventário atual, persiste o run com `results` por caso e o score `passed`/`total`; exige inventário e ≥1 eval case, senão 422).
**Where**: `apps/hub/src/evolution/harness.ts` (extensão)
**Depends on**: T3
**Reuses**: mesmo padrão de função pura do `evaluateExperiment` (Slice 4)
**Requirement**: HRN-07, HRN-08, HRN-09

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [x] Um caso `requires_skill` cujo skill não está no inventário falha com motivo específico; declarando o skill e rodando de novo, passa
- [x] Os outros 3 tipos de invariante (`requires_mcp`, `forbids_mcp`, `min_component_count`) têm cada um teste de passar e de falhar
- [x] Rodar sem inventário declarado é rejeitado 422
- [x] Rodar sem eval cases declarados é rejeitado 422
- [x] Score `0/total` (todos falham) ainda persiste o run normalmente, sem erro
- [x] Gate check passes: full
- [x] Test count: ≥10 tests pass

**Tests**: integration
**Gate**: full

**Commit**: `feat(hub): run deterministic harness eval dataset`

---

### T5: Avaliar experimento a partir de um eval run (reuso do Slice 4)

**What**: `POST /projects/:id/harness/experiments/:experimentId/evaluate-from-eval-run` (roda o dataset contra o inventário atual, computa o score `passed/total`, chama `submitEvaluation` do Slice 4 sem alteração, retorna o mesmo formato de resposta do endpoint de avaliação original).
**Where**: `apps/hub/src/evolution/harness.ts` (extensão)
**Depends on**: T4
**Reuses**: `submitEvaluation` de `apps/hub/src/evolution/experiments.ts` (Slice 4), sem nenhuma alteração de assinatura
**Requirement**: HRN-10, HRN-11, HRN-12

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [x] Avaliar um experimento `running` a partir do eval run muda seu status para `evaluated` com o veredito calculado a partir do score
- [x] Avaliar um experimento de outro projeto é rejeitado 404
- [x] Avaliar um experimento que não está `running` é rejeitado 409
- [x] Gate check passes: full
- [x] Test count: ≥5 tests pass

**Tests**: integration
**Gate**: full

**Commit**: `feat(hub): evaluate experiments from harness eval runs`

---

### T6: Harness Observatory

**What**: `GET /projects/:id/harness/observatory` (agrega inventário corrente, contagem de eval cases, e o eval run mais recente — ou marcador explícito de ausência se nenhum run existir).
**Where**: `apps/hub/src/evolution/harness.ts` (extensão)
**Depends on**: T5
**Reuses**: as próprias funções de leitura já criadas em T2-T4
**Requirement**: HRN-13, HRN-14

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [x] Antes de qualquer eval run, a Observatory mostra ausência explícita de run
- [x] Depois de um eval run, a Observatory mostra o score desse run junto com inventário e contagem de eval cases
- [x] Requisição para projeto inexistente é rejeitada 404
- [x] Gate check passes: full
- [x] Test count: ≥4 tests pass

**Tests**: integration
**Gate**: full

**Commit**: `feat(hub): add harness observatory aggregate view`

---

### T7: Fechamento do slice — docs e review

**What**: Atualizar status do slice 6 no plano de execução para `implemented` e responder o checklist de review do slice em `design.md`.
**Where**: `docs/06-delivery/09-spec-driven-execution-plan.md`, `.specs/features/slice-6-harness-vertical/design.md`
**Depends on**: T6
**Reuses**: mesmo padrão de fechamento dos slices anteriores
**Requirement**: — (AGENTS.md: manter documentação atualizada)

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [x] Plano de execução marca slice 6 como `implemented`
- [x] Checklist de review do slice respondido
- [x] Gate check passes: build (inclui `check_docs.py`)

**Tests**: none
**Gate**: build

**Commit**: `docs(delivery): close slice 6 harness vertical`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4

Phase 1:  T1
Phase 2:  T2 ------→ T3
Phase 3:  T4 ------→ T5
Phase 4:  T6 ------→ T7

Transições de fase (fronteiras):
T1 → T2
T3 → T4
T5 → T6
```

Execution is strictly sequential - there is no intra-phase parallelism. Total tasks: 7 (≤ ~8) — execução inline, sem sub-agents de batch.

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1 | 1 migration + wiring de grant | ✅ Granular |
| T2 | 1 módulo (inventário) | ✅ Granular |
| T3 | extensão do mesmo módulo (eval cases) | ✅ Granular |
| T4 | extensão do mesmo módulo (função pura + rota de run) | ✅ Granular |
| T5 | extensão do mesmo módulo (evaluate-from-eval-run) | ✅ Granular |
| T6 | extensão do mesmo módulo (observatory) | ✅ Granular |
| T7 | atualização de docs | ✅ Granular |

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

Nenhuma dependência aponta para fase posterior. A cadeia é estritamente sequencial (T1→T2→T3→T4→T5→T6→T7).

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | ---------------------------- | ----------------- | ---------- | ------ |
| T1 | Hub migration | integration | integration | ✅ OK |
| T2 | Hub evolution (harness) | integration | integration | ✅ OK |
| T3 | Hub evolution (harness) | integration | integration | ✅ OK |
| T4 | Hub evolution (harness, puro + rota) | integration | integration | ✅ OK |
| T5 | Hub evolution (harness) | integration | integration | ✅ OK |
| T6 | Hub evolution (harness) | integration | integration | ✅ OK |
| T7 | Docs | none | none | ✅ OK |
