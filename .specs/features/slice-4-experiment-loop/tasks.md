# Slice 4 — Experiment Loop Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/slice-4-experiment-loop/design.md`
**Status**: Approved

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec - confirm before Execute. Guidelines found: `AGENTS.md` + testes reais já existentes (Slices 0-3: integration contra Postgres real via `freshDb`). Reusado sem alteração.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------- | --------------------- | ----------------- | ------------ |
| Hub domain (evolution: experiments) | integration (Postgres real) | 1:1 com ACs da spec; todo edge case listado tem teste | `apps/hub/test/*.test.ts` | `pnpm test:int` |
| `platform/canonical-json` (extração) | integration (co-locado, sem chamada a DB) | Comportamento de serialização testado diretamente + regressão dos testes existentes do Slice 2 (`candidates.test.ts`, `diff.test.ts`) passando inalterados | `apps/hub/test/*.test.ts` | `pnpm test:int` |
| `evaluateExperiment` puro | integration (co-locado, sem chamada a DB) | Funções puras testadas diretamente, mesmo padrão do `analysis-provider.test.ts` do Slice 3 | `apps/hub/test/*.test.ts` | `pnpm test:int` |
| Migration | none | - (build gate only) | - | build gate only |

## Gate Check Commands

> Reusa os comandos confirmados nos Slices 0-3.

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Full | After tasks with integration tests | `bash scripts/dev-db.sh start && pnpm test:unit && pnpm test:int` |
| Build | After phase completion or docs-only tasks | `pnpm typecheck && bash scripts/dev-db.sh start && pnpm test && python3 scripts/check_docs.py` |

---

## Execution Plan

### Phase 1: Fundação

```
T1 → T2
```

### Phase 2: Iniciar experimento

```
T3
```

### Phase 3: Proof artifacts e avaliação

```
T4 → T5
```

### Phase 4: Fechamento

```
T6
```

### Phase 5: Encerramento do slice

```
T7
```

---

## Task Breakdown

### T1: Migration 005 — experiments + capability grant

**What**: `apps/hub/migrations/005_experiments.sql` criando `experiments` e `experiment_artifacts`; estender `seedDevGrants` com `experiment.write` para os dois tenants dev.
**Where**: `apps/hub/migrations/005_experiments.sql`, `apps/hub/src/policy/policy.ts`
**Depends on**: None
**Reuses**: runner de migrations e padrão de grants dos Slices 0-3
**Requirement**: — (base para todo o resto do slice)

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [x] Migration aplica de zero e é idempotente
- [x] Novo grant `experiment.write` aparece para os dois tenants dev
- [x] Gate check passes: full
- [x] Test count: ≥2 tests pass

**Tests**: integration
**Gate**: full

**Commit**: `feat(hub): add experiments migration and capability grant`

---

### T2: Extrair canonicalJson para util compartilhado

**What**: Mover `canonicalJson` de `apps/hub/src/twin/cartographer.ts` para `apps/hub/src/platform/canonical-json.ts` (extração byte-a-byte, sem mudança de comportamento); `cartographer.ts` passa a importar do novo local.
**Where**: `apps/hub/src/platform/canonical-json.ts` (novo), `apps/hub/src/twin/cartographer.ts` (modifica import)
**Depends on**: T1
**Reuses**: implementação existente de `canonicalJson` (Slice 2)
**Requirement**: — (infra para EXP-01, ver Assumptions da spec)

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [ ] `canonicalJson` produz a mesma string para objetos com chaves em ordens diferentes (teste direto)
- [ ] `canonicalJson` produz strings diferentes para arrays com a mesma chave em ordens diferentes de elementos (teste direto — arrays preservam ordem)
- [ ] Suíte existente do Slice 2 (`candidates.test.ts`, `diff.test.ts`) passa inalterada (regressão do `payloadEquals`)
- [ ] Gate check passes: full
- [ ] Test count: ≥2 tests pass (novos, além da suíte de regressão)

**Tests**: integration
**Gate**: full

**Commit**: `refactor(hub): extract canonicalJson to a shared platform util`

---

### T3: Iniciar experimento a partir de uma proposal readyForReview

