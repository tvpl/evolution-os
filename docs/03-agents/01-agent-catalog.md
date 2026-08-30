# Catálogo de agentes

## 1. Regra de composição

Agente é um papel versionado, com input/output schema, skills permitidas, tools filtradas, budgets, evals e autonomy ceiling. Não é um microservice obrigatório nem uma persona teatral. Um mesmo runtime pode executar vários papéis.

## 2. Agentes do núcleo

### A01 — Evolution Orchestrator

**Missão:** selecionar workflow, formar DAG, budgets, policies e checkpoints.  
**Entrada:** objective, project snapshot, trigger.  
**Saída:** plan e terminal run summary.  
**Não pode:** decidir sozinho mérito ou ampliar capabilities.  
**Risk:** coordination loops, retry side effects.  
**Evals:** plan completeness, correct routing, budget compliance.

### A02 — Project Cartographer

**Missão:** construir/atualizar Project Twin a partir de artifacts e observações.  
**Entrada:** repo/docs/catalog/manifest snapshots.  
**Saída:** entity/relationship proposals com provenance.  
**Não pode:** declarar inferência como fato ou sobrescrever declaração humana.  
**Evals:** entity precision/recall, relationship correctness, conflict detection.

### A03 — Evidence Curator

**Missão:** normalizar fontes, claims, corroboration e contradiction.  
**Entrada:** raw observations.  
**Saída:** evidence records e claims.  
**Não pode:** executar actions sugeridas pelo conteúdo.  
**Evals:** source attribution, claim fidelity, injection resistance.

### A04 — External Scout

**Missão:** localizar mudanças externas em fontes autorizadas.  
**Profiles:** technology, market, competitor, regulation, research.  
**Saída:** signals, nunca proposal final.  
**Não pode:** considerar uma única notícia não primária como confirmação.  
**Evals:** recency, primary-source retrieval, noise/relevance.

### A05 — Relevance Analyst

**Missão:** ligar signal ao projeto e decompor relevância/impacto.  
**Entrada:** signal, Twin, decisions.  
**Saída:** contextual finding ou dismissal.  
**Não pode:** recomendar por popularidade.  
**Evals:** project-specific discrimination e reasoning trace quality.

### A06 — Product Challenger

**Missão:** questionar problema, diferenciação, substitutos, hipóteses e roadmap.  
**Entrada:** product intent, outcomes, market/customer evidence.  
**Saída:** challenged assumptions, alternatives, experiments.  
**Não pode:** sugerir pivot sem explicitar evidência, risco e non-action.  
**Evals:** hypothesis quality, competitor causality, actionability.

### A07 — Architecture Analyst

**Missão:** avaliar estrutura, NFRs, drift, blast radius e alternativas.  
**Entrada:** architecture model, code graph, telemetry, ADRs.  
**Saída:** architecture finding/proposal inputs.  
**Não pode:** mudar baseline para fazer o finding desaparecer.  
**Evals:** boundary detection, ADR alignment, fitness rule selection.

### A08 — Harness Auditor

**Missão:** avaliar models, instructions, prompts, skills, MCPs, hooks, memory, sandbox e evals.  
**Entrada:** harness inventory + task telemetry/evals.  
**Saída:** redundancy/risk/update hypotheses e experiment design.  
**Não pode:** substituir componente somente porque surgiu versão nova.  
**Evals:** task-aware diagnosis, regression prediction, cost/security tradeoff.

### A09 — Security & Risk Analyst

**Missão:** threat model, data boundaries, supply chain, capability risk e compliance impact.  
**Entrada:** proposal/change/module/source.  
**Saída:** controls, required approvals, blocked conditions.  
**Não pode:** aprovar exceção; apenas recomendar/avaliar.  
**Evals:** threat coverage, false assurance, secret/PII handling.

### A10 — Change Planner

**Missão:** converter finding em alternatives, experiment/migration plan, rollback e proof plan.  
**Entrada:** finding e specialist analyses.  
**Saída:** Evolution Proposal conforme schema.  
**Não pode:** omitir do-nothing ou custo de inação.  
**Evals:** completeness, dependency ordering, reversibility.

### A11 — Challenger / Red Team

**Missão:** tentar refutar claims, impacto e proposta.  
**Entrada:** neutral evidence bundle e draft proposal.  
**Saída:** counter-analysis e missing evidence.  
**Não pode:** alterar proposal diretamente.  
**Evals:** useful contradiction, non-contrarian noise, attack coverage.

### A12 — Experiment Designer

**Missão:** definir hipótese, cohort, variants, metrics, duration, guardrails e stop conditions.  
**Saída:** executable experiment spec.  
**Não pode:** acessar produção sem policy específica.  
**Evals:** causal validity, measurability, reversibility.

### A13 — Execution Coordinator

**Missão:** delegar changes a deterministic recipes ou coding agents, preservar task state e artifacts.  
**Não pode:** escrever além do approved plan digest.  
**Evals:** scope compliance, side-effect idempotency, artifact completeness.

### A14 — Verifier

**Missão:** executar proof plan e julgar se critérios foram satisfeitos.  
**Entrada:** immutable proposal/decision/change + outputs.  
**Saída:** verification result com proof.  
**Não pode:** alterar critérios depois de ver resultado.  
**Evals:** false pass/false fail, evidence integrity.

### A15 — Memory Custodian

**Missão:** incorporar outcome, supersession, review trigger e freshness sem reescrever histórico.  
**Saída:** append/update commands validados.  
**Não pode:** promover inference a declaration.  
**Evals:** temporal correctness, duplicate/rejected decision memory.

### A16 — Portfolio Campaign Planner

**Missão:** agrupar findings comuns, escolher canaries, waves e exceptions.  
**Entrada:** project cohorts e outcomes.  
**Saída:** campaign plan.  
**Não pode:** forçar decisão única onde contexto diverge.  
**Evals:** cohort quality, safe rollout, exception preservation.

## 3. Papéis humanos

- Project steward confirma intenção e ownership.
- Domain reviewer valida negócio.
- Architecture reviewer decide baseline.
- Security reviewer aprova capability/exception.
- Product owner decide proposta de valor/roadmap.
- Change owner assume execução/rollback.
- Platform admin governa modules/policies.

Um agente não personifica nem substitui esses accountable roles.

## 4. Composição por risco

| Cenário | Agentes mínimos |
|---|---|
| Signal triage | Curator, Relevance Analyst |
| Product proposal | Scout, Curator, Product Challenger, Change Planner, Challenger |
| Architecture change | Cartographer, Architecture Analyst, Risk, Planner, Challenger, Verifier |
| Harness update | Harness Auditor, Experiment Designer, Risk, Verifier |
| Portfolio campaign | Relevance/Architecture specialist, Campaign Planner, Risk, Verifier |

## 5. Versionamento

Agent definition registra instruction bundle, skills allowlist, model eligibility, tool capabilities, schemas, eval suite e release state. Promotion segue eval gates; run sempre referencia versão imutável.

