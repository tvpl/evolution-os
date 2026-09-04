# Slice 2 — Local Repo Twin Specification

## Problem Statement

Até o Slice 1, um projeto só tem o que foi declarado manualmente no manifest — nenhum fato vem do ambiente real. Este slice dá ao Evolution Node capacidade de observar um repositório local (Git, manifests de pacote, estrutura de arquivos), produzir um snapshot determinístico, propor entidades/relações candidatas a partir desse snapshot, e expor onde o declarado diverge do observado — o primeiro Twin técnico, ainda somente leitura ([sequência de construção](../../../docs/06-delivery/05-build-sequence.md), Slice 2; milestone M1 do [roadmap](../../../docs/06-delivery/01-mvp-and-roadmap.md)).

**Fonte de verdade**: [PRD-004](../../../docs/01-product/PRD-004-evolution-node.md) (NODE-FR-001..018), [Control Plane e Node](../../../docs/02-architecture/02-control-plane-and-node.md), [modelo de conhecimento](../../../docs/02-architecture/03-knowledge-model.md) (quatro estados de verdade), épicos EP-030/EP-012/EP-022, ADR-001, ADR-015.

## Goals

- [x] `evo snapshot` produz um inventário determinístico do repositório local (Git + manifests de pacote + linguagens) sem enviar código-fonte ao Hub.
- [x] O Hub armazena snapshots versionados ligados a um projeto, com fatos marcados `authority='observed'`.
- [x] Um proposer determinístico ("Cartographer") sugere entidades/relações candidatas a partir do snapshot mais recente, marcadas `authority='inferred'`.
- [x] Um humano confirma ou rejeita cada proposta; confirmação promove o fato, rejeição é preservada (nunca apagada).
- [x] Divergências entre declarado (manifest) e observado (snapshot) são visíveis sem sobrescrever o declarado.

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Cartographer como agente LLM real (chamada a model provider) | EP-040/EP-041 (agent registry, model router) e ADR-013 (model provider abstraction) ainda não existem; este slice implementa a metade determinística de EP-022 ("Deterministic discovery"), a metade "agent proposal" fica para quando o runtime agentic existir (Slice 3+) |
| Sensores além de Git/manifests de pacote (CI, IaC, telemetria) | PRD-004 §3 lista vários; este slice prova o padrão com o sensor mais simples e universal (Git + manifest), os demais entram por extensão do mesmo padrão em slices futuros |
| Sincronização Hub↔Node em modo `derived-only`/`artifact-approved`/`full-sync` | Este slice implementa apenas `metadata-only` (NODE-FR-009) — os outros modos exigem policy de classificação de conteúdo que ainda não existe |
| Standalone-to-managed (projeto local vira managed depois) | Control Plane/Node §8; fora de escopo — este slice assume que o projeto já foi registrado (Slice 1) antes do snapshot |
| Módulos instaláveis, sandbox de execução | EP-032/EP-050; nenhum código de terceiros roda neste slice |
| Finding/proposal formal (Evolution Engine) | Slice 3; a "divergência declarado vs. observado" deste slice é uma visão simples, não o modelo completo de Finding com scoring |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | --------------- | --------- | ---------- |
| Escopo do sensor determinístico | Git (remote/branch/HEAD sha) + manifests de pacote conhecidos (`package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`, `pom.xml`) + histograma de linguagens por extensão de arquivo | Cobre o caso universal (qualquer repo tem Git) e os ecossistemas mais comuns sem exigir parsers específicos de linguagem | y |
| Cartographer é determinístico, não um agente LLM | Regras fixas: cada manifest de pacote encontrado numa subpasta vira uma entidade "component" candidata; múltiplos manifests no mesmo repo viram relação `contains` candidata do projeto para cada subpasta | Ver Out of Scope; a parte agent-based de EP-022 não tem infra ainda | y |
| Sync mode deste slice | `metadata-only` (NODE-FR-009): apenas contagens, hashes, nomes declarados nos manifests e topologia — nunca conteúdo de arquivo | ADR-015 (código local por padrão); é o modo mais simples e seguro para o primeiro sensor | y |
| Onde vive o estado do Node entre execuções | Arquivo local `.evolution/node.json` (reusa o padrão de config já criado no Slice 0 para `evo`) somado ao histórico de snapshots no Hub — o Node não mantém banco próprio neste slice | Evita introduzir SQLite/storage local antes de um requisito real de spool offline (NODE-FR-007, fora de escopo aqui) | y |
| Confirmação de proposta é por proposta individual (não em lote) | `POST /projects/:id/candidates/:candidateId/confirm` ou `/reject` | Corresponde a "Human confirmation" do build-sequence sem inventar UX de lote não pedida | n |
| `evo snapshot` identifica o projeto alvo | Flag explícita `--project <id>`, não auto-matching por remote/manifest | O endpoint já é project-scoped (`POST /projects/:id/snapshots`); auto-matching exigiria um lookup Hub-side por `spec.sources` que não está no design.md deste slice — descoberto e simplificado durante o Execute (SPEC_DEVIATION em `apps/node/src/cli.ts`) | y |

