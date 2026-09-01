# STATE

> Memória de projeto do EvolutionOS (camada de planejamento spec-driven).
> As 15 decisões arquiteturais aceitas vivem em [`docs/04-decisions/`](../docs/04-decisions/README.md)
> e NÃO são duplicadas aqui. Este log registra apenas decisões do processo de
> planejamento/execução que nenhum ADR cobre.

## Decisions

### AD-001
- **Decision**: Adotar a skill `tlc-spec-driven` como método único de planejamento e execução: cada incremento vira uma feature em `.specs/features/<slug>/` com spec EARS validada por `validate_spec.py` antes de qualquer implementação.
- **Reason**: As docs fundadoras exigem rastreabilidade de requisitos em testes e PRs (`AGENTS.md`, matriz de rastreabilidade); a skill fornece gates determinísticos que impedem drift.
- **Trade-off**: Cerimônia adicional por feature (spec + validação + verifier) em troca de rastreabilidade e verificação independente.
- **Scope**: Todo o repositório; toda feature futura de implementação do EvolutionOS.
- **Date**: 2026-08-30
- **Status**: active

### AD-002
- **Decision**: O backlog de features deriva dos slices verticais de `docs/06-delivery/05-build-sequence.md` (Slice 0..9), não dos milestones M0–M7 nem dos épicos EP-xxx diretamente; milestones e épicos são eixos de rastreabilidade, o slice é a unidade de entrega.
- **Reason**: A própria doc define a regra "construir por vertical slices demonstráveis"; slices têm stop gates explícitos (nenhum agente antes do trust skeleton) e valor demonstrável por entrega.
- **Trade-off**: Um épico pode atravessar vários slices, exigindo a matriz slice↔épico do plano de execução para não perder cobertura.
- **Scope**: `docs/06-delivery/09-spec-driven-execution-plan.md` e toda criação de feature.
- **Date**: 2026-08-30
- **Status**: active

### AD-003
- **Decision**: Integridade do ecossistema de docs é garantida por gate determinístico (`scripts/check_docs.py`): todo link relativo resolve e todo arquivo sob `docs/` é alcançável a partir do índice mestre.
- **Reason**: "Docs checks" é entrega do EP-001; um repositório documental que alimenta agentes de IA não pode ter links quebrados nem docs órfãs invisíveis à navegação.
- **Trade-off**: Adicionar uma doc agora exige ligá-la ao grafo de navegação; é atrito intencional.
- **Scope**: `docs/`, `examples/`, `README.md`, `AGENTS.md`.
- **Date**: 2026-08-30
- **Status**: active

### AD-004
- **Decision**: EvolutionOS é um monorepo TypeScript com pnpm workspaces (`apps/hub` Fastify, `apps/console` Next.js, `apps/node` CLI, `packages/contracts`, `packages/telemetry`); schemas e tipos de contrato vivem só em `packages/contracts`.
- **Reason**: Console já é Next.js (ADR-003); uma linguagem permite compartilhar schemas v0/validadores/event types entre Hub, Node e Console sem duplicação.
- **Trade-off**: Lock-in em Node.js/TS para o Hub; workloads que exigirem outra runtime entram como workers separados (ADR-004 já os prevê).
- **Scope**: Todo código de implementação a partir do Slice 0.
- **Date**: 2026-08-30
- **Status**: active

### AD-005
- **Decision**: Dev e testes usam PostgreSQL 16 real gerenciado por `scripts/dev-db.sh` (initdb/pg_ctl como usuário `postgres`, socket unix, porta 55432) — nunca SQLite/PGlite como substituto.
- **Reason**: ADR-005 define Postgres como source of record; testar em outro dialeto esconde bugs de SQL/transação exatamente onde o trust skeleton precisa de confiança.
- **Trade-off**: Setup local exige o binário do Postgres (presente no container e em qualquer CI padrão); testes um pouco mais lentos que in-memory.
- **Scope**: `apps/hub`, testes de integração, CI futuro.
- **Date**: 2026-08-30
- **Status**: active

