# Slice 1 — Idea Memory Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/slice-1-idea-memory/design.md`
**Status**: Approved

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec - confirm before Execute. Guidelines found: `AGENTS.md` (mesmas regras do Slice 0) + os testes reais já existentes em `apps/hub/test/*.test.ts` (sampled: identity, policy, registry, outbox-projection, workflow, nodes — todos integration contra Postgres real via `freshDb`) e `apps/console/e2e/*.spec.ts` (Playwright). O padrão é reusado sem alteração.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------- | --------------------- | ----------------- | ------------ |
| Contracts (schema) | unit | 1:1 com IDEA-01/04; exemplo válido passa, duplicidade/campo ausente falha | `packages/contracts/test/*.test.ts` | `pnpm test:unit` |
| Hub domain (idea-memory, registry extension) | integration (Postgres real) | 1:1 com ACs da spec; todo edge case listado tem teste; cross-tenant e conflitos obrigatórios | `apps/hub/test/*.test.ts` | `pnpm test:int` |
| Console (Next.js) | e2e | Overview renderizado após fluxo completo de registro+hipóteses | `apps/console/e2e/*.spec.ts` | `pnpm test:e2e` |
| Migration / config / docs | none | - (build gate only) | - | build gate only |

## Gate Check Commands

> Reusa os comandos já confirmados no Slice 0.

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | After tasks with unit tests only | `pnpm test:unit` |
| Full | After tasks with integration/e2e tests | `bash scripts/dev-db.sh start && pnpm test:unit && pnpm test:int` (tarefas e2e acrescentam `cd apps/console && pnpm test:e2e`) |
| Build | After phase completion or config/docs-only tasks | `pnpm typecheck && bash scripts/dev-db.sh start && pnpm test && python3 scripts/check_docs.py` |

---

## Execution Plan

Phases are ordered and run sequentially - each phase completes before the next begins, and tasks within a phase execute in order.

### Phase 1: Fundação

```
T1 → T2
```

### Phase 2: Registro estendido

```
T3 → T4
```

### Phase 3: Overview

```
T5 → T6
```

### Phase 4: Artefatos

```
T7 → T8
```

### Phase 5: Decisões

```
T9
```

### Phase 6: Timeline, export/import e fechamento

```
T10 → T11 → T12 → T13
```

---

## Task Breakdown

### T1: Schema v0 do projeto ganha `spec.hypotheses`

