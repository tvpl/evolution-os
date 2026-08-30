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

## Handoff

- **Feature**: docs-planning-ecosystem (`.specs/features/docs-planning-ecosystem/`)
- **Phase / Task**: Execute — T1 (bootstrap `.specs/` + spec da feature)
- **Completed**: none
- **In-progress** (file:line): —
- **Next step**: Validar spec com `validate_spec.py`, seguir para T2 (`scripts/check_docs.py`).
- **Blockers**: none
- **Uncommitted files**: `.specs/STATE.md`, `.specs/features/docs-planning-ecosystem/spec.md`
- **Branch**: claude/docs-roadmap-ecosystem-fklxt7