**What**: `POST /projects/:id/proposals/:proposalId/experiments` (exige `variants` com exatamente 2 itens e `verificationPlan` completo; lê a proposal do banco e computa o digest via `canonicalJson`; cria o experimento `status='running'`; transiciona a proposal para `status='executing'`); `GET /projects/:id/experiments/:experimentId`.
**Where**: `apps/hub/src/evolution/experiments.ts`
**Depends on**: T2
**Reuses**: `requireOwnedProject`, `enforceCapability`, `canonicalJson` de T2
**Requirement**: EXP-01, EXP-02, EXP-03, EXP-04

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [ ] Experimento criado a partir de proposal `readyForReview` com 2 variantes e plano completo persiste `status=running`, digest presente, e a proposal muda para `executing`
- [ ] Variantes com tamanho != 2 são rejeitadas 422 sem criar linha
- [ ] Plano de verificação incompleto é rejeitado 422 sem criar linha
- [ ] Iniciar experimento numa proposal fora de `readyForReview` é rejeitado 409
- [ ] Gate check passes: full
- [ ] Test count: ≥6 tests pass

**Tests**: integration
**Gate**: full

**Commit**: `feat(hub): start experiment from a ready-for-review proposal`

---

### T4: Proof artifacts — anexar e listar

**What**: `POST /projects/:id/experiments/:experimentId/artifacts` (liga um artifact existente ao experimento, idempotente via `ON CONFLICT DO NOTHING`); `GET /projects/:id/experiments/:experimentId/artifacts`.
**Where**: `apps/hub/src/evolution/experiments.ts` (extensão)
**Depends on**: T3
**Reuses**: `createArtifact`/`listArtifacts` do Slice 1 (o cliente cria o artifact pelo endpoint já existente); padrão de dedup idempotente do `signals.ts` (Slice 3)
**Requirement**: EXP-05, EXP-06, EXP-07

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [ ] Anexar um artifact existente do projeto ao experimento persiste o link
- [ ] Anexar o mesmo artifact duas vezes não duplica a linha (idempotente)
- [ ] Anexar artifact de outro projeto é rejeitado 422
- [ ] Listagem retorna todos os artifacts anexados
- [ ] Gate check passes: full
- [ ] Test count: ≥5 tests pass

**Tests**: integration
**Gate**: full

**Commit**: `feat(hub): attach and list experiment proof artifacts`

---

### T5: Avaliação determinística

**What**: `evaluateExperiment(plan, observedValue): {verdict, rationale}` (função pura: compara `observedValue` contra `threshold` via `comparison`, ou retorna `inconclusive` se `observedValue === null`); `POST /projects/:id/experiments/:experimentId/evaluate` (exige o campo de valor observado presente — número finito ou `null` explícito — grava `observed_value`/`verdict`/`verdict_rationale` e muda `status='evaluated'`).
**Where**: `apps/hub/src/evolution/experiments.ts` (extensão)
**Depends on**: T4
**Reuses**: mesmo padrão de função pura do `analysis-provider.ts` (Slice 3)
**Requirement**: EXP-08, EXP-09, EXP-10, EXP-11, EXP-12

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [ ] Valor observado que satisfaz o threshold (per `comparison`) produz `hypothesis_met` e `status=evaluated`
- [ ] Valor observado que não satisfaz o threshold produz `hypothesis_not_met`
- [ ] Valor observado `null` explícito produz `inconclusive` com rationale
- [ ] Requisição sem o campo de valor observado é rejeitada 422 sem gravar veredito
- [ ] Valor não numérico e não-null (string/NaN/Infinity) é rejeitado 422
- [ ] Avaliar um experimento que não está `running` é rejeitado 409
- [ ] Gate check passes: full
- [ ] Test count: ≥8 tests pass

**Tests**: integration
**Gate**: full

**Commit**: `feat(hub): add deterministic experiment evaluation`

---

### T6: Fechamento com decisão preservada