**Open questions:** none - all resolved or logged above.

---

## User Stories

### P1: Snapshot determinístico do repositório ⭐ MVP

**User Story**: As a mantenedor de um repositório já registrado, I want rodar `evo snapshot` e ver um inventário do meu projeto no Hub so that o Twin passe a refletir o que existe de fato, não só o que foi declarado.

**Why P1**: É o "primeiro digital twin técnico" citado no build-sequence — sem ele, nada mais do slice tem dado para trabalhar.

**Acceptance Criteria**:

1. WHEN `evo snapshot --project <id>` runs inside a Git repository for an enrolled node THEN the CLI SHALL collect the current branch, HEAD commit sha, detected package manifests (name and ecosystem) and a file-extension language histogram, and SHALL sync it to the Hub as a new snapshot of the named project.
2. The snapshot payload SHALL NOT include file contents or source code — only counts, names declared in manifests, and hashes (NODE-FR-009 metadata-only).
3. WHEN the Hub receives a snapshot THEN it SHALL persist it as a new version linked to the project with `authority='observed'` and an `observedAt` timestamp, preserving every prior snapshot.
4. IF `evo snapshot` runs outside a Git repository THEN the CLI SHALL fail with a clear error and SHALL NOT sync anything.
5. WHEN a client lists a project's snapshots THEN the system SHALL return them ordered most-recent-first with their observed facts.

**Independent Test**: Rodar `evo snapshot` num repo com `package.json`; conferir no Hub um snapshot com branch/sha/manifest/linguagens e `authority=observed`; rodar fora de um repo Git e conferir falha sem sync.

---

### P2: Propostas do Cartographer determinístico

**User Story**: As a mantenedor de um monorepo, I want que o sistema proponha as sub-partes do meu repositório como entidades candidatas so that eu não precise declarar manualmente cada componente.

**Why P2**: Valor real (reduz trabalho manual), mas o Twin já é útil só com o snapshot puro (P1).

**Acceptance Criteria**:

1. WHEN a new snapshot contains more than one package manifest THEN the Cartographer SHALL propose one candidate `component` entity per manifest location and one candidate `contains` relation from the project to each, marked `authority='inferred'`.
2. WHEN a client lists a project's candidates THEN the system SHALL return each with its proposed entity/relation, the snapshot it was derived from, and a status of `pending`.
3. IF a snapshot contains only one package manifest matching the project's own declared type THEN the Cartographer SHALL propose no candidates (nothing to reconcile).
4. WHEN the same candidate would be proposed again by a later snapshot THEN the system SHALL NOT create a duplicate pending candidate for the same location.

**Independent Test**: Sincronizar um snapshot com 3 manifests de pacote; listar candidates e ver 3 propostas `pending` com `authority=inferred`; sincronizar de novo sem mudança e conferir que não duplica.

---

### P2: Confirmação humana

**User Story**: As a responsável pelo projeto, I want confirmar ou rejeitar cada proposta do Cartographer so that o Twin só ganhe fatos declarados com meu aval, sem perder o que foi rejeitado (regra de `AGENTS.md`: preservar decisões rejeitadas).

**Why P2**: É o requisito central de "Human confirmation" do build-sequence — sem ele, propostas inferidas nunca viram conhecimento confiável.

**Acceptance Criteria**:

1. WHEN a client confirms a candidate THEN the system SHALL mark it `confirmed`, SHALL persist the resulting entity/relation with `authority='declared'`, and SHALL preserve the original inferred record unchanged.
2. WHEN a client rejects a candidate THEN the system SHALL mark it `rejected` with an optional reason and SHALL NOT delete the candidate record.
3. IF a client attempts to confirm or reject a candidate that is not `pending` THEN the system SHALL reject the request with 409 without changing its status.
4. IF a rejected candidate would be proposed again by a later snapshot at the same location THEN the system SHALL NOT recreate a pending candidate for it without new evidence (a different manifest name/ecosystem at that location counts as new evidence).

