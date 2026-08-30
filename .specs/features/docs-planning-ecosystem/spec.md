# Docs Planning Ecosystem Specification

## Problem Statement

O repositório contém as docs fundadoras completas do EvolutionOS (visão, PRDs, arquitetura, ADRs, roadmap M0–M7, épicos EP-001..054 e slices 0–9), mas não existe a ponte executável entre esses documentos e o desenvolvimento spec-driven: não há memória de projeto (`.specs/`), não há plano que converta o roadmap em features especificáveis, não há a primeira spec pronta para implementação e não há verificação determinística da integridade do próprio ecossistema de docs. Sem isso, qualquer agente ou pessoa que inicie a construção precisa re-derivar o plano do zero — exatamente o conhecimento implícito que este repositório existe para eliminar.

## Goals

- [x] Plano de execução publicado em `docs/06-delivery/` mapeando 100% dos slices (0–9) para features nomeadas com dependências, milestones e épicos.
- [x] Memória de projeto `.specs/STATE.md` operante (Decisions + Handoff) sem duplicar os ADRs aceitos.
- [x] Primeira feature do roadmap (Slice 0 — trust skeleton) especificada e aprovada pelo gate `validate_spec.py`.
- [x] Gate determinístico de integridade das docs (`scripts/check_docs.py`) verde na árvore atual.

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
| ------- | ------ |
| Implementação de código do EvolutionOS (Control Plane, Node, UI) | Começa na feature `slice-0-trust-skeleton`, após aprovação desta entrega |
| Specs completas dos Slices 1–9 | Criadas lazily quando cada slice iniciar (princípio da skill: artefatos sob demanda; specs vazias antecipadas viram ficção) |
| Criação de issues no GitHub a partir dos épicos | Ação externa visível; requer pedido explícito do usuário |
| Reescrita ou correção de conteúdo das docs fundadoras | Fonte de verdade; alterações exigem novo ADR conforme `AGENTS.md` |
| CI/workflow para rodar `check_docs.py` automaticamente | Depende de decisão de plataforma CI (EP-001); o script fica pronto para ser plugado |

---

## Assumptions & Open Questions

Every ambiguity is resolved or recorded here - nothing is left silently unclear.

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | --------------- | --------- | ---------- |
| "Ecossistema das docs" inclui criar specs para tudo agora? | Não: plano completo + spec do Slice 0 apenas; demais specs criadas quando o slice iniciar | Specs antecipadas sem fase Specify real violam o princípio de criação lazy e produziriam requisitos inventados | n |
| Idioma dos novos artefatos | Prosa em PT-BR, critérios EARS e termos técnicos em inglês | Segue o padrão bilíngue já usado nas docs fundadoras (exits dos milestones em inglês) | n |
| Onde vive o plano de execução | `docs/06-delivery/09-spec-driven-execution-plan.md`, linkado no índice mestre | A pasta 06-delivery já concentra roadmap, épicos e sequência; o plano é a continuação natural e fica visível na navegação | n |
| Escopo do check de docs | Links relativos em `*.md` de `docs/`, `README.md`, `AGENTS.md` + alcançabilidade de `docs/**` a partir do índice; links externos (http) ignorados; âncoras ignoradas | Verificável offline e determinístico; validar âncoras/URLs externas exige parsing frágil ou rede | n |
| Push para o remoto | Push na branch designada `claude/docs-roadmap-ecosystem-fklxt7` ao final | Instrução explícita do harness da sessão autoriza commit+push nessa branch | y |

**Open questions:** none - all resolved or logged above.

---

## User Stories

### P1: Plano de execução do roadmap ⭐ MVP

**User Story**: As a coding agent (ou dev) iniciando a construção do EvolutionOS, I want um plano que converta slices/milestones/épicos em features spec-driven ordenadas so that eu saiba exatamente qual feature abrir, com quais docs-fonte e quais gates, sem re-derivar o roadmap.

**Why P1**: É a entrega central pedida — o roadmap executável do ecossistema.

**Acceptance Criteria**:

1. The execution plan SHALL map every build slice (0-9) from `05-build-sequence.md` to a named feature slug with its milestone (M0-M7), epics (EP-xxx), dependencies and source documents.
2. WHEN a feature in the plan depends on another slice THEN the plan SHALL list that dependency explicitly in the feature's row before it may start.
3. The execution plan SHALL define the per-feature workflow (specify -> validate_spec -> design/tasks -> execute -> verify) including the deterministic gate commands.
4. The execution plan SHALL be reachable from the master index `docs/00-overview/00-index.md`.

**Independent Test**: Abrir `docs/06-delivery/09-spec-driven-execution-plan.md` e conferir que cada slice de `05-build-sequence.md` aparece com feature, milestone, épicos, dependências e docs-fonte; conferir link no índice.

---

### P1: Memória de projeto `.specs/`

**User Story**: As a agente retomando trabalho em sessões futuras, I want `.specs/STATE.md` com log de decisões e handoff so that decisões de processo e estado em andamento sobrevivam entre sessões.

**Why P1**: Sem memória, o ecossistema de planejamento não é durável — cada sessão recomeça.

