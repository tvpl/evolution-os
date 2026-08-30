# Bootstrap para construir EvolutionOS com IA

## 1. Objetivo

Este playbook orienta um coding agent a iniciar o produto sem tentar construir todo o ecossistema em uma única rodada.

## 2. Preparação do repositório

Copiar este pacote para o repositório e manter:

- `AGENTS.md` na raiz;
- docs versionadas;
- ADR checks;
- requirements IDs em issues/tests;
- changelog de decisões.

Criar um backlog a partir dos épicos, mas executar somente o primeiro slice não bloqueado.

## 3. Prompt fundador sugerido

```text
Você está construindo EvolutionOS, uma plataforma de inteligência de evolução contínua.

Leia integralmente README.md, AGENTS.md, docs/00-overview/00-index.md, o PRD e todos os ADRs relacionados ao slice atual. Não implemente antes de produzir:

1. resumo do objetivo e não objetivos;
2. requisitos rastreáveis;
3. decisões aceitas e proposed ADRs;
4. trust/data boundaries;
5. APIs, events e artifacts afetados;
6. plano vertical com testes/evals;
7. riscos, rollback e dúvidas bloqueantes.

Implemente somente o menor vertical slice completo. Preserve evidence-first, read-only default, local processing, capability security, durable workflows e idempotency. Não introduza microservices, graph database obrigatório, marketplace público ou automação material sem um requisito e ADR.

Depois de implementar, execute todos os checks, atualize docs/examples e entregue proof artifacts ligados aos requirement IDs. Se a documentação contradizer uma necessidade real, pare e proponha ADR; não altere silenciosamente o design.
```

## 4. Loop de execução por slice

### Discover

- Ler docs necessárias.
- Inspecionar repo/dirty state.
- Mapear existing patterns.
- Formular unknowns e spikes.

### Specify

- Acceptance scenarios.
- Contracts/schema migrations.
- Threat cases.
- Observability/audit.
- Compatibility/rollback.

### Plan

- DAG pequeno.
- Um vertical happy path + negative path.
- Stop points e human review.
- Não criar workstreams especulativos.

### Implement

- Deterministic foundation first.
- Domain boundaries.
- Contract tests before agent prompt tuning.
- Feature flag/autonomy ceiling.

### Gauntlet

- Unit/integration/E2E.
- Cross-tenant/auth negative.
- Idempotency/retry.
- Malicious/stale/conflicting input.
- Agent eval slices.
- Restart/resume.
- Accessibility/performance where relevant.

### Review

- Independent architecture/security/product challenge.
- Compare implementation to PRD/ADRs.
- Find undocumented behavior.
- Inspect evidence/proof, not summary only.

### Commit learning

- Update docs/ADRs.
- Add regression case.
- Record known limitation/review trigger.
- Do not rewrite history to make implementation appear planned.

## 5. Subagents quando disponíveis

Use somente para tarefas independentes e limitadas, por exemplo:

- contract/schema review;
- threat modeling;
- Next.js accessibility review;
- idempotency/failure analysis;
- eval dataset design.

O main agent permanece responsável por ler todas as instruções e integrar decisões. Não delegar a interpretação dos ADRs como caixa-preta.

## 6. Required proof por PR

- Requirements table.
- Architecture diff.
- API/event/schema examples.
- Test/eval results.
- Threat/permission changes.
- OTel trace ou run artifact para vertical slice.
- Migration/rollback demonstration.
- Screenshots/visual QA para UI.

## 7. Primeira missão recomendada

Implementar Slice 0 apenas:

`register a tenant-scoped project from Next.js → persist transactionally → emit outbox CloudEvent → update projection → show project in authorized UI → trace and audit → prove idempotency and cross-tenant denial`.

Isso valida as fundações que todos os agentes, modules e dashboards usarão.

## 8. Critérios para prosseguir ao primeiro agente

- Identity/tenant/capability contract está testado.
- Event/workflow restart funciona.
- Evidence schema e classification existem.
- OTel/audit correlation existe.
- Run budget/cancel state existe.
- Prompt/tool output schemas e eval runner mínimo existem.

Sem isso, adicionar agentes apenas cria comportamento impossível de governar.

