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

- **Feature**: slice-7-module-lifecycle — **CONCLUÍDO** (Execute + Verify, Verifier independente PASS após 3 rounds de fix→re-verify — o limite do skill)
- **Phase / Task**: Fechado. Próxima feature: Slice 8 (portfolio-campaign, M6) ainda não iniciada (sem spec/design/tasks)
- **Completed**: slices 0-7 totalmente concluídos e verificados (Verifier PASS em todos). Slice 7 (module-lifecycle, o spike de assinatura/SBOM/provenance exigido pelo ADR-008): todos os 8 tasks implementados (migration 008 + `module.write` grant; publicar manifest assinado Ed25519 com SBOM determinístico e digest reusando `canonicalJson` do Slice 4; verificação de assinatura recomputada a cada leitura + listagem do registry privado; instalar com policy check reusando `capability_grants`/`checkCapability` do Slice 0 sem um segundo motor + lockfile; atualizar com diff de permissão bloqueante (nenhuma capability nova sem grant explícito); quarentena + rollback só para versão já provada pelo histórico do projeto; desinstalar preservando histórico append-only; fechamento). Atingiu o LIMITE de 3 rounds do skill: round 1 achou 3 gaps (verificação de assinatura corrompida nunca testada independente do mismatch de digest; update checava TODAS as capabilities em vez de só as `added`; seq inicial não fixado em 1 — todos corrigidos com testes dedicados e re-confirmados manualmente). Round 2 achou 3 gaps novos (2 corrigidos com testes — re-quarentena de instalação já quarentenada, validação de `version` ausente nas 3 rotas; 1 aceito como não-bloqueante — `getCurrentInstallation` sem `ORDER BY` explícito é teoricamente um bug mas estruturalmente inalcançável via teste black-box nesta base, dado que o índice composto já força o planner do Postgres à ordem correta — documentado em comentário no código). Round 3 achou 3 gaps novos (`listModules` podia retornar a versão MAIS ANTIGA como "latest" sem nenhum teste pegar — ligado diretamente ao critério de aceite do MODL-20, driver do FAIL do round; mais 2 gaps LOW — sort alfabético de `extractCapabilities` e checagem de tipo array de `capabilities` em `isValidManifest` sem teste negativo). Como round 3 já era o limite de 3 rounds do skill, os 3 gaps foram corrigidos DIRETAMENTE pelo orquestrador (não um 4º round formal de Verifier) com a mesma disciplina de mutação manual de todo round anterior — confirmado que cada teste novo mata a mutação exata, revertido antes do commit. Relatório completo (PASS final, com o corpo do round 3 preservado como registro histórico) em `.specs/features/slice-7-module-lifecycle/validation.md`. Gate full verde: 367 hub + 8 node integration + 27 unit, typecheck, check_docs, validate_spec/validate_tasks/validate_state todos limpos
- **In-progress**: nenhum. `spec.md`: Goals e todas as 5 Success Criteria `[x]`; MODL-01..20 todos em Phase=Execute/Status=Verified
- **Next step**: Iniciar Slice 8 (portfolio-campaign, M6, EP-052, depende dos Slices 3 e 5 — PRD-001 §portfólio, topologias de deployment) com o ciclo completo Specify→Design→Tasks→Execute→Verify, conforme `docs/06-delivery/09-spec-driven-execution-plan.md`
- **Blockers**: none
- **Uncommitted files**: none (tudo commitado e pushado até `b81f7da`)
- **Branch**: claude/docs-roadmap-ecosystem-fklxt7
