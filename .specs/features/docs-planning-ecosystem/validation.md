# Validation Report — docs-planning-ecosystem

- **Result**: PASS
- **Diff range**: 8af2a9e..b94d990
- **Date**: 2026-08-30

## Per-AC evidence

| Requirement ID | AC | Evidence (file:line + o que foi conferido) | Resultado |
| -------------- | -- | ------------------------------------------ | --------- |
| PLAN-01 | Plano mapeia todo slice 0–9 para feature nomeada com milestone, épicos, dependências e docs-fonte | `docs/06-delivery/09-spec-driven-execution-plan.md:14-25` — tabela com linhas 0–9, colunas Feature (slug), Milestone (M0–M7), Épicos (EP-xxx), Depende de, Docs-fonte, Status. Conferido 1:1 contra os 10 slices de `docs/06-delivery/05-build-sequence.md:7-110` (Slice 0 Trust skeleton … Slice 9 Enterprise hardening) — nenhum slice ausente. Épicos EP-001..004 do Slice 0 existem em `docs/06-delivery/02-implementation-epics.md:5-17` | Coberto |
| PLAN-02 | Dependência de outro slice listada explicitamente na linha da feature | `docs/06-delivery/09-spec-driven-execution-plan.md:14-25` coluna "Depende de" (ex.: slice 3 depende de "1, 2" em L19; slice 9 de "0–8" em L25); grafo mermaid de dependências em L29-47 consistente com a coluna | Coberto |
| PLAN-03 | Workflow por feature (specify → validate_spec → design/tasks → execute → verify) com comandos de gate determinísticos | `docs/06-delivery/09-spec-driven-execution-plan.md:49-58` (6 passos com comandos `validate_spec.py`, `validate_tasks.py`, `check_commit.py`, `validate_state.py`) e tabela de gates permanentes em L60-68 (inclui `python3 scripts/check_docs.py`) | Coberto |
| PLAN-04 | Plano alcançável do índice mestre | `docs/00-overview/00-index.md:64` — link `[Plano de execução spec-driven](../06-delivery/09-spec-driven-execution-plan.md)`; alcançabilidade confirmada por `check_docs.py` exit 0 (71 arquivos, 0 problemas) | Coberto |
| PLAN-05 | STATE.md contém `## Decisions` e `## Handoff` | `.specs/STATE.md:8` (`## Decisions`) e `.specs/STATE.md:34` (`## Handoff`) | Coberto |
| PLAN-06 | Entradas AD-NNN com Decision, Reason, Trade-off, Scope, Date e Status | AD-001 `.specs/STATE.md:10-16`, AD-002 `:18-24`, AD-003 `:26-32` — os 6 campos presentes em cada entrada | Coberto |
| PLAN-07 | Decisions referencia `docs/04-decisions/` sem duplicar ADRs | `.specs/STATE.md:4-6` — link para `docs/04-decisions/README.md` com nota explícita "NÃO são duplicadas aqui"; AD-001..003 são decisões de processo (skill, derivação por slice, gate de docs), nenhuma reproduz conteúdo de ADR arquitetural | Coberto |
| PLAN-08 | Spec do slice-0 passa `validate_spec.py` com zero erros | Executado `python3 .claude/skills/tlc-spec-driven/scripts/validate_spec.py .specs/features/slice-0-trust-skeleton/spec.md` → "0 error(s), 0 warning(s)", exit 0. Verificação manual adicional (ver sensor, mutante b1): todos os 21 itens numerados de AC contêm SHALL (`grep` sobre `.specs/features/slice-0-trust-skeleton/spec.md`) | Coberto |
| PLAN-09 | Spec do slice-0 cobre todos os exits do M0 | Exits do M0 em `docs/06-delivery/01-mvp-and-roadmap.md:20-24`: (1) registration UI→API→outbox→projection→UI → ACs em `.specs/features/slice-0-trust-skeleton/spec.md:51-52` (TRUST-01/02); (2) Node enroll/sync dummy → `:102-104` (TRUST-12/13/14); (3) tenant isolation and idempotency tests → `:54-55` (TRUST-04/05) e `:70-72` (TRUST-07/09) | Coberto |
| PLAN-10 | Cada ID da tabela de rastreabilidade cita âncora real nas docs-fonte | Tabela `.specs/features/slice-0-trust-skeleton/spec.md:137-153`, todos os 16 TRUST-NN com âncora (CORE-FR/EP/exit M0/ADR). Amostragem: CORE-FR-001 existe em `docs/01-product/PRD-001-core-platform.md:82` ("cadastrar projeto"); extensions `tenantid/workspaceid/projectid/correlationid/classification/schemaversion` (TRUST-03, spec:53) existem em `docs/07-specifications/06-event-contract-spec.md:9-17,76-82`; EP-001..004 em `docs/06-delivery/02-implementation-epics.md:5-17` | Coberto |
| PLAN-11 | `check_docs.py` sai 0 em árvore íntegra | Executado `python3 scripts/check_docs.py` na árvore real → "check_docs: 0 problema(s) em 71 arquivo(s)", exit 0 | Coberto |
| PLAN-12 | Link relativo quebrado → exit não-zero reportando fonte e alvo | Lógica em `scripts/check_docs.py:73-80`; comprovado no sensor (a): link mutado no índice → `ERROR broken-link docs/00-overview/00-index.md: '../06-delivery/01-mvp-and-roadmap-MISSING.md' -> ... não existe`, exit 1 | Coberto |
| PLAN-13 | Doc sob `docs/` inalcançável do índice → exit não-zero reportando órfã | Lógica em `scripts/check_docs.py:82-94`; comprovado no sensor (a): `docs/99-orphan-test.md` injetada → `ERROR orphan docs/99-orphan-test.md: não alcançável ...`, exit 1 | Coberto |
| Edge: âncora | `file.md#secao` valida só a parte do arquivo | `scripts/check_docs.py:53` (`target.split("#", 1)[0]`); sensor (c): link `[teste âncora](00-index.md#secao)` para arquivo existente não gerou erro | Coberto |
| Edge: URL externa | http/https/mailto ignorados | `scripts/check_docs.py:30,51-52` (EXTERNAL_RE); sensor (c): link `https://example.com/pagina` não gerou erro | Coberto |
| Edge: asset não-Markdown | Existência verificada mesmo para não-.md | `scripts/check_docs.py:79` (`os.path.isfile` para qualquer alvo não-externo); exercitado na árvore real por `docs/00-overview/00-index.md:85-88` (links para `examples/*.yaml`) com exit 0 | Coberto |
| Edge: feature sem spec ainda | Plano marca `planned` em vez de link para caminho inexistente | `docs/06-delivery/09-spec-driven-execution-plan.md:17-25` — slices 1–9 com Status `planned` sem link; único link de spec é o do slice 0 (`specified`, L16), que existe | Coberto |

