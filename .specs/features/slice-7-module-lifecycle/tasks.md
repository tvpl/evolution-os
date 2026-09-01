# Slice 7 — Module Lifecycle Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/slice-7-module-lifecycle/design.md`
**Status**: Approved

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec - confirm before Execute. Guidelines found: `AGENTS.md` + testes reais já existentes (Slices 0-6: integration contra Postgres real via `freshDb`). Reusado sem alteração.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------- | --------------------- | ----------------- | ------------ |
| Hub domain (evolution: modules) | integration (Postgres real) | 1:1 com ACs da spec; todo edge case listado tem teste | `apps/hub/test/*.test.ts` | `pnpm test:int` |
| Digest/signature/SBOM (funções puras/crypto) | integration (co-locado, sem chamada a DB) | Função pura testada diretamente, mesmo padrão de `evaluateExperiment` (Slice 4) e `runEvalCase` (Slice 6) | `apps/hub/test/*.test.ts` | `pnpm test:int` |
| Migration | none | - (build gate only) | - | build gate only |

## Gate Check Commands

> Reusa os comandos confirmados nos Slices 0-6.

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

### Phase 2: Publicar e ler o registry privado

```
T2 → T3
```

### Phase 3: Instalar com policy check e lockfile

```
T4
```

### Phase 4: Ciclo de vida — atualizar, quarentena, rollback, desinstalar

```
T5 → T6 → T7
```

### Phase 5: Encerramento

```
T8
```

---

## Task Breakdown

### T1: Migration 008 — modules + capability grant

**What**: `apps/hub/migrations/008_modules.sql` criando `modules`, `module_publisher_keys`, `module_versions`, `module_installations`; estender `seedDevGrants` com `module.write` para os dois tenants dev.
**Where**: `apps/hub/migrations/008_modules.sql`, `apps/hub/src/policy/policy.ts`
**Depends on**: None
**Reuses**: runner de migrations e padrão de grants dos Slices 0-6
**Requirement**: — (base para todo o resto do slice)

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [x] Migration aplica de zero e é idempotente
- [x] Novo grant `module.write` aparece para os dois tenants dev
- [x] Gate check passes: full
- [x] Test count: ≥2 tests pass

**Tests**: integration
**Gate**: full

**Commit**: `feat(hub): add module lifecycle migration and capability grant`

---

### T2: Publicar um manifest de módulo assinado

**What**: `POST /orgs/current/modules` — valida o manifest (id/version/publisher/components não vazios, tipos de component no set fechado, `version` SemVer, IDs de component únicos), computa o digest canônico (`canonicalJson` do Slice 4 + sha256), gera (na primeira publicação do org) ou reusa o par de chaves Ed25519 do org, assina o digest, gera o SBOM determinístico e o provenance, persiste como nova `module_versions`. Republicar a mesma `(id, version)` com o mesmo digest é replay idempotente; com digest diferente é 409.
**Where**: `apps/hub/src/evolution/modules.ts`
**Depends on**: T1
**Reuses**: `canonicalJson` (`platform/canonical-json.ts`, Slice 4), `withTx`
**Requirement**: MODL-01, MODL-02, MODL-03, MODL-04

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [ ] Publicar um manifest válido persiste a versão e retorna `{moduleId, version, digest, signature, sbom}`
- [ ] Republicar a mesma versão com o mesmo manifest retorna o mesmo digest sem criar uma segunda linha
- [ ] Republicar a mesma versão com um manifest diferente é rejeitado 409
- [ ] Manifest sem `id`/`version`/`publisher`, sem components, com tipo de component inválido, `version` não-SemVer, ou IDs de component duplicados é rejeitado 422 (todos os casos cobertos)
- [ ] Gate check passes: full
- [ ] Test count: ≥8 tests pass

**Tests**: integration
**Gate**: full

**Commit**: `feat(hub): publish signed module manifests with SBOM`

---

### T3: Ler versão com verificação de assinatura; listar o registry

**What**: `GET /orgs/current/modules/:moduleId/versions/:version` — retorna manifest/digest/signature/sbom/provenance e `signatureValid` (recomputa o digest e reverifica a assinatura contra a chave pública do org); `GET /orgs/current/modules` — lista módulos do org com a última versão publicada (digest + `signatureValid`).
**Where**: `apps/hub/src/evolution/modules.ts` (extensão)
**Depends on**: T2
**Reuses**: mesma lógica de verificação usada pelo install (T4, extraída como função pura reusável)
**Requirement**: MODL-05, MODL-06, MODL-20

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [ ] Ler uma versão recém-publicada retorna `signatureValid: true`
- [ ] Adulterar a linha persistida do manifest (fora do fluxo normal) e ler de novo retorna `signatureValid: false`, sem lançar erro
- [ ] Listar os módulos do org retorna o módulo publicado com sua última versão
- [ ] Ler/listar módulo desconhecido ou de outro org é rejeitado 404/nunca vaza (rota é org-scoped por `scope.orgId`, nunca por parâmetro de path)
- [ ] Gate check passes: full
- [ ] Test count: ≥5 tests pass

