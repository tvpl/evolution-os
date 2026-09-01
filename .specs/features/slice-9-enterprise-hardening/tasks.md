# Slice 9 — Enterprise Hardening Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/slice-9-enterprise-hardening/design.md`
**Status**: Approved

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec - confirm before Execute. Guidelines found: `AGENTS.md` + testes reais já existentes (Slices 0-8: integration contra Postgres real via `freshDb`). Reusado sem alteração.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------- | --------------------- | ----------------- | ------------ |
| Hub domain (policy: audit chain) | integration (Postgres real) | 1:1 com ACs da spec; todo edge case listado tem teste | `apps/hub/test/*.test.ts` | `pnpm test:int` |
| Hub domain (evolution: hardening) | integration (Postgres real) | 1:1 com ACs da spec; todo edge case listado tem teste | `apps/hub/test/*.test.ts` | `pnpm test:int` |
| Migration | none | - (build gate only) | - | build gate only |

## Gate Check Commands

> Reusa os comandos confirmados nos Slices 0-8.

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

### Phase 2: Node fleet e cadeia de auditoria

```
T2 → T3
```

### Phase 3: Export, retenção e desprovisionamento

```
T4 → T5 → T6
```

### Phase 4: Encerramento

```
T7
```

---

## Task Breakdown

### T1: Migration 010 — hardening + capability grant

**What**: `apps/hub/migrations/010_hardening.sql` adicionando `entry_hash`/`prev_hash` em `audit_log`, `redacted_at` em `evidence`, `deactivated_at` em `users`, e a nova tabela `org_retention_policies`; estender `seedDevGrants` com `admin.write` para os dois tenants dev.
**Where**: `apps/hub/migrations/010_hardening.sql`, `apps/hub/src/policy/policy.ts`
**Depends on**: None
**Reuses**: runner de migrations e padrão de grants dos Slices 0-8; `node_agents.revoked_at` e `evidence.content_excerpt` já existem (Slices 0/3), nenhuma migração para eles
**Requirement**: — (base para todo o resto do slice)

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [x] Migration aplica de zero e é idempotente
- [x] Novo grant `admin.write` aparece para os dois tenants dev
- [x] Gate check passes: full
- [x] Test count: ≥2 tests pass ✅ (2 tests, 415 total)

**Tests**: integration
**Gate**: full

**Commit**: `feat(hub): add enterprise hardening migration and capability grant`
**Status**: ✅ Done

---

### T2: Node fleet — listar e revogar

**What**: `POST /orgs/current/nodes/:nodeId/revoke` (seta `revoked_at`; idempotente se já revogado; 404 se Node inexistente/outro org); `GET /orgs/current/nodes` (lista a frota do org com status exato de `revoked_at`).
**Where**: `apps/hub/src/evolution/hardening.ts` (novo)
**Depends on**: T1
**Reuses**: `authenticateNode`/`revoked_at` (Slice 2) sem nenhuma alteração — este task só escreve a coluna que aquele código já lê; `requireScope`, `enforceCapability`
**Requirement**: HARD-01, HARD-02, HARD-03, HARD-04, HARD-05

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [x] Revogar um Node enrolado seta `revoked_at` e a autenticação subsequente daquele Node falha (reusando `authenticateNode` sem alteração)
- [x] Listar a frota retorna todo Node do org com status revogado exato
- [x] Revogar Node inexistente ou de outro org é rejeitado 404
- [x] Revogar um Node já revogado é idempotente (200, `revoked_at` inalterado)
- [x] Acessar lista/revoke cross-tenant é rejeitado 403
- [x] Gate check passes: full
- [x] Test count: ≥6 tests pass ✅ (7 tests, 422 total)

**Tests**: integration
**Gate**: full

**Commit**: `feat(hub): add Node fleet kill switch`
**Status**: ✅ Done

---

### T3: Cadeia de auditoria tamper-evident