## Discrimination sensor

Baseline antes dos testes: `git status --porcelain` limpo (saída vazia). Todas as mutações foram feitas SOMENTE em cópias sob o scratchpad (`.../scratchpad/verifier`); nenhum arquivo rastreado foi tocado.

| Teste | Falha injetada (na cópia) | Detectada? |
| ----- | ------------------------- | ---------- |
| (a) broken link | Link do índice mutado para `01-mvp-and-roadmap-MISSING.md` | SIM — `ERROR broken-link docs/00-overview/00-index.md: ... não existe`, exit 1 |
| (a) orphan | `docs/99-orphan-test.md` criada sem nenhum link de entrada | SIM — `ERROR orphan docs/99-orphan-test.md: não alcançável ...`, exit 1 |
| (b) Rationale vazio | Célula Rationale da assumption "Identidade em M0" esvaziada na cópia da spec do slice 0 | SIM — `ERROR assumption 'Identidade em M0' has empty 'Rationale'`, exit 1 |
| (b) SHALL removido | AC "The policy engine SHALL deny..." reescrito sem SHALL | NÃO — MUTANTE SOBREVIVENTE. `validate_spec.py` saiu 1 apenas pelo Rationale. Causa raiz: em `.claude/skills/tlc-spec-driven/scripts/validate_spec.py:173` (`elif stripped == ""` → `in_ac = False`), a linha em branco entre `**Acceptance Criteria**:` e o item 1 desliga a varredura de ACs — no formato usado pelas specs entregues, o check de SHALL nunca examina nenhum AC. Confirmado: removendo a linha em branco na cópia, o mesmo mutante É detectado (`ERROR L71: acceptance criterion has no SHALL`). |
| (c) falso positivo | Link com âncora para arquivo existente + link externo https adicionados a doc alcançável na cópia (com os defeitos de (a) ainda presentes) | Nenhum falso positivo — `check_docs.py` saiu 1 com exatamente os 2 defeitos reais (broken-link e orphan) |

Mitigação do mutante sobrevivente (b): a propriedade subjacente foi verificada manualmente pelo verifier — todos os 21 itens numerados de Acceptance Criteria de `.specs/features/slice-0-trust-skeleton/spec.md` contêm SHALL (grep sem exceções). O defeito está em `validate_spec.py`, script pré-existente da skill, FORA do diff range 8af2a9e..b94d990 — não é artefato desta feature, e PLAN-08 exige literalmente "pass validate_spec.py with zero errors", o que se mantém.

Após os testes: scratch (`.../scratchpad/verifier`) apagado; `git status --porcelain` novamente vazio — idêntico ao baseline. A árvore real nunca foi modificada.

## Gaps

Nenhum gap bloqueante — todos os 13 ACs e 4 edge cases têm evidência localizável na árvore real.

Observações não-bloqueantes (fora do diff range, registradas para follow-up):

1. **Tooling da skill (não desta feature)**: o check de SHALL de `validate_spec.py` é anulado pela linha em branco após o header `**Acceptance Criteria**:` (`.claude/skills/tlc-spec-driven/scripts/validate_spec.py:173`). Enquanto não corrigido, o gate PLAN-08 não protege contra ACs não-EARS; a cobertura desta entrega foi confirmada por inspeção manual. Recomenda-se registrar lição/fix upstream na skill.
2. **Precisão de spec (menor)**: PLAN-09 cita "registration event flow UI->API->outbox->projection->UI, Node enroll/sync dummy artifact, tenant isolation and idempotency tests" como "every M0 exit criterion" — bate exatamente com `01-mvp-and-roadmap.md:20-24`; sem divergência, apenas nota de que os deliverables M0 (schemas v0, OTel, workflow hello path) não são exits mas também estão cobertos na spec do slice 0 (TRUST-10/11/15/16).