**What**: Adicionar `spec.hypotheses[]` ao `project.v0.json` (id, statement, type, evidenceState, metric, threshold, status obrigatórios exceto metric/threshold) e testes cobrindo aceite e rejeição de item malformado.
**Where**: `packages/contracts/src/schemas/project.v0.json`
**Depends on**: None
**Reuses**: shape de `spec.constraints` já existente no mesmo schema
**Requirement**: IDEA-01

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [x] Manifest com `spec.hypotheses` válido passa `validateProject`
- [x] Hipótese sem `statement` é rejeitada nomeando o campo
- [x] Gate check passes: `pnpm test:unit`
- [x] Test count: ≥2 novos tests pass (sem deleção)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(contracts): add hypotheses to the project v0 schema`

---

### T2: Migration 002 — idea memory + capabilities

**What**: `apps/hub/migrations/002_idea_memory.sql` criando `hypotheses`, `constraints`, `artifacts`, `artifact_versions`, `decisions`; estender `seedDevGrants` com `project.overview.read`, `hypothesis.write`, `artifact.write`, `decision.write` para os dois tenants dev.
**Where**: `apps/hub/migrations/002_idea_memory.sql`, `apps/hub/src/policy/policy.ts`
**Depends on**: T1
**Reuses**: runner de migrations e padrão de grants do Slice 0
**Requirement**: — (base para todo o resto do slice)

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [x] Migration aplica de zero e é idempotente (mesmo teste-padrão do Slice 0)
- [x] Novos grants aparecem para os dois tenants dev
- [x] Gate check passes: full
- [x] Test count: ≥2 tests pass

**Tests**: integration
**Gate**: full

**Commit**: `feat(hub): add idea-memory migration and capability grants`

---

### T3: Módulo de hipóteses — persistência, dedup e listagem

**What**: `insertHypotheses(client, projectId, scope, hypotheses[])` chamado dentro da MESMA transação de `registerProject`; rejeita ID duplicado dentro do manifest com 422 antes de qualquer insert; `GET /projects/:id/hypotheses` lista ordenado por criação com `authority='declared'`.
**Where**: `apps/hub/src/idea-memory/hypotheses.ts`, `apps/hub/src/registry/registry.ts` (wiring)
**Depends on**: T2
**Reuses**: `withTx` existente do registro (Slice 0) — sem nova transação
**Requirement**: IDEA-01, IDEA-02, IDEA-03, IDEA-04

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [x] Registro com 2 hipóteses grava as duas com `authority='declared'`
- [x] Registro com IDs duplicados é rejeitado 422 sem gravar nada (rollback comprovado)
- [x] `GET /projects/:id/hypotheses` retorna ordenado com status
- [x] Registro sem `spec.hypotheses` não falha (lista vazia)
- [x] Gate check passes: full
- [x] Test count: ≥6 tests pass

**Tests**: integration
**Gate**: full

**Commit**: `feat(hub): persist and list project hypotheses on registration`

---

### T4: Módulo de constraints — persistência

**What**: `insertConstraints(client, projectId, scope, constraints[])` chamado na mesma transação do registro, mesmo padrão de `authority='declared'`.
**Where**: `apps/hub/src/idea-memory/constraints.ts`, wiring em `registry.ts`
**Depends on**: T3
**Reuses**: mesmo padrão de T3
**Requirement**: IDEA-01, IDEA-02

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [ ] Registro com constraints grava cada um com `authority='declared'`
- [ ] Registro sem constraints não falha (lista vazia)
- [ ] Gate check passes: full
- [ ] Test count: ≥3 tests pass

**Tests**: integration
**Gate**: full

**Commit**: `feat(hub): persist project constraints on registration`

---

### T5: Endpoint de Project Overview

**What**: `GET /projects/:id/overview` agregando identidade + intent + hipóteses + constraints + contagem de artifacts/decisions numa resposta; nega cross-tenant no mesmo padrão de TRUST-07.
**Where**: `apps/hub/src/idea-memory/overview.ts`
**Depends on**: T4
**Reuses**: `enforceCapability`, `recordAudit`, `requireScope` (Slice 0)
**Requirement**: IDEA-05, IDEA-06

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [ ] Overview de projeto com hipóteses/constraints/artifacts/decisions retorna todos os blocos numa carga
- [ ] Overview cross-tenant é negado e auditado
- [ ] Overview de projeto vazio retorna arrays vazios, não erro
- [ ] Gate check passes: full
- [ ] Test count: ≥5 tests pass

**Tests**: integration
**Gate**: full

**Commit**: `feat(hub): add aggregated project overview endpoint`

---

### T6: Página de Project Overview no console

**What**: `apps/console/app/w/[workspaceId]/projects/[projectId]/page.tsx` renderizando o overview (identidade, intent, hipóteses, constraints, contagens); link a partir da lista de projetos existente.
**Where**: `apps/console/app/w/[workspaceId]/projects/[projectId]/page.tsx`, `apps/console/app/w/[workspaceId]/projects/page.tsx` (link)
**Depends on**: T5
**Reuses**: BFF pattern e `hubGet` do Slice 0
**Requirement**: IDEA-07

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [ ] Registrar um projeto com hipóteses e abrir sua página de overview mostra identidade + hipóteses
- [ ] Gate check passes: full + `cd apps/console && pnpm test:e2e`
- [ ] Test count: ≥1 e2e spec pass

**Tests**: e2e
**Gate**: full

**Commit**: `feat(console): add project overview page`

---

### T7: Artefatos — criação v1 e listagem

**What**: `POST /projects/:id/artifacts` cria artifact em `current_version=1` + `artifact_versions` v1; `GET /projects/:id/artifacts` lista com versão atual e contagem de versões.
**Where**: `apps/hub/src/idea-memory/artifacts.ts`
**Depends on**: T6
**Reuses**: policy/http patterns do Slice 0
**Requirement**: IDEA-08, IDEA-10

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [ ] Criar artifact grava v1 com reference/content
- [ ] Listagem mostra versão atual e contagem
- [ ] Criação sem reference/content é rejeitada 422 sem gravar nada
- [ ] Gate check passes: full
- [ ] Test count: ≥5 tests pass

**Tests**: integration
**Gate**: full

**Commit**: `feat(hub): add artifact creation and listing`

---

### T8: Artefatos — novas versões e leitura de versão específica

**What**: `POST /projects/:id/artifacts/:artifactId/versions` cria a próxima versão preservando as anteriores; `GET /projects/:id/artifacts/:artifactId/versions/:version` retorna o conteúdo exato daquela versão.
**Where**: `apps/hub/src/idea-memory/artifacts.ts` (extensão)
**Depends on**: T7
**Reuses**: mesmo módulo de T7
**Requirement**: IDEA-09, IDEA-11

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [ ] Duas novas versões incrementam `current_version` para 3 preservando v1/v2 inalteradas
- [ ] Buscar v1 explicitamente retorna o conteúdo original, não o atual
- [ ] Gate check passes: full
- [ ] Test count: ≥4 tests pass

**Tests**: integration
**Gate**: full

**Commit**: `feat(hub): add artifact versioning with historical reads`

---

### T9: Decisões — registro com guard e listagem

**What**: `POST /projects/:id/decisions` valida `subjectRef` (hypothesis/artifact do mesmo projeto quando presente), grava decisão com rationale/alternatives/review trigger, e retorna `priorRelatedDecisions` buscando decisões anteriores com o mesmo `subjectRef`; `GET /projects/:id/decisions` lista mais-recente-primeiro com status do review trigger.
**Where**: `apps/hub/src/idea-memory/decisions.ts`
**Depends on**: T8
**Reuses**: policy/http patterns
**Requirement**: IDEA-12, IDEA-13, IDEA-14, IDEA-15

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [ ] Decisão com rationale/alternatives/review trigger é persistida e listável
- [ ] Decisão referenciando hypothesis/artifact de outro projeto é rejeitada 422
- [ ] Segunda decisão sobre o mesmo `subjectRef` retorna a primeira em `priorRelatedDecisions`
- [ ] Decisão sem review trigger lista com status `none`
- [ ] Gate check passes: full
- [ ] Test count: ≥7 tests pass

**Tests**: integration
**Gate**: full

**Commit**: `feat(hub): add decisions with subject validation and prior-decision guard`

---

### T10: Timeline

**What**: `GET /projects/:id/timeline` unindo hypothesis status/artifact version events/decisions por `occurred_at` desc, limitado a 200.
**Where**: `apps/hub/src/idea-memory/timeline.ts`
**Depends on**: T9
**Reuses**: tabelas já criadas em T2-T9
**Requirement**: IDEA-16

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [ ] Timeline de um projeto com hipótese+artifact+decisão retorna os 3 eventos ordenados desc
- [ ] Gate check passes: full
- [ ] Test count: ≥3 tests pass

**Tests**: integration
**Gate**: full

**Commit**: `feat(hub): add unified project timeline endpoint`

---

### T11: Export

**What**: `GET /projects/:id/export` retorna manifest portável (`apiVersion`/`kind` + identidade + intent + hypotheses + constraints + versão atual de cada artifact + decisions), validado contra o schema v0 antes de servir.
**Where**: `apps/hub/src/idea-memory/export-import.ts`
**Depends on**: T10
**Reuses**: `validateProject` de contracts
**Requirement**: IDEA-17

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [ ] Export de projeto com todas as entidades passa `validateProject`
- [ ] Export preserva os IDs originais de hipóteses/artifacts/decisions
- [ ] Gate check passes: full
- [ ] Test count: ≥3 tests pass

**Tests**: integration
**Gate**: full

**Commit**: `feat(hub): add portable project export`

---

### T12: Import com detecção de conflito e round-trip

**What**: `POST /projects/import` recria projeto+entidades a partir de um export numa única `withTx`; rejeita 409 se o ID do projeto já existir no tenant.
**Where**: `apps/hub/src/idea-memory/export-import.ts` (extensão)
**Depends on**: T11
**Reuses**: mesmo módulo de T11; `withTx`
**Requirement**: IDEA-18, IDEA-19

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [ ] Export → import round-trip preserva todos os IDs (hipóteses/artifacts/decisions)
- [ ] Reimportar o mesmo export é rejeitado 409 sem duplicar
- [ ] Import parcialmente inválido não deixa dados órfãos (rollback comprovado)
- [ ] Gate check passes: full
- [ ] Test count: ≥4 tests pass

**Tests**: integration
**Gate**: full

**Commit**: `feat(hub): add project import with conflict detection`

---

### T13: Fechamento do slice — docs e review

**What**: Atualizar `README.md` (endpoints novos, opcional), status do slice 1 no plano de execução para `implemented`, e responder o checklist de review do slice em `design.md`.
**Where**: `docs/06-delivery/09-spec-driven-execution-plan.md`, `.specs/features/slice-1-idea-memory/design.md`
**Depends on**: T12
**Reuses**: mesmo padrão de fechamento do Slice 0 (T14)
**Requirement**: — (AGENTS.md: manter documentação atualizada)

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [ ] Plano de execução marca slice 1 como `implemented`
- [ ] Checklist de review do slice respondido em design.md
- [ ] Gate check passes: build (inclui `check_docs.py`)

**Tests**: none
**Gate**: build

**Commit**: `docs(delivery): close slice 1 idea memory`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6

Phase 1:  T1 ------→ T2
Phase 2:  T3 ------→ T4
Phase 3:  T5 ------→ T6
Phase 4:  T7 ------→ T8
Phase 5:  T9
Phase 6:  T10 -----→ T11 -----→ T12 -----→ T13

Transições de fase (fronteiras):
T2 → T3
T4 → T5
T6 → T7
T8 → T9
T9 → T10
```

