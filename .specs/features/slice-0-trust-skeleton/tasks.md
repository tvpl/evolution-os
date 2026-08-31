# Slice 0 — Trust Skeleton Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/slice-0-trust-skeleton/design.md`
**Status**: Approved

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec - confirm before Execute. Guidelines found: `AGENTS.md` (seção "Qualidade e verificação": testar unidades determinísticas, contratos de eventos/manifests, isolamento e autorização, idempotência, degradação); nenhum test runner pré-existente — repositório era documental, comandos definidos em T1. Strong defaults aplicados.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Contracts (schemas/validators) | unit | 1:1 com TRUST-15/16; exemplos válidos passam, payload mutilado falha por schema | `packages/contracts/test/*.test.ts` | `pnpm test:unit` |
| Hub domain/platform (identity, policy, registry, outbox, workflow) | integration (Postgres real) | 1:1 com ACs da spec; todo edge case listado tem teste; negativos de cross-tenant e idempotência obrigatórios | `apps/hub/test/*.test.ts` | `pnpm test:int` |
| Node CLI | integration | Happy path enroll/sync + rejeição sem enroll | `apps/node/test/*.test.ts` | `pnpm test:int` |
| Console (Next.js) | e2e | Fluxo UI→API→outbox→projection→UI happy + erro de validação | `apps/console/e2e/*.spec.ts` | `pnpm test:e2e` |
| Config / scaffolding / scripts shell / docs | none | - (build gate only) | - | build gate only |

## Gate Check Commands

> Generated from codebase - confirm before Execute. (Comandos criados em T1; `dev-db.sh start` é idempotente.)

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | After tasks with unit tests only | `pnpm test:unit` |
| Full | After tasks with integration/e2e tests | `bash scripts/dev-db.sh start && pnpm test:unit && pnpm test:int` (e2e tasks acrescentam `pnpm test:e2e`) |
| Build | After phase completion or config-only tasks | `pnpm typecheck && bash scripts/dev-db.sh start && pnpm test && python3 scripts/check_docs.py` |

---

## Execution Plan

Phases are ordered and run sequentially - each phase completes before the next begins, and tasks within a phase execute in order.

### Phase 1: Fundações

```
T1 → T2 → T3
```

### Phase 2: Hub base

```
T4 → T5 → T6
```

### Phase 3: Walking skeleton

```
T7 → T8 → T9
```

### Phase 4: Workflow e Node

```
T10 → T11 → T12
```

### Phase 5: Console e fechamento

```
T13 → T14
```

---

## Task Breakdown

### T1: Scaffold do monorepo pnpm

**What**: Workspace pnpm com TypeScript estrito, scripts raiz (`typecheck`, `test`, `test:unit`, `test:int`, `test:e2e`), tsconfig base e gitignore de código.
**Where**: `pnpm-workspace.yaml` (+ manifests raiz gerados pelo scaffold)
**Depends on**: None
**Reuses**: —
**Requirement**: — (infra)

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `pnpm install` resolve sem erros
- [x] `pnpm typecheck` roda (vazio ainda) com exit 0
- [x] Estrutura `apps/`, `packages/` criada

**Tests**: none
**Gate**: build

**Commit**: `build(monorepo): scaffold pnpm workspace and toolchain`

---

### T2: Script de banco local dev-db.sh

**What**: `dev-db.sh start|stop|status|reset` gerenciando cluster Postgres 16 local (initdb/pg_ctl como usuário `postgres`, socket unix, porta 55432) e imprimindo `DATABASE_URL`.
**Where**: `scripts/dev-db.sh`
**Depends on**: T1
**Reuses**: comprovação de viabilidade feita no design (initdb+pg_ctl no container)
**Requirement**: — (infra para AD-005)

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `start` idempotente; `psql select 1` responde
- [x] `stop` para o cluster; `reset` recria limpo
- [x] `status` reporta running/stopped com exit code coerente

**Tests**: none
**Gate**: build

**Commit**: `build(tooling): add local postgres lifecycle script`

---

### T3: Pacote contracts com schemas v0