### AD-006
- **Decision**: O durable workflow do M0 é uma engine mínima própria sobre Postgres (tabelas `workflows`/`workflow_steps`, checkpoints, retomada idempotente) atrás de uma interface estreita; brokers/engines externos (Temporal, Kafka) ficam fora até um review trigger do ADR-006.
- **Reason**: ADR-006 prevê "Lite profile precisa de engine menor; interface será mantida"; o M0 exige apenas um hello path durável que sobreviva a restart.
- **Trade-off**: Sem timers/leases sofisticados por ora; troca futura de engine limitada à implementação do adapter.
- **Scope**: `apps/hub/src/platform/workflow*`; slices 3+ reavaliam ao introduzir runs agentic.
- **Date**: 2026-08-30
- **Status**: active

## Handoff

- **Feature**: slice-6-harness-vertical — **CONCLUÍDO** (Execute + Verify, Verifier independente PASS após 2 rounds de fix→re-verify)
- **Phase / Task**: Fechado. Próxima feature: Slice 7 (module-lifecycle, M4/M7) ainda não iniciada (sem spec/design/tasks)
- **Completed**: slices 0, 1, 2, 3, 4, 5 e 6 totalmente concluídos e verificados (Verifier PASS em todos, gaps fechados — slice 3 levou 3 rounds, slices 4, 5 e 6 levaram 2 rounds cada de fix→re-verify). Slice 6: todos os 7 tasks implementados (migration 007 + `harness.write` grant; inventário versionado; dataset de eval determinístico com 4 tipos de invariante; execução do eval com score persistido; `evaluateExperimentFromEvalRun` reusando `submitEvaluation` do Slice 4 SEM alteração; Harness Observatory agregada; fechamento). Verifier round 1: PASS geral mas achou 3 gaps reais — 2 mutantes sobreviventes (capability check da rota evaluate-from-eval-run podia reverter de `experiment.write` para `harness.write` sem quebrar nenhum teste, já que os dois grants existiam para ambos os tenants dev; a ordem dos guards `requires_inventory`/`requires_eval_cases` em `runEval` nunca era testada com AMBOS ausentes) e 1 gap de precisão de spec (listagem de eval cases usava `toBeGreaterThanOrEqual`/`toHaveProperty` em vez de valor exato). Um bug real de conformidade com spec também foi achado e corrigido ANTES do round 1 (T5 usava `harness.write` em vez de `experiment.write`, contradizendo a Assumption confirmada da spec). Todos os 3 gaps do round 1 corrigidos com testes dedicados, re-confirmados manualmente na árvore real antes do commit. Verifier round 2: PASS limpo — os 3 fixes re-confirmados fechados + 6 mutações novas em funções antes não cobertas (versionamento de `declareInventory`, agregação de `getHarnessObservatory`, persistência de `declareEvalCase`, enum de categoria de `isValidEvalCaseParams`, distinção 404-vs-vazio do inventário, boundary de `min_component_count`) — 0 sobreviventes. Relatório completo em `.specs/features/slice-6-harness-vertical/validation.md`. Gate full verde: 311 hub + 8 node integration + 27 unit, typecheck, check_docs, validate_spec/validate_tasks/validate_state todos limpos
- **In-progress**: nenhum. `spec.md`: Goals e todas as 5 Success Criteria `[x]`; HRN-01..14 todos em Phase=Execute/Status=Verified
- **Next step**: Iniciar Slice 7 (module-lifecycle, M4/M7, EP-050, depende dos Slices 2 e 4 — PRD-005, módulos/skills/MCP, module package spec, ADR-007/008) com o ciclo completo Specify→Design→Tasks→Execute→Verify, conforme `docs/06-delivery/09-spec-driven-execution-plan.md`
- **Blockers**: none
- **Uncommitted files**: none (tudo commitado e pushado até `3db785d`)
- **Branch**: claude/docs-roadmap-ecosystem-fklxt7