**What**: Estender `recordAudit` (assinatura pública inalterada) para computar `entry_hash = sha256(canonicalJson({orgId, actor, action, resource, outcome, reason, correlationId, at, prevHash}))` encadeado ao último entry do MESMO org (`prevHash = "genesis"` para o primeiro entry de um org); nova função `verifyAuditChain(pool, orgId)` que percorre a cadeia e reporta `{valid, brokenAtId?}`.
**Where**: `apps/hub/src/policy/policy.ts` (extensão)
**Depends on**: T2
**Reuses**: `canonicalJson` (Slice 4); todos os ~20+ call sites existentes de `recordAudit` desde o Slice 0 permanecem intocados
**Requirement**: HARD-06, HARD-07, HARD-08, HARD-09

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [x] Um novo audit entry persiste `entry_hash` encadeado ao `entry_hash` do entry anterior do mesmo org
- [x] O primeiro entry de um org usa `prevHash = "genesis"`
- [x] Verificar a cadeia de um org sem alteração reporta `valid: true`
- [x] Alterar diretamente uma coluna de um entry no meio da cadeia (bypassando `recordAudit`) faz a verificação reportar `valid: false` com o `brokenAtId` exato
- [x] Um org com exatamente um entry é válido por construção (nada para comparar)
- [x] Gate check passes: full
- [x] Test count: ≥6 tests pass ✅ (6 tests, 428 total)

**Tests**: integration
**Gate**: full

**Commit**: `feat(hub): chain audit log entries into a tamper-evident hash chain`
**Status**: ✅ Done

---

### T4: Exportar auditoria do org

**What**: `GET /orgs/current/audit/export` — retorna todos os entries do org em ordem, junto com o veredito de integridade da cadeia (reusando `verifyAuditChain` sem alteração); org sem nenhum entry retorna lista vazia + cadeia válida (vacuamente).
**Where**: `apps/hub/src/evolution/hardening.ts` (extensão)
**Depends on**: T3
**Reuses**: `verifyAuditChain` (T3), `requireScope`
**Requirement**: HARD-10, HARD-11

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [x] Exportar a auditoria de um org com entries retorna todos em ordem + `chainValid: true`
- [x] Exportar de um org sem nenhum entry retorna lista vazia + cadeia válida, não erro
- [x] Exportar como um org nunca inclui entries de outro org (testado com dois orgs com entries distintos)
- [x] Gate check passes: full
- [x] Test count: ≥3 tests pass ✅ (2 test files, 3 assertions worth of coverage across ordering/isolation/empty, 430 total)

**Tests**: integration
**Gate**: full

**Commit**: `feat(hub): export org-wide audit trail with chain integrity verdict`
**Status**: ✅ Done

---

### T5: Política de retenção e varredura de evidência

**What**: `POST /orgs/current/retention` (body `{evidenceRetentionDays}`, inteiro positivo, senão 422); `POST /orgs/current/retention/sweep` (422 `retention_not_configured` sem política; redige — `content_excerpt = NULL`, `redacted_at = now()` — toda evidência do org mais antiga que a janela, sem deletar a linha, retorna a contagem exata; evidência dentro da janela permanece intocada).
**Where**: `apps/hub/src/evolution/hardening.ts` (extensão)
**Depends on**: T4
**Reuses**: `evidence.content_excerpt` (já nullable desde o Slice 3), `withTx`
**Requirement**: HARD-12, HARD-13, HARD-14, HARD-15, HARD-16, HARD-17

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [x] Configurar uma janela positiva persiste a política
- [x] Configurar uma janela não-positiva (zero, negativa, não-inteira) é rejeitado 422
- [x] Disparar sweep sem política configurada é rejeitado 422 `retention_not_configured`
- [x] Sweep com política configurada redige exatamente a evidência mais antiga que a janela (`content_excerpt` nulo, `redacted_at` setado, linha preservada) e retorna a contagem exata
- [x] Evidência dentro da janela permanece com `content_excerpt` e `redacted_at` intocados após o sweep
- [x] Uma decision/claim que referencia a evidência redigida continua legível e íntegra após o sweep
- [x] Sweep sem nenhuma evidência elegível retorna contagem `0`, não erro
- [x] Gate check passes: full
- [x] Test count: ≥8 tests pass

**Tests**: integration
**Gate**: full

**Commit**: `feat(hub): add evidence retention policy and redaction sweep`

---

### T6: Desprovisionar usuário