**Acceptance Criteria**:

1. The file `.specs/STATE.md` SHALL contain a `## Decisions` section and a `## Handoff` section.
2. WHEN a planning-process decision is recorded THEN STATE.md SHALL register it as an AD-NNN entry containing Decision, Reason, Trade-off, Scope, Date and Status fields.
3. The Decisions log SHALL reference `docs/04-decisions/` as the source of the accepted architecture ADRs instead of duplicating their content.

**Independent Test**: Ler `.specs/STATE.md`: duas seções presentes, entradas AD-001+ completas, nenhuma cópia de conteúdo de ADR.

---

### P1: Spec do Slice 0 (trust skeleton)

**User Story**: As a implementador do primeiro incremento, I want a spec do Slice 0 com requisitos EARS rastreados às docs-fonte so that a implementação comece imediatamente com critérios testáveis.

**Why P1**: Torna o plano acionável no ato — a primeira feature já sai pronta para Execute.

**Acceptance Criteria**:

1. The slice-0 specification SHALL pass `validate_spec.py` with zero errors.
2. The slice-0 specification SHALL cover every M0 exit criterion from `01-mvp-and-roadmap.md` (registration event flow UI->API->outbox->projection->UI, Node enroll/sync dummy artifact, tenant isolation and idempotency tests) as acceptance criteria.
3. WHEN a requirement ID is listed in the slice-0 traceability table THEN it SHALL map to at least one source anchor (CORE-FR id, epic EP-xxx or M0 exit criterion) in the founding docs.

**Independent Test**: Rodar `validate_spec.py .specs/features/slice-0-trust-skeleton` (exit 0) e conferir a tabela de rastreabilidade contra `PRD-001` e `01-mvp-and-roadmap.md`.

---

### P2: Gate determinístico de integridade das docs

**User Story**: As a mantenedor do repositório documental, I want um check executável de links e alcançabilidade so that docs quebradas ou órfãs sejam detectadas por código, não por memória.

**Why P2**: Protege o ecossistema criado, mas o plano tem valor mesmo sem ele.

**Acceptance Criteria**:

1. WHEN `scripts/check_docs.py` runs on a tree whose relative links all resolve THEN it SHALL exit 0.
2. IF a Markdown relative link targets a missing file THEN `check_docs.py` SHALL exit non-zero and report the source file and the broken target.
3. IF a file under `docs/` is not reachable from the master index via the link graph THEN `check_docs.py` SHALL exit non-zero and report it as orphan.

**Independent Test**: Rodar o script na árvore atual (exit 0); num scratch, quebrar um link e criar uma doc órfã e conferir exit 1 com os dois relatos.

---

## Edge Cases

- IF a Markdown link uses an anchor (`file.md#section`) THEN `check_docs.py` SHALL validate only the file part of the target.
- IF a link target is an external URL (`http://`, `https://`, `mailto:`) THEN `check_docs.py` SHALL ignore it.
- WHEN a link points to a non-Markdown asset (e.g. `examples/*.yaml`) THEN `check_docs.py` SHALL still verify the file exists.
- IF the execution plan references a feature whose spec does not exist yet THEN the plan SHALL mark its status as `planned` rather than linking to a missing path.

---

## Requirement Traceability

Each requirement gets a unique ID for tracking across design, tasks, and validation.

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| PLAN-01 | P1: Plano de execução — mapeamento slices→features | Execute | Verified |
| PLAN-02 | P1: Plano de execução — dependências explícitas | Execute | Verified |
| PLAN-03 | P1: Plano de execução — workflow e gates por feature | Execute | Verified |
| PLAN-04 | P1: Plano de execução — navegável pelo índice | Execute | Verified |
| PLAN-05 | P1: Memória — seções Decisions/Handoff | Execute | Verified |
| PLAN-06 | P1: Memória — entradas AD-NNN completas | Execute | Verified |
| PLAN-07 | P1: Memória — ADRs referenciados, não duplicados | Execute | Verified |
| PLAN-08 | P1: Slice 0 — spec passa validate_spec | Execute | Verified |
| PLAN-09 | P1: Slice 0 — cobre exits do M0 | Execute | Verified |
| PLAN-10 | P1: Slice 0 — IDs rastreados às docs-fonte | Execute | Verified |
| PLAN-11 | P2: Docs check — árvore íntegra sai 0 | Execute | Verified |
| PLAN-12 | P2: Docs check — link quebrado sai não-zero | Execute | Verified |
| PLAN-13 | P2: Docs check — doc órfã reportada | Execute | Verified |

**ID format:** `PLAN-NN`

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

**Coverage:** 13 total, 13 mapped to execution steps, 0 unmapped

---

## Success Criteria

How we know the feature is successful:

- [x] `validate_spec.py` sai 0 para esta spec e para a do Slice 0.
- [x] `check_docs.py` sai 0 na árvore final (nenhum link quebrado, nenhuma doc órfã).
- [x] Um agente que leia apenas `docs/06-delivery/09-spec-driven-execution-plan.md` consegue abrir a próxima feature sem consultar mais nada além dos docs-fonte linkados.
- [x] Verifier independente reporta PASS em `validation.md`.