**Tests**: integration
**Gate**: full

**Commit**: `feat(hub): verify module signatures on read and list the registry`

---

### T4: Instalar um módulo com policy check e lockfile

**What**: `POST /projects/:id/modules/:moduleId/install` (body `{version}`) — reverifica a assinatura da versão; checa que toda capability declarada tem grant no org (`checkCapability`, Slice 0); se tudo ok, insere uma linha `module_installations` (`seq=1`, `status='active'`, `action='installed'`). `GET /projects/:id/modules/lockfile` — retorna a última linha `active` por `(project_id, module_id)`.
**Where**: `apps/hub/src/evolution/modules.ts` (extensão)
**Depends on**: T3
**Reuses**: `requireOwnedProject`, `checkCapability`, verificação de assinatura de T3
**Requirement**: MODL-07, MODL-08, MODL-09, MODL-10, MODL-11

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [ ] Instalar com todas as capabilities já concedidas persiste a linha `active` e aparece no lockfile
- [ ] Instalar com alguma capability sem grant é rejeitado 422 listando as capabilities faltando, sem persistir nada
- [ ] Instalar módulo ou versão desconhecidos é rejeitado 404
- [ ] Instalar uma versão cuja assinatura não reverifica é rejeitado 409, sem persistir nada (simulado via adulteração direta da linha, mesmo padrão de T3)
- [ ] Reinstalar a mesma versão já `active` é um no-op idempotente (sem nova linha de lock)
- [ ] Módulo sem nenhuma capability instala sem exigir grant
- [ ] Gate check passes: full
- [ ] Test count: ≥8 tests pass

**Tests**: integration
**Gate**: full

**Commit**: `feat(hub): install modules with capability policy check and lockfile`

---

### T5: Atualizar com diff de permissão bloqueante

**What**: `POST /projects/:id/modules/:moduleId/update` (body `{version}`) — computa o diff entre as capabilities da versão nova e as da instalação `active` atual; se alguma capability nova não tem grant, rejeita 422 retornando `{added, removed}` e não altera o lock; caso contrário, reverifica assinatura, insere nova linha (`seq+1`, `action='updated'`) e retorna o diff.
**Where**: `apps/hub/src/evolution/modules.ts` (extensão)
**Depends on**: T4
**Reuses**: mesma checagem de capability de T4, mesmo padrão append-only
**Requirement**: MODL-12, MODL-13, MODL-14

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [ ] Atualizar para uma versão cujas capabilities já estão todas concedidas persiste a nova linha e retorna o diff (`added`/`removed`)
- [ ] Atualizar para uma versão com capability nova sem grant é rejeitado 422 com `added` listando exatamente essa capability, lockfile permanece na versão anterior
- [ ] Conceder a capability faltando e repetir a mesma atualização agora sucede
- [ ] Gate check passes: full
- [ ] Test count: ≥5 tests pass

**Tests**: integration
**Gate**: full

**Commit**: `feat(hub): compute blocking permission diff on module update`

---

### T6: Quarentena e rollback

**What**: `POST /projects/:id/modules/:moduleId/quarantine` — insere linha `status='quarantined'`, `action='quarantined'`; rejeita se a instalação atual já não está `active`. `POST /projects/:id/modules/:moduleId/rollback` (body `{version}`) — só aceita uma `version` que já apareça no histórico de lock daquele projeto para esse módulo; insere linha `status='active'`, `action='rolled_back'`.
**Where**: `apps/hub/src/evolution/modules.ts` (extensão)
**Depends on**: T5
**Reuses**: mesmo padrão append-only, mesma leitura de histórico
**Requirement**: MODL-15, MODL-16, MODL-17

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [ ] Colocar uma instalação `active` em quarentena muda seu status para `quarantined`
- [ ] Atualizar uma instalação `quarantined` é rejeitado 409
- [ ] Rollback para uma versão anterior já provada pelo histórico do projeto reverte o lock e volta o status para `active`, preservando todas as linhas de histórico anteriores
- [ ] Rollback para uma versão nunca instalada por aquele projeto é rejeitado 409
- [ ] Gate check passes: full
- [ ] Test count: ≥6 tests pass

