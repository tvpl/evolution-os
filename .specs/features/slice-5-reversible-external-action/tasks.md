# Slice 5 — Reversible External Action Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/slice-5-reversible-external-action/design.md`
**Status**: Approved

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec - confirm before Execute. Guidelines found: `AGENTS.md` + testes reais já existentes (Slices 0-4: integration contra Postgres real via `freshDb`). Reusado sem alteração.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------- | --------------------- | ----------------- | ------------ |
| Hub domain (evolution: github-connector) | integration (Postgres real) | 1:1 com ACs da spec; todo edge case listado tem teste | `apps/hub/test/*.test.ts` | `pnpm test:int` |
| Migration | none | - (build gate only) | - | build gate only |

## Gate Check Commands

> Reusa os comandos confirmados nos Slices 0-4.

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

### Phase 2: Conectar e ingerir webhook

```
T2 → T3
```

### Phase 3: Ação externa e prova

```
T4 → T5
```

### Phase 4: Encerramento do slice

```
T6
```

---

## Task Breakdown

### T1: Migration 006 — github connectors + capability grants

**What**: `apps/hub/migrations/006_github_connectors.sql` criando `github_connections`, `github_webhook_events`, `github_actions`, `github_action_ci_statuses`; estender `seedDevGrants` com `connector.write` e `connector.github.write` para os dois tenants dev.
**Where**: `apps/hub/migrations/006_github_connectors.sql`, `apps/hub/src/policy/policy.ts`
**Depends on**: None
**Reuses**: runner de migrations e padrão de grants dos Slices 0-4
**Requirement**: — (base para todo o resto do slice)

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [x] Migration aplica de zero e é idempotente
- [x] Novos grants aparecem para os dois tenants dev
- [x] Gate check passes: full
- [x] Test count: ≥2 tests pass

**Tests**: integration
**Gate**: full

**Commit**: `feat(hub): add github connectors migration and capability grants`

---

### T2: Conectar um repositório GitHub

**What**: `POST /projects/:id/connectors/github` (exige `owner`/`repo`; gera webhook secret aleatório retornado uma única vez; `status='connected'`; rejeita duplicata do mesmo par no projeto).
**Where**: `apps/hub/src/evolution/github-connector.ts`
**Depends on**: T1
**Reuses**: `requireOwnedProject`, `enforceCapability`
**Requirement**: GH-01, GH-02, GH-03

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [x] Conectar owner/repo persiste `status=connected` e retorna um webhook secret
- [x] Conectar o mesmo par duas vezes no mesmo projeto é rejeitado 409
- [x] Conectar sem owner ou repo é rejeitado 422
- [x] Gate check passes: full
- [x] Test count: ≥5 tests pass

**Tests**: integration
**Gate**: full

**Commit**: `feat(hub): add github repo connection`

---

### T3: Ingestão de webhook com assinatura e dedup

**What**: `POST /projects/:id/connectors/github/:connectionId/webhook` (valida `x-hub-signature-256: sha256=<hex>` = HMAC-SHA256 do JSON canônico do corpo usando o secret da conexão, comparação em tempo constante; deduplica por `x-github-delivery`; atualiza `lastEventAt` da conexão).
**Where**: `apps/hub/src/evolution/github-connector.ts` (extensão)
**Depends on**: T2
**Reuses**: `canonicalJson` de `platform/canonical-json.ts` para serializar o corpo antes de assinar
**Requirement**: GH-04, GH-05, GH-06

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [x] Webhook com assinatura válida e delivery ID novo persiste o evento e atualiza `lastEventAt`
- [x] Webhook com assinatura inválida é rejeitado 401 sem gravar
- [x] Webhook com delivery ID repetido é no-op (200, sem duplicar linha)
- [x] Gate check passes: full
- [x] Test count: ≥5 tests pass

**Tests**: integration
**Gate**: full

**Commit**: `feat(hub): ingest github webhooks with signature validation and dedup`

---

### T4: Criar ação externa controlada (issue/branch/draftPr)

