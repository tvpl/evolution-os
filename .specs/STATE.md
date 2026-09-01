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

- **Feature**: slice-9-enterprise-hardening — **CONCLUÍDO** (Execute + Verify, Verifier independente PASS após 2 rounds de fix→re-verify). **Este era o último slice do roadmap de 10 slices — o roadmap inteiro (Slices 0-9) está agora concluído e verificado.**
- **Phase / Task**: Fechado. Nenhuma próxima feature planejada em `docs/06-delivery/09-spec-driven-execution-plan.md` — todas as 10 linhas da tabela (Slice 0-9) marcam `implemented`.
- **Completed**: slices 0-9 totalmente concluídos e verificados (Verifier PASS em todos). Slice 9 (enterprise-hardening): todos os 7 tasks implementados (migration 010 + `admin.write` grant; Node fleet kill switch reusando sem alteração a checagem `revoked_at` que o Slice 2 já lia mas nunca escrevia; cadeia de hash tamper-evident computada DENTRO de `recordAudit` com assinatura pública inalterada — nenhum dos ~20+ call sites existentes precisou mudar — encadeada por org com genesis fixo para o primeiro entry; export de auditoria org-wide reusando `verifyAuditChain` sem alteração; política de retenção + sweep que redige evidência antiga (`content_excerpt=null`, nunca deleta a linha) preservando `content_digest` e toda lineage de claim/decision; desprovisionamento de usuário com `dev-login` ganhando uma única condição adicional, distinguindo 401 `identity_deactivated` de 401 `unknown_identity`). Round 1 do Verifier achou 1 gap MAJOR (mutante sobrevivente: o guard `admin.write` em 3 de 4 rotas de escrita — retention, retention/sweep, users/deactivate — estava implementado corretamente mas sem NENHUM teste de cobertura; remover o guard da rota de retention deixava toda a suite de 441 testes verde) + 1 gap MINOR de precisão de spec (HARD-05 citava "fleet list ou revoke route" para 403 cross-tenant, mas a leitura da fleet list nunca tem parâmetro de path para redirecionar a outro org — estruturalmente inalcançável pelo próprio design documentado). Ambos corrigidos: 3 testes 403/`capability_denied` adicionados (um por rota antes descoberta, verificados manualmente com a mesma mutação aplicada à árvore real, teste falhando, revertido, `git diff` limpo, antes de commitar); HARD-05 reescrito para citar só a rota de revoke. Round 2 (independente, sem herdar contexto do round 1) re-derivou as 22 ACs do zero, re-verificou as 3 correções por conta própria (removendo cada guard de novo num worktree isolado e confirmando a falha do teste antes de reverter), rodou 4 mutações novas em alvos nunca antes mutados (boundary de `setRetentionPolicy`, filtro de org de `listNodeFleet`, ordenação de `exportAuditLog`, composição de campos de `computeEntryHash`) — todas as 7 mutações mortas, PASS limpo. Relatório completo (PASS final, round 1 preservado como registro histórico) em `.specs/features/slice-9-enterprise-hardening/validation.md`. Gate full verde: 443 hub + 8 node integration + 27 unit, typecheck, check_docs, validate_spec/validate_tasks/validate_state todos limpos.
- **In-progress**: nenhum. `spec.md`: Goals e todas as 5 Success Criteria `[x]`; HARD-01..22 todos em Phase=Execute/Status=Verified. Nenhuma feature em andamento em todo o repositório.
- **Next step**: Nenhum item do roadmap planejado permanece. Se houver trabalho futuro, ele exigirá uma nova rodada de planejamento (novo slice ou incremento fora dos 10 originais) começando pela fase Specify da skill `tlc-spec-driven`, não uma continuação deste plano.
- **Blockers**: none
- **Uncommitted files**: none (tudo commitado e pushado até `b3da8c2`)
- **Branch**: claude/docs-roadmap-ecosystem-fklxt7
