# Slice 2 — Local Repo Twin Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/slice-2-local-repo-twin/design.md`
**Status**: Approved

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec - confirm before Execute. Guidelines found: `AGENTS.md` + testes reais já existentes (Slices 0/1: integration contra Postgres real via `freshDb`, e2e Playwright, CLI via spawn assíncrono). Reusado sem alteração; uma exceção: o coletor de snapshot do Node é uma função pura (parsing local de `.git`/manifests, sem I/O de rede/banco) e ganha teste `unit` — infra real não é necessária para validar essa camada.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------- | --------------------- | ----------------- | ------------ |
| Node snapshot collector (pure) | unit | 1:1 com TWIN-01/02/04; casos de repo válido, sem git, sem manifests | `apps/node/test/*.test.ts` | `pnpm --filter @evolution-os/node test:unit` (novo script) |
| Hub domain (twin: snapshots, cartographer, candidates, diff) | integration (Postgres real) | 1:1 com ACs da spec; todo edge case listado tem teste | `apps/hub/test/*.test.ts` | `pnpm test:int` |
| Node CLI (comando `snapshot`) | integration | Happy path + falha sem enroll, mesmo padrão do CLI do Slice 0 | `apps/node/test/*.test.ts` | `pnpm test:int` |
| Migration / config / docs | none | - (build gate only) | - | build gate only |

## Gate Check Commands

> Reusa os comandos confirmados nos Slices 0/1, com um novo script `test:unit` em `apps/node` para a camada pura do coletor.

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | After tasks with unit tests only | `pnpm --filter @evolution-os/node test:unit` |
| Full | After tasks with integration/e2e tests | `bash scripts/dev-db.sh start && pnpm test:unit && pnpm test:int` |
| Build | After phase completion or config/docs-only tasks | `pnpm typecheck && bash scripts/dev-db.sh start && pnpm test && python3 scripts/check_docs.py` |

---

## Execution Plan

Phases are ordered and run sequentially - each phase completes before the next begins, and tasks within a phase execute in order.

### Phase 1: Fundação

```
T1 → T2
```

### Phase 2: Snapshot no Hub e Cartographer

```
T3
```

### Phase 3: Candidates e CLI

```
T4 → T5
```

### Phase 4: Diff e fechamento

```
T6 → T7
```

---

## Task Breakdown

### T1: Migration 003 — twin + capabilities

**What**: `apps/hub/migrations/003_twin.sql` criando `snapshots` e `candidates`; estender `seedDevGrants` com `twin.read` e `candidate.decide` para os dois tenants dev.
**Where**: `apps/hub/migrations/003_twin.sql`, `apps/hub/src/policy/policy.ts`
**Depends on**: None
**Reuses**: runner de migrations e padrão de grants dos Slices 0/1
**Requirement**: — (base para todo o resto do slice)

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [ ] Migration aplica de zero e é idempotente
- [ ] Novos grants aparecem para os dois tenants dev
- [ ] Gate check passes: full
- [ ] Test count: ≥2 tests pass

**Tests**: integration
**Gate**: full

**Commit**: `feat(hub): add twin migration and capability grants`

---

### T2: Coletor de snapshot no Node (função pura)

**What**: `collectSnapshot(repoPath)` lendo `.git/HEAD`/refs (parse manual, sem shell out a `git`) para branch/commit sha, detectando manifests conhecidos (`package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`, `pom.xml`, ignorando `node_modules`/`.git`/`dist`) e montando histograma de linguagens por extensão; retorna erro estruturado quando `repoPath` não é um repositório Git.
**Where**: `apps/node/src/snapshot.ts`
**Depends on**: T1
**Reuses**: nenhuma dependência externa nova
**Requirement**: TWIN-01, TWIN-02, TWIN-04

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [ ] Repo Git com `package.json` produz branch/sha/manifest/linguagens corretos
- [ ] Payload nunca contém conteúdo de arquivo, só nomes/contagens/hashes
- [ ] Diretório sem `.git` retorna erro estruturado sem lançar exceção não tratada
- [ ] Repo sem nenhum manifest reconhecido retorna lista vazia de manifests (sucesso, não erro)
- [ ] Gate check passes: `pnpm --filter @evolution-os/node test:unit`
- [ ] Test count: ≥6 tests pass