**What**: `packages/contracts` com JSON Schemas v0 (project, evidence, proposal, decision, event envelope), validadores ajv tipados, constantes de event types e testes validando `examples/*.yaml` e rejeitando payloads mutilados.
**Where**: `packages/contracts/`
**Depends on**: T2
**Reuses**: `docs/07-specifications/*` (campos), `docs/02-architecture/10-api-event-model.md` §4-5 (envelope/taxonomia), `examples/*.yaml` (fixtures)
**Requirement**: TRUST-15, TRUST-16

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] 5 schemas v0 versionados exportados
- [x] `validate*` rejeita payload sem campo obrigatório com erro de schema
- [x] 4 exemplos YAML validam contra seus schemas
- [x] Gate check passes: `pnpm test:unit`
- [x] Test count: ≥10 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(contracts): add v0 schemas, validators and event types`

---

### T4: Platform DB — pool, transações e migrations

**What**: `apps/hub` módulo platform/db: pool `pg`, `withTx`, runner de migrations SQL sequenciais (`schema_migrations`) e migration 001 com todas as tabelas v0 do design.
**Where**: `apps/hub/src/platform/`
**Depends on**: T3
**Reuses**: modelo de dados do design.md
**Requirement**: — (base para TRUST-01..14)

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Migrations aplicam de zero e são idempotentes (re-run no-op)
- [x] `withTx` faz rollback em erro (testado)
- [x] Gate check passes: full
- [x] Test count: ≥4 tests pass

**Tests**: integration
**Gate**: full

**Commit**: `feat(hub): add postgres platform with migrations and tx helper`

---

### T5: Identity — dev-login, sessões e escopo de tenant

**What**: Seed dev (2 orgs/workspaces/users para testes negativos), `POST /auth/dev-login` emitindo token HMAC com `{userId, orgId, workspaceId}`, middleware `requireSession` que deriva escopo SEMPRE do token (nunca do payload) e servidor Fastify base com Problem Details.
**Where**: `apps/hub/src/identity/`
**Depends on**: T4
**Reuses**: platform/db (T4)
**Requirement**: TRUST-06

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Login dev retorna token escopado a exatamente uma org/workspace
- [x] Token inválido/ausente → 401 Problem Details
- [x] Tenant do payload é ignorado em favor do escopo da sessão (teste)
- [x] Gate check passes: full
- [x] Test count: ≥5 tests pass

**Tests**: integration
**Gate**: full

**Commit**: `feat(hub): add dev identity, sessions and tenant scoping`

---

### T6: Policy deny-by-default e audit log

**What**: `checkCapability(scope, capability)` consultando `capability_grants` (negar sem grant explícito), writer de `audit_log` e registro de auditoria em toda negação.
**Where**: `apps/hub/src/policy/`
**Depends on**: T5
**Reuses**: platform/db, identity scope
**Requirement**: TRUST-08, TRUST-09

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Capability sem grant → Deny com reason; com grant → Allow
- [x] Negação gera entrada de audit com actor/action/resource/reason
- [x] Gate check passes: full
- [x] Test count: ≥4 tests pass

**Tests**: integration
**Gate**: full

**Commit**: `feat(hub): add deny-by-default policy and audit log`

---

### T7: Comando register-project com idempotência e outbox

**What**: `POST /projects` (validação por schema v0, Idempotency-Key obrigatório, digest canônico, insert `projects` + `outbox` com envelope CloudEvents completo na MESMA transação) e casos 201/200-replay/409/422; negação cross-tenant integrada (policy + escopo).
**Where**: `apps/hub/src/registry/`
**Depends on**: T6
**Reuses**: contracts (schema project/event), identity, policy, platform
**Requirement**: TRUST-01, TRUST-03, TRUST-04, TRUST-05, TRUST-07

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Registro persiste projeto + evento `io.evolutionos.project.project.registered.v1` no outbox na mesma tx (falha → nada gravado)
- [x] Evento carrega extensions tenantid/workspaceid/projectid/correlationid/classification/schemaversion
- [x] Mesma key+digest → 200 replay sem novo evento; key reusada com digest diferente → 409
- [x] Sessão do tenant B acessando projeto do tenant A → 403 + audit (suite negativa)
- [x] Registros concorrentes geram projectids distintos sem perda
- [x] Gate check passes: full
- [x] Test count: ≥8 tests pass

**Tests**: integration
**Gate**: full

**Commit**: `feat(hub): add register-project command with idempotent outbox`

---

### T8: Dispatcher, inbox, projeção e leitura

**What**: `runDispatcherOnce` (poll outbox → router in-process), dedup por inbox `(consumer, event_id)`, projetor de `projects_view` e `GET /projects` lendo a projeção.
**Where**: `apps/hub/src/platform/outbox.ts` (+ projetor no mesmo módulo platform)
**Depends on**: T7
**Reuses**: platform/db, contracts event types
**Requirement**: TRUST-02

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Evento pendente vira linha em `projects_view`; `GET /projects` retorna o projeto
- [x] Entrega duplicada do mesmo evento → no-op (inbox dedup)
- [x] Dispatcher parado → evento fica pendente e é entregue após retomada, sem perda
- [x] Gate check passes: full
- [x] Test count: ≥6 tests pass

**Tests**: integration
**Gate**: full

**Commit**: `feat(hub): add outbox dispatcher, inbox dedup and projects projection`

---

### T9: Correlação OTel ponta a ponta

**What**: `packages/telemetry` (tracer + exporter in-memory para testes) e instrumentação: span do command HTTP, `traceparent` persistido na linha do outbox, spans de dispatch/projeção como filhos remotos — um único trace_id do comando à projeção.
**Where**: `packages/telemetry/`
**Depends on**: T8
**Reuses**: outbox (coluna traceparent de T4), Fastify hooks
**Requirement**: TRUST-10

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Teste captura spans de command/dispatch/projection com o MESMO trace_id
- [x] `correlationid` do evento presente como atributo nos spans
- [x] Gate check passes: full
- [x] Test count: ≥3 tests pass

**Tests**: integration
**Gate**: full

**Commit**: `feat(telemetry): correlate command, dispatch and projection in one trace`

---

### T10: Workflow durável hello path

**What**: Engine mínima (`defineWorkflow` com steps nomeados, `runWorkflowsOnce`, checkpoint jsonb, `workflow_steps` como prova de execução única) + workflow hello de 3 steps.
**Where**: `apps/hub/src/platform/workflow.ts`
**Depends on**: T9
**Reuses**: platform/db, withTx
**Requirement**: TRUST-11

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Hello workflow completa os 3 steps com checkpoint por step
- [x] Runner destruído após step 2 → nova instância retoma do checkpoint e NÃO repete steps 1-2 (via `workflow_steps`)
- [x] Gate check passes: full
- [x] Test count: ≥3 tests pass

**Tests**: integration
**Gate**: full

**Commit**: `feat(hub): add durable workflow engine with hello path`

---

### T11: Endpoints de Node — enroll e sync

**What**: `POST /nodes/enroll` (registra node, retorna token oneshot, guarda hash) e `POST /nodes/:id/artifacts` (valida token, grava artefato dummy com digest sha256); rejeição 401 sem enroll/token inválido.
**Where**: `apps/hub/src/nodes/`
**Depends on**: T10
**Reuses**: identity/session, platform/db
**Requirement**: TRUST-12, TRUST-13, TRUST-14

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Enroll registra identidade e responde ack com token
- [x] Sync com token grava artifact com digest verificável
- [x] Sync sem enroll/token inválido → 401
- [x] Gate check passes: full
- [x] Test count: ≥5 tests pass

**Tests**: integration
**Gate**: full

**Commit**: `feat(hub): add node enrollment and dummy artifact sync`

---

### T12: CLI evo — init, doctor, enroll, sync

**What**: `apps/node` CLI (`evo init|doctor|enroll|sync`) falando só HTTP com o Hub, config local em arquivo, digest sha256 do artefato dummy; testes de integração dirigem o binário contra um Hub real.
**Where**: `apps/node/`
**Depends on**: T11
**Reuses**: endpoints T11, contracts
**Requirement**: TRUST-12, TRUST-13 (lado cliente)

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `init` escreve config; `doctor` valida config + alcance do Hub
- [ ] `enroll` persiste token; `sync` envia dummy e imprime digest confirmado
- [ ] `sync` sem enroll falha com mensagem clara e exit != 0
- [ ] Gate check passes: full
- [ ] Test count: ≥4 tests pass

**Tests**: integration
**Gate**: full

**Commit**: `feat(node): add evo cli with init, doctor, enroll and sync`

---

### T13: Console Next.js — shell autenticado e round-trip e2e

**What**: `apps/console` Next.js App Router: `/login` (dev-login → cookie HttpOnly), `/w/[workspaceId]/projects` (Server Component lendo `GET /projects` do Hub) e form de registro via BFF (`Idempotency-Key` + `traceparent`); e2e Playwright do fluxo UI→API→outbox→projection→UI (happy + manifest inválido mostrando erro).
**Where**: `apps/console/`
**Depends on**: T12
**Reuses**: hub API, chromium pré-instalado do ambiente
**Requirement**: TRUST-01, TRUST-02 (superfície UI do exit M0)

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Login estabelece sessão; página lista projetos da projeção
- [ ] Registrar via form faz o projeto aparecer na lista (após dispatch)
- [ ] Manifest inválido exibe erro 422 sem registrar
- [ ] Console não acessa banco nem toma decisão de policy (só HTTP ao Hub)
- [ ] Gate check passes: full + `pnpm test:e2e`
- [ ] Test count: ≥2 e2e specs pass

**Tests**: e2e
**Gate**: full

**Commit**: `feat(console): add authenticated shell with register round-trip`

---

### T14: Documentação de execução e fechamento do slice

**What**: Seção "Como rodar o trust skeleton" no README raiz (dev-db, hub, console, CLI, testes), atualização do status do slice 0 no plano de execução e resposta ao checklist de review do slice (sequência de construção) no fim do design.md.
**Where**: `README.md`
**Depends on**: T13
**Reuses**: `docs/06-delivery/09-spec-driven-execution-plan.md`, `docs/06-delivery/05-build-sequence.md`
**Requirement**: — (AGENTS.md: "mantenha exemplos e documentação atualizados")

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] README documenta bootstrap completo em comandos copy-paste
- [ ] Plano de execução marca slice 0 como implementado (link para validation quando existir)
- [ ] Checklist de review do slice respondido
- [ ] Gate check passes: build (inclui `python3 scripts/check_docs.py`)

**Tests**: none
**Gate**: build

**Commit**: `docs(delivery): document trust skeleton bootstrap and close slice 0`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5

Phase 1:  T1 ------→ T2 ------→ T3
Phase 2:  T4 ------→ T5 ------→ T6
Phase 3:  T7 ------→ T8 ------→ T9
Phase 4:  T10 -----→ T11 -----→ T12
Phase 5:  T13 -----→ T14

Transições de fase (fronteiras):
T3 → T4
T6 → T7
T9 → T10
T12 → T13
```