**What**: `POST /projects/:id/experiments/:experimentId/close` (exige experimento `evaluated`; chama `recordDecision` com `subjectType='proposal'`, `subjectId=<proposal do experimento>`; muda `status='closed'` no experimento e na proposal na mesma operação).
**Where**: `apps/hub/src/evolution/experiments.ts` (extensão)
**Depends on**: T5
**Reuses**: `recordDecision` de `idea-memory/decisions.ts` (Slice 1/3) sem nenhuma alteração
**Requirement**: EXP-13, EXP-14, EXP-15

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [ ] Fechar um experimento `evaluated` grava a decisão via o mecanismo existente, muda o experimento para `closed` e a proposal para `closed`
- [ ] Fechar um experimento que não está `evaluated` é rejeitado 409
- [ ] A resposta do fechamento expõe `priorRelatedDecisions` da proposal (reuso do guard do Slice 1/3)
- [ ] Gate check passes: full
- [ ] Test count: ≥4 tests pass

**Tests**: integration
**Gate**: full

**Commit**: `feat(hub): close experiment with preserved outcome decision`

---

### T7: Fechamento do slice — docs e review

**What**: Atualizar status do slice 4 no plano de execução para `implemented` e responder o checklist de review do slice em `design.md`.
**Where**: `docs/06-delivery/09-spec-driven-execution-plan.md`, `.specs/features/slice-4-experiment-loop/design.md`
**Depends on**: T6
**Reuses**: mesmo padrão de fechamento dos slices anteriores
**Requirement**: — (AGENTS.md: manter documentação atualizada)

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [ ] Plano de execução marca slice 4 como `implemented`
- [ ] Checklist de review do slice respondido
- [ ] Gate check passes: build (inclui `check_docs.py`)

**Tests**: none
**Gate**: build

**Commit**: `docs(delivery): close slice 4 experiment loop`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5

Phase 1:  T1 ------→ T2
Phase 2:  T3
Phase 3:  T4 ------→ T5
Phase 4:  T6
Phase 5:  T7

Transições de fase (fronteiras):
T2 → T3
T3 → T4
T5 → T6
T6 → T7
```

Execution is strictly sequential - there is no intra-phase parallelism. Total tasks: 7 (≤ ~8) — execução inline, sem sub-agents de batch.

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1 | 1 migration + wiring de grant | ✅ Granular |
| T2 | 1 extração de função para 1 novo arquivo + 1 import atualizado | ✅ Granular |
| T3 | 1 módulo (start experiment: digest + validação + transição) | ✅ Granular |
| T4 | extensão do mesmo módulo (proof artifacts: attach+list) | ✅ Granular |
| T5 | extensão do mesmo módulo (evaluate: função pura + rota) | ✅ Granular |
| T6 | extensão do mesmo módulo (close: reuso de decisions) | ✅ Granular |
| T7 | atualização de docs | ✅ Granular |

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ----------------------- | -------------- | ------ |
| T1 | None | início Phase 1 | ✅ Match |
| T2 | T1 | Phase 1 (T1 → T2) | ✅ Match |
| T3 | T2 | Phase 2 após Phase 1 (T2 → T3) | ✅ Match |
| T4 | T3 | Phase 3 após Phase 2 (T3 → T4) | ✅ Match |
| T5 | T4 | Phase 3 (T4 → T5) | ✅ Match |
| T6 | T5 | Phase 4 após Phase 3 (T5 → T6) | ✅ Match |
| T7 | T6 | Phase 5 após Phase 4 (T6 → T7) | ✅ Match |

Nenhuma dependência aponta para fase posterior. A cadeia é estritamente sequencial (T1→T2→T3→T4→T5→T6→T7), consistente com a execução inline de 7 tarefas sem paralelismo intra-fase.

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | ---------------------------- | ----------------- | ---------- | ------ |
| T1 | Hub migration | integration | integration | ✅ OK |
| T2 | `platform/canonical-json` (puro) | integration | integration | ✅ OK |
| T3 | Hub evolution (experiments) | integration | integration | ✅ OK |
| T4 | Hub evolution (experiments) | integration | integration | ✅ OK |
| T5 | Hub evolution (experiments, puro + rota) | integration | integration | ✅ OK |
| T6 | Hub evolution (experiments) | integration | integration | ✅ OK |
| T7 | Docs | none | none | ✅ OK |