**Tests**: unit
**Gate**: quick

**Commit**: `feat(node): add deterministic snapshot collector`

---

### T3: Endpoints de snapshot + Cartographer determinístico

**What**: `POST /projects/:id/snapshots` (auth por node token, mesmo padrão de `POST /nodes/:id/artifacts`) grava o snapshot com `authority='observed'` e, na MESMA transação, roda o Cartographer: >1 manifest propõe 1 `component` + 1 `contains` por manifest (dedup por `location` comparando `payload`, sem duplicar pending nem reproposto rejeitado sem mudança); `GET /projects/:id/snapshots` lista mais-recente-primeiro.
**Where**: `apps/hub/src/twin/snapshots.ts`, `apps/hub/src/twin/cartographer.ts`
**Depends on**: T2
**Reuses**: `withTx`, padrão de auth por node token do Slice 0
**Requirement**: TWIN-01, TWIN-03, TWIN-05, TWIN-06, TWIN-08, TWIN-09, TWIN-13

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [ ] Snapshot com 1 manifest coerente com o tipo declarado não gera candidate
- [ ] Snapshot com 3 manifests gera exatamente 3 candidates `pending` (component+contains) com `authority=inferred`
- [ ] Reenviar o mesmo snapshot não duplica candidates pendentes na mesma location
- [ ] Snapshot concorrente para o mesmo projeto não perde dados (duas versões distintas)
- [ ] Listagem de snapshots retorna mais-recente-primeiro
- [ ] Gate check passes: full
- [ ] Test count: ≥8 tests pass

**Tests**: integration
**Gate**: full

**Commit**: `feat(hub): add snapshot ingestion with deterministic cartographer`

---

### T4: Candidates — listagem, confirmação e rejeição

**What**: `GET /projects/:id/candidates`; `POST .../candidates/:candidateId/confirm` (promove a `declared`, grava como `artifacts` `type='component'`, preserva o registro inferred original); `POST .../candidates/:candidateId/reject` (marca `rejected` com reason opcional, nunca apaga); ação em candidate não-`pending` retorna 409 sem mudar status.
**Where**: `apps/hub/src/twin/candidates.ts`
**Depends on**: T3
**Reuses**: `requireOwnedProject`, `enforceCapability` (capability `candidate.decide`)
**Requirement**: TWIN-07, TWIN-10, TWIN-11, TWIN-12

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [ ] Confirmar cria artifact `type='component'` `declared` preservando o candidate original inalterado
- [ ] Rejeitar marca `rejected` com reason, registro preservado (nunca deletado)
- [ ] Confirmar/rejeitar candidate já decidido retorna 409 sem alterar nada
- [ ] Listagem cross-tenant é negada
- [ ] Gate check passes: full
- [ ] Test count: ≥7 tests pass

**Tests**: integration
**Gate**: full

**Commit**: `feat(hub): add candidate confirmation and rejection`

---

### T5: Comando `evo snapshot`

**What**: `evo snapshot [--path]` chama `collectSnapshot` local e envia via `POST /projects/:id/snapshots` autenticado pelo node token já persistido pelo `evo enroll` (Slice 0); falha limpa (exit != 0) sem enviar nada quando não enrolado ou fora de repo Git.
**Where**: `apps/node/src/cli.ts`
**Depends on**: T4
**Reuses**: `loadConfig`/`hubFetch` do Slice 0
**Requirement**: TWIN-01, TWIN-04

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [ ] `evo snapshot` num repo Git enrolado sincroniza com sucesso e imprime o snapshot id
- [ ] `evo snapshot` fora de repo Git falha sem chamar o Hub (mesma técnica de spawn assíncrono do Slice 0 para não deadlockar o Hub in-process do teste)
- [ ] `evo snapshot` sem enroll falha com mensagem clara
- [ ] Gate check passes: full
- [ ] Test count: ≥3 tests pass

