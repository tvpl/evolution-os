# Catálogo inicial de skills

## 1. Organização

Skills ficam dentro de módulos e seguem progressive disclosure. O catálogo abaixo define responsabilidades, não prompts finais. Cada skill precisa de activation tests, output schema e eval pack.

## Foundation

### `project-intent-capture`

Ativa ao registrar ideia/produto. Estrutura problema, público, outcome, restrições, hipóteses e unknowns. Não inventa market data.

### `artifact-classifier`

Classifica PRD, ADR, spec, diagram, incident, runbook e contract; extrai metadata e sensitivity.

### `decision-memory`

Localiza decisões anteriores, alternativas rejeitadas, triggers e outcomes antes de nova recomendação.

### `context-gap-analysis`

Identifica informação ausente que impede análise confiável e formula perguntas mínimas.

## Evidence and research

### `primary-source-research`

Prioriza documentação oficial, papers e standards; preserva datas, versões e citations.

### `evidence-normalization`

Separa claim, quote/derived passage, source metadata, corroboration e contradiction.

### `competitive-landscape`

Mapeia concorrentes, substitutes, adjacent solutions, pricing/position changes e user sentiment sem transformar marketing em fato.

### `technology-horizon-scan`

Monitora releases, EOL, deprecations, RFCs, benchmarks e adoption maturity.

### `regulatory-impact-triage`

Identifica possível impacto regulatório e encaminha especialista humano; não oferece parecer jurídico final.

## Product intelligence

### `problem-solution-challenge`

Testa se problema, urgency e proposed solution permanecem válidos.

### `differentiation-review`

Liga changes de mercado/IA à proposition e identifica commodity risk.

### `hypothesis-design`

Converte suposição em hipótese falsificável, metric e decision threshold.

### `continuous-discovery-synthesis`

Agrupa feedback e behavior signals em themes com segment e evidence.

### `roadmap-impact-analysis`

Relaciona signal a outcomes, initiatives e dependencies; não reprioriza sozinho.

### `sunset-readiness`

Avalia baixo uso, substituição, consumer dependencies, retention e exit plan.

## Architecture

### `architecture-recovery`

Propõe componentes, interfaces, data flows e boundaries a partir de sources; rotula inference.

### `architecture-drift-analysis`

Compara declared/observed/expected e produz violations com blast radius.

### `architecture-option-analysis`

Compara alternativas contra NFRs, constraints, cost, reversibility e team fit.

### `adr-authoring`

Produz draft ADR com context, decision, alternatives, consequences e review triggers.

### `fitness-function-design`

Converte architecture characteristic em check mensurável, threshold, owner e cadence.

### `distributed-impact-analysis`

Percorre APIs, events, data and repo dependencies para construir impact set com confidence.

## Code and modernization

### `dependency-health-review`

Interpreta SBOM, EOL, CVE, release age, compatibility e test coverage.

### `modernization-path-planning`

Define incremental path, canaries, transformations, fallback e proof.

### `codebase-cognitive-debt-review`

Avalia hotspots, duplication, dead code, knowledge/documentation gap e agent context pollution.

### `documentation-drift-review`

Compara docs/contracts/ADRs e implementation, produz patch proposal separado.

### `test-gap-analysis`

Relaciona change risks a missing behavioral, integration, contract e architecture tests.

## Harness intelligence

### `harness-inventory`

Mapeia agent definitions, models, prompts, skills, MCPs, hooks, memory, permissions, evals e costs.

### `skill-lifecycle-audit`

Detecta skills unused, overlapping, stale, conflicting ou sem eval.

### `mcp-capability-audit`

Mapeia tools, write surface, auth, audience, schemas, health e unnecessary exposure.

### `instruction-debt-review`

Identifica workarounds, contradictions, duplicated policy in prompts e model-specific scaffolding.

### `model-upgrade-experiment`

Desenha comparison por task slices, cost, latency, tool use, security e regressions.

### `context-strategy-review`

Avalia retrieval, progressive disclosure, memory, token budget e stale context.

### `agent-eval-design`

Cria dataset, invariants, rubrics, negative cases e promotion thresholds.

## Runtime, cost and security

### `runtime-fit-analysis`

Liga SLO, traces, errors, capacity e architecture decisions.

### `cost-change-analysis`

Calcula total cost, migration cost, uncertainty e sensitivity; não usa apenas provider list price.

### `threat-modeling`

Identifica assets, boundaries, threats, controls e verification.

### `data-boundary-review`

Mapeia classification, residency, movement, retention e model/tool exposure.

### `module-supply-chain-review`

Valida provenance, SBOM, signatures, permissions e publisher trust.

## Change and verification

### `evolution-proposal-authoring`

Compõe finding, alternatives, scoring, plan, proof e approval requirements no schema oficial.

### `proposal-challenge`

Procura causal gaps, contradictory evidence, hype, missing non-action e hidden cost.

### `experiment-design`

Define hypothesis, baseline, variant, guardrails, duration, analysis e stop conditions.

### `migration-wave-design`

Forma cohorts, canaries, waves, exception e rollback.

### `verification-plan`

Define deterministic checks, evals, operational and product measures antes da implementação.

### `outcome-learning`

Relaciona result a decisão, atualiza review triggers e preserva uncertainty.

## Portfolio

### `portfolio-pattern-detection`

Encontra causas comuns sem agrupar por keyword apenas.

### `campaign-candidate-analysis`

Avalia similaridade, readiness e shared transformation potential.

### `portfolio-risk-narrative`

Produz visão executiva com lineage e evita ranking punitivo.

## Critérios de qualidade de cada skill

- Descrição define quando usar e quando não usar.
- Instrução principal permanece concisa; referências são sob demanda.
- Inputs e outputs são explícitos.
- Capabilities necessárias são mínimas.
- Casos adversariais e activation negatives existem.
- Mudança de modelo ou spec dispara eval.
- Owner, version, compatibility e deprecation estão definidos.