**Tests**: integration
**Gate**: full

**Commit**: `feat(hub): add module quarantine and rollback to proven history`

---

### T7: Desinstalar preservando histórico

**What**: `POST /projects/:id/modules/:moduleId/uninstall` — insere linha `status='uninstalled'`, `action='uninstalled'`; nenhuma linha anterior é apagada. Atualizar/rollback de uma instalação `uninstalled` é rejeitado 409.
**Where**: `apps/hub/src/evolution/modules.ts` (extensão)
**Depends on**: T6
**Reuses**: mesmo padrão append-only
**Requirement**: MODL-18, MODL-19

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [ ] Desinstalar uma instalação `active` ou `quarantined` muda seu status para `uninstalled` e o módulo some do lockfile (leitura filtra por `active`)
- [ ] Todo o histórico de lock daquele módulo/projeto continua consultável após a desinstalação (nenhuma linha apagada)
- [ ] Atualizar ou fazer rollback de uma instalação `uninstalled` é rejeitado 409
- [ ] Toda rota deste slice é negada cross-tenant (403)
- [ ] Gate check passes: full
- [ ] Test count: ≥6 tests pass

**Tests**: integration
**Gate**: full

**Commit**: `feat(hub): uninstall modules while preserving lock history`

---

### T8: Fechamento do slice — docs e review

**What**: Atualizar status do slice 7 no plano de execução para `implemented` e responder o checklist de review do slice em `design.md`.
**Where**: `docs/06-delivery/09-spec-driven-execution-plan.md`, `.specs/features/slice-7-module-lifecycle/design.md`
**Depends on**: T7
**Reuses**: mesmo padrão de fechamento dos slices anteriores
**Requirement**: — (AGENTS.md: manter documentação atualizada)

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [ ] Plano de execução marca slice 7 como `implemented`
- [ ] Checklist de review do slice respondido
- [ ] Gate check passes: build (inclui `check_docs.py`)

**Tests**: none
**Gate**: build

**Commit**: `docs(delivery): close slice 7 module lifecycle`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5

Phase 1:  T1
Phase 2:  T2 ------→ T3
Phase 3:  T4
Phase 4:  T5 ------→ T6 ------→ T7
Phase 5:  T8

Transições de fase (fronteiras):
T1 → T2
T3 → T4
T4 → T5
T7 → T8
```

Execution is strictly sequential - there is no intra-phase parallelism. Total tasks: 8 (≤ ~8) — execução inline, sem sub-agents de batch.

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1 | 1 migration + wiring de grant | ✅ Granular |
| T2 | 1 endpoint (publish) | ✅ Granular |
| T3 | 2 endpoints de leitura, mesmo módulo | ✅ Granular |
| T4 | 2 endpoints (install + lockfile), mesmo módulo | ✅ Granular |
| T5 | 1 endpoint (update) | ✅ Granular |
| T6 | 2 endpoints (quarantine + rollback), mesmo módulo | ✅ Granular |
| T7 | 1 endpoint (uninstall) | ✅ Granular |
| T8 | atualização de docs | ✅ Granular |

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ----------------------- | -------------- | ------ |
| T1 | None | início Phase 1 | ✅ Match |
| T2 | T1 | Phase 2 após Phase 1 (T1 → T2) | ✅ Match |
| T3 | T2 | Phase 2 após T2 | ✅ Match |
| T4 | T3 | Phase 3 após Phase 2 (T3 → T4) | ✅ Match |
| T5 | T4 | Phase 4 após Phase 3 (T4 → T5) | ✅ Match |
| T6 | T5 | Phase 4 após T5 | ✅ Match |
| T7 | T6 | Phase 4 após T6 | ✅ Match |
| T8 | T7 | Phase 5 após Phase 4 (T7 → T8) | ✅ Match |

Nenhuma dependência aponta para fase posterior. A cadeia é estritamente sequencial (T1→T2→T3→T4→T5→T6→T7→T8).

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | ---------------------------- | ----------------- | ---------- | ------ |
| T1 | Hub migration | integration | integration | ✅ OK |
| T2 | Hub evolution (modules) | integration | integration | ✅ OK |
| T3 | Hub evolution (modules) | integration | integration | ✅ OK |
| T4 | Hub evolution (modules) | integration | integration | ✅ OK |
| T5 | Hub evolution (modules) | integration | integration | ✅ OK |
| T6 | Hub evolution (modules) | integration | integration | ✅ OK |
| T7 | Hub evolution (modules) | integration | integration | ✅ OK |
| T8 | Docs | none | none | ✅ OK |