**What**: `POST /projects/:id/connectors/github/actions` (exige `actionType` em `{issue, branch, draftPr}`, `connectionId`, `title`, header `Idempotency-Key`; cria via adapter determinístico `GitHubActionConnector` gerando `externalRef` mock; reusa `idempotency_keys`/`canonicalDigest` do Slice 0 para replay-safe/conflict; exige capability `connector.github.write`).
**Where**: `apps/hub/src/evolution/github-connector.ts` (extensão)
**Depends on**: T3
**Reuses**: `canonicalDigest` e tabela `idempotency_keys` de `apps/hub/src/registry/registry.ts` (Slice 0), sem alteração
**Requirement**: GH-07, GH-08, GH-09, GH-10, GH-11

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [x] Ação criada com `actionType` válido persiste com `externalRef` e exige a capability
- [x] `actionType` inválido é rejeitado 422
- [x] Replay com a mesma `Idempotency-Key` e mesmo payload retorna a ação já criada (sem duplicar linha)
- [x] Replay com a mesma `Idempotency-Key` e payload diferente é rejeitado 409
- [x] Sem a capability `connector.github.write` é rejeitado 403
- [x] Gate check passes: full
- [x] Test count: ≥7 tests pass

**Tests**: integration
**Gate**: full

**Commit**: `feat(hub): create controlled external actions with idempotent replay`

---

### T5: Status de CI com proof artifact automático

**What**: `POST /projects/:id/connectors/github/actions/:actionId/ci-status` (persiste `context`/`state`/`targetUrl` vinculado à ação; se a ação tem `experimentId`, cria um artifact `type='ci_status'` via `createArtifact` e anexa via `attachProofArtifact`, ambos do Slice 1/4 sem alteração).
**Where**: `apps/hub/src/evolution/github-connector.ts` (extensão)
**Depends on**: T4
**Reuses**: `createArtifact` (Slice 1), `attachProofArtifact` (Slice 4)
**Requirement**: GH-12, GH-13, GH-14

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [x] Status de CI persiste vinculado à ação
- [x] Status de CI para ação com `experimentId` cria e anexa um proof artifact ao experimento automaticamente
- [x] Status de CI para ação sem `experimentId` persiste sem tentar anexar nada (sem erro)
- [x] Status de CI para ação inexistente é rejeitado 404
- [x] Gate check passes: full
- [x] Test count: ≥5 tests pass

**Tests**: integration
**Gate**: full

**Commit**: `feat(hub): record ci status as automatic experiment proof`

---

### T6: Fechamento do slice — docs e review

**What**: Atualizar status do slice 5 no plano de execução para `implemented` e responder o checklist de review do slice em `design.md`.
**Where**: `docs/06-delivery/09-spec-driven-execution-plan.md`, `.specs/features/slice-5-reversible-external-action/design.md`
**Depends on**: T5
**Reuses**: mesmo padrão de fechamento dos slices anteriores
**Requirement**: — (AGENTS.md: manter documentação atualizada)

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [x] Plano de execução marca slice 5 como `implemented`
- [x] Checklist de review do slice respondido
- [x] Gate check passes: build (inclui `check_docs.py`)

**Tests**: none
**Gate**: build

**Commit**: `docs(delivery): close slice 5 reversible external action`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4

Phase 1:  T1
Phase 2:  T2 ------→ T3
Phase 3:  T4 ------→ T5
Phase 4:  T6

Transições de fase (fronteiras):
T1 → T2
T3 → T4
T5 → T6
```

Execution is strictly sequential - there is no intra-phase parallelism. Total tasks: 6 (≤ ~8) — execução inline, sem sub-agents de batch.

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1 | 1 migration + wiring de grants | ✅ Granular |
| T2 | 1 módulo (connect) | ✅ Granular |
| T3 | extensão do mesmo módulo (webhook) | ✅ Granular |
| T4 | extensão do mesmo módulo (create action) | ✅ Granular |
| T5 | extensão do mesmo módulo (ci-status) | ✅ Granular |
| T6 | atualização de docs | ✅ Granular |

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ----------------------- | -------------- | ------ |
| T1 | None | início Phase 1 | ✅ Match |
| T2 | T1 | Phase 2 após Phase 1 (T1 → T2) | ✅ Match |
| T3 | T2 | Phase 2 após T2 | ✅ Match |
| T4 | T3 | Phase 3 após Phase 2 (T3 → T4) | ✅ Match |
| T5 | T4 | Phase 3 após T4 | ✅ Match |
| T6 | T5 | Phase 4 após Phase 3 (T5 → T6) | ✅ Match |

Nenhuma dependência aponta para fase posterior. A cadeia é estritamente sequencial (T1→T2→T3→T4→T5→T6).

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | ---------------------------- | ----------------- | ---------- | ------ |
| T1 | Hub migration | integration | integration | ✅ OK |
| T2 | Hub evolution (github-connector) | integration | integration | ✅ OK |
| T3 | Hub evolution (github-connector) | integration | integration | ✅ OK |
| T4 | Hub evolution (github-connector) | integration | integration | ✅ OK |
| T5 | Hub evolution (github-connector) | integration | integration | ✅ OK |
| T6 | Docs | none | none | ✅ OK |
