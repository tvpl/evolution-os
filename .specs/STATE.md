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

- **Feature**: slice-3-evidence-to-decision — Execute concluído (T1-T10, todos os 10 tasks); aguardando Verifier independente
- **Phase / Task**: Verify (dispatch do Verifier independente ainda não rodou)
- **Completed**: slices 0, 1 e 2 totalmente concluídos e verificados (Verifier PASS em todos, gaps fechados). Slice 3: todos os 10 tasks implementados e commitados (evidence quarantine/activation, claims N:N, analysis-provider determinístico, signals com dedup atômico, proposals draft+ready+Challenger, inbox, decision guard estendido a `subjectType='proposal'`, fechamento de docs); gate full verde (168 hub + 8 node integration + 27 unit, typecheck, check_docs, validate_spec/validate_tasks todos limpos)
- **In-progress**: nenhum — Execute completo. `spec.md`: Goals e 4/5 Success Criteria marcados `[x]` (o 5º, "Verifier independente reporta PASS", aberto até a Verificação rodar); FLOW-01..18 em Phase=Execute/Status=Implementing (a subir para Verified pós-Verifier)
- **Next step**: Dispatch do Verifier independente para slice-3-evidence-to-decision (evidence-or-zero, discrimination sensor); fechar gaps se houver; marcar FLOW-01..18 como Verified e a 5ª Success Criteria; depois seguir para Slice 4 (experiment-loop, M3) conforme `docs/06-delivery/09-spec-driven-execution-plan.md`
- **Blockers**: none
- **Uncommitted files**: none (tudo commitado até `de832ba`)
- **Branch**: claude/docs-roadmap-ecosystem-fklxt7