**Tests**: integration
**Gate**: full

**Commit**: `feat(node): add evo snapshot command`

---

### T6: Diff declarado vs. observado

**What**: `GET /projects/:id/diff` compara `type`/manifests declarados do projeto com o snapshot mais recente e reporta divergências (mismatches) citando a versão do snapshot; sem snapshot algum retorna `observed: null` em vez de erro.
**Where**: `apps/hub/src/twin/diff.ts`
**Depends on**: T5
**Reuses**: twin/snapshots (leitura do último snapshot)
**Requirement**: TWIN-14, TWIN-15, TWIN-16

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [ ] Projeto `type=service` com snapshot de 3 manifests reporta a divergência
- [ ] Snapshot consistente com o declarado retorna lista vazia de mismatches
- [ ] Projeto sem snapshot retorna `observed: null` sem erro
- [ ] Resposta cita a versão do snapshot usado
- [ ] Gate check passes: full
- [ ] Test count: ≥4 tests pass

**Tests**: integration
**Gate**: full

**Commit**: `feat(hub): add declared-vs-observed diff endpoint`

---

### T7: Fechamento do slice — docs e review

**What**: Atualizar status do slice 2 no plano de execução para `implemented` e responder o checklist de review do slice em `design.md`.
**Where**: `docs/06-delivery/09-spec-driven-execution-plan.md`, `.specs/features/slice-2-local-repo-twin/design.md`
**Depends on**: T6
**Reuses**: mesmo padrão de fechamento dos Slices 0/1
**Requirement**: — (AGENTS.md: manter documentação atualizada)

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [ ] Plano de execução marca slice 2 como `implemented`
- [ ] Checklist de review do slice respondido
- [ ] Gate check passes: build (inclui `check_docs.py`)

**Tests**: none
**Gate**: build

**Commit**: `docs(delivery): close slice 2 local repo twin`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4

Phase 1:  T1 ------→ T2
Phase 2:  T3
Phase 3:  T4 ------→ T5
Phase 4:  T6 ------→ T7

Transições de fase (fronteiras):
T2 → T3
T3 → T4
T5 → T6
```

Execution is strictly sequential - there is no intra-phase parallelism.

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1 | 1 migration + wiring de grants | ✅ Granular |
| T2 | 1 função pura coesa | ✅ Granular |
| T3 | 1 fluxo (snapshot + cartographer, disparados juntos por design) | ✅ Granular |
| T4 | 1 módulo (candidates: list+confirm+reject) | ✅ Granular |
| T5 | 1 comando CLI | ✅ Granular |
| T6 | 1 endpoint | ✅ Granular |
| T7 | atualização de docs | ✅ Granular |

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ----------------------- | -------------- | ------ |
| T1 | None | início Phase 1 | ✅ Match |
| T2 | T1 | Phase 1 após T1 | ✅ Match |
| T3 | T2 | Phase 2 após Phase 1 (T2 → T3) | ✅ Match |
| T4 | T3 | Phase 3 após Phase 2 (T3 → T4) | ✅ Match |
| T5 | T4 | Phase 3 após T4 | ✅ Match |
| T6 | T5 | Phase 4 após Phase 3 (T5 → T6) | ✅ Match |
| T7 | T6 | Phase 4 após T6 | ✅ Match |

Nenhuma dependência aponta para fase posterior.

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | ---------------------------- | ----------------- | ---------- | ------ |
| T1 | Hub migration | integration | integration | ✅ OK |
| T2 | Node snapshot collector | unit | unit | ✅ OK |
| T3 | Hub twin | integration | integration | ✅ OK |
| T4 | Hub twin | integration | integration | ✅ OK |
| T5 | Node CLI | integration | integration | ✅ OK |
| T6 | Hub twin | integration | integration | ✅ OK |
| T7 | Docs | none | none | ✅ OK |