**Independent Test**: Confirmar uma proposta e conferir status `confirmed` + entidade nova com `authority=declared`; rejeitar outra e conferir status `rejected` preservado; tentar confirmar a já confirmada e receber 409; sincronizar de novo e conferir que a rejeitada não reaparece pending.

---

### P3: Diff declarado vs. observado

**User Story**: As a stakeholder revisando um projeto, I want ver onde o declarado diverge do observado so that eu saiba quando a arquitetura documentada já não bate com a realidade (exemplo do modelo de conhecimento: drift).

**Why P3**: Valor de visibilidade real, mas o Twin já entrega valor sem ele (P1/P2 bastam para a demo central do slice).

**Acceptance Criteria**:

1. WHEN a client requests a project's declared-vs-observed diff THEN the system SHALL compare the manifest's declared `type`/`name` against the latest snapshot's detected manifests and SHALL report each mismatch without altering the declared manifest.
2. IF the latest snapshot has no mismatches with the declared manifest THEN the diff SHALL report an empty mismatch list, not an error.
3. The diff response SHALL cite which snapshot version it was computed against.

**Independent Test**: Registrar um projeto `type=service` cujo manifest observado é um monorepo com 3 componentes; pedir o diff e ver a divergência reportada; sincronizar um snapshot consistente e ver lista vazia.

---

## Edge Cases

- IF a project has no snapshot yet THEN the declared-vs-observed diff SHALL report no observed data rather than erroring.
- IF `evo snapshot` is run for a node that is not enrolled THEN it SHALL fail the same way `evo sync` does in the Slice 0 CLI (401, no data sent).
- WHEN two snapshots are synced concurrently for the same project THEN both SHALL be stored as distinct versions without data loss.
- IF a candidate's snapshot is superseded before confirmation THEN the candidate SHALL remain confirmable/rejectable referencing its original snapshot (candidates are not invalidated by newer snapshots).
- IF the repository has zero recognized package manifests THEN the snapshot SHALL still sync successfully with an empty manifest list (a repo can be legitimately manifest-less, e.g. docs-only).

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| TWIN-01 | P1: Snapshot — coleta determinística e sync (NODE-FR-001/009) | Execute | Verified |
| TWIN-02 | P1: Snapshot — sem conteúdo de arquivo (NODE-FR-009, ADR-015) | Execute | Verified |
| TWIN-03 | P1: Snapshot — persistência versionada com authority observed | Execute | Verified |
| TWIN-04 | P1: Snapshot — falha fora de repo Git sem enviar nada | Execute | Verified |
| TWIN-05 | P1: Snapshot — listagem mais-recente-primeiro | Execute | Verified |
| TWIN-06 | P2: Cartographer — proposta de component/contains por manifest (EP-022) | Execute | Verified |
| TWIN-07 | P2: Cartographer — listagem de candidates com status pending | Execute | Verified |
| TWIN-08 | P2: Cartographer — nenhuma proposta quando não há o que reconciliar | Execute | Verified |
| TWIN-09 | P2: Cartographer — sem proposta duplicada pendente | Execute | Verified |
| TWIN-10 | P2: Confirmação — confirmar promove a declared preservando o inferred | Execute | Verified |
| TWIN-11 | P2: Confirmação — rejeitar preserva o registro (guard AGENTS.md) | Execute | Verified |
| TWIN-12 | P2: Confirmação — ação em candidate não-pending é 409 | Execute | Verified |
| TWIN-13 | P2: Confirmação — rejeitada não reaparece sem evidência nova | Execute | Verified |
| TWIN-14 | P3: Diff — divergência declarado vs. observado (knowledge model §4) | Execute | Verified |
| TWIN-15 | P3: Diff — sem divergência retorna lista vazia | Execute | Verified |
| TWIN-16 | P3: Diff — cita a versão do snapshot usado | Execute | Verified |

**ID format:** `TWIN-NN`

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

**Coverage:** 16 total, 0 mapped to tasks (mapeado na fase Tasks), 0 unmapped — cada ID cita sua âncora nas docs-fonte.

---

## Success Criteria

- [x] `validate_spec.py` sai 0 para esta spec.
- [x] `evo snapshot` num repo real produz um snapshot visível no Hub sem enviar código.
- [x] Um monorepo com 3 manifests gera 3 propostas confirmáveis/rejeitáveis, e a confirmação vira fato declarado sem apagar o inferido.
- [x] Uma proposta rejeitada não reaparece pending sem evidência nova.
- [x] O diff declarado/observado mostra divergência real sem alterar o manifest.
- [x] Verifier independente reporta PASS em `validation.md`.