Execution is strictly sequential - there is no intra-phase parallelism.

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1 | 1 schema (adição coesa) | ✅ Granular |
| T2 | 1 migration + wiring de grants | ✅ Granular |
| T3 | 1 módulo (hipóteses: insert+dedup+list) | ✅ Granular |
| T4 | 1 módulo (constraints: insert) | ✅ Granular |
| T5 | 1 endpoint | ✅ Granular |
| T6 | 1 página | ✅ Granular |
| T7 | 1 módulo (artifacts: create+list) | ✅ Granular |
| T8 | extensão do mesmo módulo (versions) | ✅ Granular |
| T9 | 1 módulo (decisions: record+guard+list) | ✅ Granular |
| T10 | 1 endpoint | ✅ Granular |
| T11 | 1 endpoint | ✅ Granular |
| T12 | extensão do mesmo módulo (import) | ✅ Granular |
| T13 | atualização de docs | ✅ Granular |

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ----------------------- | -------------- | ------ |
| T1 | None | início Phase 1 | ✅ Match |
| T2 | T1 | Phase 1 após T1 | ✅ Match |
| T3 | T2 | Phase 2 após Phase 1 (T2 → T3) | ✅ Match |
| T4 | T3 | Phase 2 após T3 | ✅ Match |
| T5 | T4 | Phase 3 após Phase 2 (T4 → T5) | ✅ Match |
| T6 | T5 | Phase 3 após T5 | ✅ Match |
| T7 | T6 | Phase 4 após Phase 3 (T6 → T7) | ✅ Match |
| T8 | T7 | Phase 4 após T7 | ✅ Match |
| T9 | T8 | Phase 5 após Phase 4 (T8 → T9) | ✅ Match |
| T10 | T9 | Phase 6 após Phase 5 (T9 → T10) | ✅ Match |
| T11 | T10 | Phase 6 após T10 | ✅ Match |
| T12 | T11 | Phase 6 após T11 | ✅ Match |
| T13 | T12 | Phase 6 após T12 | ✅ Match |

Nenhuma dependência aponta para fase posterior.

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | ---------------------------- | ----------------- | ---------- | ------ |
| T1 | Contracts | unit | unit | ✅ OK |
| T2 | Hub migration | integration | integration | ✅ OK |
| T3 | Hub idea-memory | integration | integration | ✅ OK |
| T4 | Hub idea-memory | integration | integration | ✅ OK |
| T5 | Hub idea-memory | integration | integration | ✅ OK |
| T6 | Console | e2e | e2e | ✅ OK |
| T7 | Hub idea-memory | integration | integration | ✅ OK |
| T8 | Hub idea-memory | integration | integration | ✅ OK |
| T9 | Hub idea-memory | integration | integration | ✅ OK |
| T10 | Hub idea-memory | integration | integration | ✅ OK |
| T11 | Hub idea-memory | integration | integration | ✅ OK |
| T12 | Hub idea-memory | integration | integration | ✅ OK |
| T13 | Docs | none | none | ✅ OK |