Execution is strictly sequential - there is no intra-phase parallelism.

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1 | 1 scaffold de workspace | ✅ Granular |
| T2 | 1 script shell | ✅ Granular |
| T3 | 1 pacote (schemas+validators coesos) | ✅ Granular |
| T4 | 1 módulo platform/db | ✅ Granular |
| T5 | 1 módulo identity | ✅ Granular |
| T6 | 1 módulo policy+audit (coesos: negação gera audit) | ✅ Granular |
| T7 | 1 endpoint de comando | ✅ Granular |
| T8 | 1 pipeline outbox→projeção (coeso) | ✅ Granular |
| T9 | 1 pacote telemetry + instrumentação do fluxo | ✅ Granular |
| T10 | 1 módulo workflow | ✅ Granular |
| T11 | 2 endpoints do mesmo recurso nodes | ✅ Granular |
| T12 | 1 CLI | ✅ Granular |
| T13 | 1 app console (slice vertical mínimo coeso) | ✅ Granular |
| T14 | 1 atualização de docs | ✅ Granular |

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ---------------------- | ------------- | ------ |
| T1 | None | início Phase 1 | ✅ Match |
| T2 | T1 | T1 → T2 | ✅ Match |
| T3 | T2 | T2 → T3 | ✅ Match |
| T4 | T3 | T3 → T4 | ✅ Match |
| T5 | T4 | T4 → T5 | ✅ Match |
| T6 | T5 | T5 → T6 | ✅ Match |
| T7 | T6 | T6 → T7 | ✅ Match |
| T8 | T7 | T7 → T8 | ✅ Match |
| T9 | T8 | T8 → T9 | ✅ Match |
| T10 | T9 | T9 → T10 | ✅ Match |
| T11 | T10 | T10 → T11 | ✅ Match |
| T12 | T11 | T11 → T12 | ✅ Match |
| T13 | T12 | T12 → T13 | ✅ Match |
| T14 | T13 | T13 → T14 | ✅ Match |

Nenhuma dependência aponta para fase posterior.

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | --------------------------- | --------------- | --------- | ------ |
| T1 | Config/scaffolding | none | none | ✅ OK |
| T2 | Script shell | none | none | ✅ OK |
| T3 | Contracts | unit | unit | ✅ OK |
| T4 | Hub platform | integration | integration | ✅ OK |
| T5 | Hub identity | integration | integration | ✅ OK |
| T6 | Hub policy | integration | integration | ✅ OK |
| T7 | Hub registry | integration | integration | ✅ OK |
| T8 | Hub platform | integration | integration | ✅ OK |
| T9 | Telemetry + hub | integration | integration | ✅ OK |
| T10 | Hub platform | integration | integration | ✅ OK |
| T11 | Hub nodes | integration | integration | ✅ OK |
| T12 | Node CLI | integration | integration | ✅ OK |
| T13 | Console | e2e | e2e | ✅ OK |
| T14 | Docs | none | none | ✅ OK |