**What**: `POST /orgs/current/users/:userId/deactivate` (seta `deactivated_at`; idempotente se já desativado; 404 se usuário inexistente/outro org); `dev-login` ganha uma checagem adicional (`deactivated_at is null`) retornando 401 `identity_deactivated` (distinto de `unknown_identity`); `GET /orgs/current/users` lista usuários do org com status exato.
**Where**: `apps/hub/src/evolution/hardening.ts` (extensão), `apps/hub/src/server.ts` (uma condição a mais na query de `dev-login`)
**Depends on**: T5
**Reuses**: nenhuma outra rota nova de login — só a condição adicional na query existente
**Requirement**: HARD-18, HARD-19, HARD-20, HARD-21, HARD-22

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [x] Desativar um usuário seta `deactivated_at`
- [x] `dev-login` de um usuário desativado é rejeitado 401 `identity_deactivated`, distinto do 401 `unknown_identity` de um email desconhecido
- [x] Desativar usuário inexistente ou de outro org é rejeitado 404
- [x] Desativar um usuário já desativado é idempotente (200, `deactivated_at` inalterado)
- [x] Listar usuários retorna todo usuário do org com status ativo/desativado exato
- [x] Gate check passes: full
- [x] Test count: ≥7 tests pass

**Tests**: integration
**Gate**: full

**Commit**: `feat(hub): deprovision users and block dev-login for deactivated identities`

---

### T7: Fechamento do slice — docs e review

**What**: Atualizar status do slice 9 no plano de execução para `implemented` e responder o checklist de review do slice em `design.md`.
**Where**: `docs/06-delivery/09-spec-driven-execution-plan.md`, `.specs/features/slice-9-enterprise-hardening/design.md`
**Depends on**: T6
**Reuses**: mesmo padrão de fechamento dos slices anteriores
**Requirement**: — (AGENTS.md: manter documentação atualizada)

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [x] Plano de execução marca slice 9 como `implemented`
- [x] Checklist de review do slice respondido
- [x] Gate check passes: build (inclui `check_docs.py`)

**Tests**: none
**Gate**: build

**Commit**: `docs(delivery): close slice 9 enterprise hardening`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4

Phase 1:  T1
Phase 2:  T2 ------→ T3
Phase 3:  T4 ------→ T5 ------→ T6
Phase 4:  T7

Transições de fase (fronteiras):
T1 → T2
T3 → T4
T6 → T7
```

Execution is strictly sequential - there is no intra-phase parallelism. Total tasks: 7 (≤ ~8) — execução inline, sem sub-agents de batch.

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1 | 1 migration + wiring de grant | ✅ Granular |
| T2 | 1 módulo (Node fleet) | ✅ Granular |
| T3 | extensão de função existente (recordAudit) + 1 nova função (verify) | ✅ Granular |
| T4 | extensão do mesmo módulo (export, reusa T3) | ✅ Granular |
| T5 | extensão do mesmo módulo (retention + sweep) | ✅ Granular |
| T6 | extensão do mesmo módulo (deactivate) + 1 linha em rota existente (dev-login) | ✅ Granular |
| T7 | atualização de docs | ✅ Granular |

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ----------------------- | -------------- | ------ |
| T1 | None | início Phase 1 | ✅ Match |
| T2 | T1 | Phase 2 após Phase 1 (T1 → T2) | ✅ Match |
| T3 | T2 | Phase 2 após T2 | ✅ Match |
| T4 | T3 | Phase 3 após Phase 2 (T3 → T4) | ✅ Match |
| T5 | T4 | Phase 3 após T4 | ✅ Match |
| T6 | T5 | Phase 3 após T5 | ✅ Match |
| T7 | T6 | Phase 4 após Phase 3 (T6 → T7) | ✅ Match |

Nenhuma dependência aponta para fase posterior. A cadeia é estritamente sequencial (T1→T2→T3→T4→T5→T6→T7).

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | ---------------------------- | ----------------- | ---------- | ------ |
| T1 | Hub migration | integration | integration | ✅ OK |
| T2 | Hub evolution (hardening) | integration | integration | ✅ OK |
| T3 | Hub policy (audit chain) | integration | integration | ✅ OK |
| T4 | Hub evolution (hardening) | integration | integration | ✅ OK |
| T5 | Hub evolution (hardening) | integration | integration | ✅ OK |
| T6 | Hub evolution (hardening) + server | integration | integration | ✅ OK |
| T7 | Docs | none | none | ✅ OK |
