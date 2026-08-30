# Registro de riscos

Escalas: Probabilidade (P) e Impacto (I): 1 baixo–5 crítico.

| ID | Risco | P | I | Mitigação | Trigger/owner |
|---|---|---:|---:|---|---|
| R-01 | Recomendações genéricas ou hype-driven | 4 | 5 | Evidence-first, project linkage, Challenger, evals | Useful rate/false-positive — Product AI |
| R-02 | Usuários não confiam na plataforma | 4 | 5 | Lineage, score breakdown, read-only start, human control | Rejection reason/trust research — Product |
| R-03 | Alert fatigue | 5 | 4 | Dedup, relevance threshold, batching, watch state, personal Inbox | Items/user/week — Product |
| R-04 | Prompt injection por fonte externa | 4 | 5 | Quarantine, instruction/data separation, no tools in extraction, evals | Injection test/incident — Security |
| R-05 | Módulo/MCP supply-chain compromise | 3 | 5 | Signature, digest, SBOM, provenance, capability limits, quarantine | Advisory/signature failure — Platform Security |
| R-06 | Cross-tenant leakage | 2 | 5 | Server-derived tenant, isolation tests, scoped indexes/caches | Any leak = sev0 — Security |
| R-07 | Agente executa ação fora do aprovado | 3 | 5 | Exact plan digest, capability broker, sandbox, audit | Scope mismatch — Runtime |
| R-08 | Side effect duplicado após timeout | 3 | 5 | Idempotency + status reconciliation | Unknown outcome rate — Integrations |
| R-09 | Project Twin incorreto/stale | 4 | 4 | Four truth states, freshness, human confirmation, conflict | Coverage/freshness — Registry |
| R-10 | Knowledge graph se torna inconsistente | 3 | 4 | Relational SoR, versioned edges, projections rebuildable | Projection lag/validation — Data |
| R-11 | Node complexity impede adoção | 4 | 4 | Standalone packaging, doctor, managed installer, SaaS metadata option | Onboarding drop — Node DX |
| R-12 | Federated protocol divergence | 3 | 4 | Compatibility range, conformance suite, upgrade campaign | Unsupported Node % — Platform |
| R-13 | Custos de modelo/processamento explodem | 4 | 4 | Budgets, batching, deterministic first, model routing, cache | Cost/project — FinOps |
| R-14 | LLM provider/model changes behavior | 5 | 4 | Version pin, eval gates, shadow/canary, qualified fallback | Eval regression — AI Platform |
| R-15 | Code sent to unauthorized provider | 2 | 5 | Locality policy, classification, provider eligibility, egress controls | Data boundary violation — Security |
| R-16 | Marketplace vira vetor de risco | 3 | 5 | Private/verified first, OCI signing, review tiers | Public launch gate — Ecosystem |
| R-17 | Overengineering antes de product-market fit | 4 | 4 | Vertical slice, modular monolith, postpone marketplace/microservices | Lead time/no usage — Product/Architecture |
| R-18 | Product intelligence sources têm licença/restrições | 3 | 4 | Source contracts, references, retention/licensing metadata | Takedown/contract — Legal/Product |
| R-19 | Confidence score interpretado como certeza | 4 | 4 | Bands + decomposition + epistemic labels + training | UX research — Product |
| R-20 | Auto-evolution destabiliza EvolutionOS | 3 | 5 | Self project, independent approvals, eval/shadow/canary, no runtime self-modification | Guardrail breach — Platform |
| R-21 | Enterprise policy paralisa teams | 3 | 4 | Exceptions, local decision, explainable policies, canaries | Approval lead time — Governance |
| R-22 | Architecture-as-code standard changes | 3 | 3 | Internal metamodel + adapters, proposed ADR/spike | CALM breaking change — Architecture |
| R-23 | Graph/vector retrieval leaks restricted data | 3 | 5 | Auth before retrieval, scoped indexes, negative tests | Retrieval incident — Data Security |
| R-24 | Human review vira bottleneck | 4 | 4 | Risk routing, batching, autonomy promotion by class, proof summaries | Queue age — Governance |
| R-25 | Rejected choices keep returning | 4 | 3 | Decision memory, semantic/graph lookup, new-evidence gate | Repeat rate — Evolution Engine |

## Risk review cadence

- Security/material action risks: every release and incident.
- Product trust/noise: monthly during beta.
- Architecture/scale: each milestone exit.
- Enterprise/residency/legal: before pilot contract.
- Marketplace: before enabling any third-party package.

## Stop conditions

- Any unauthorized action or cross-tenant leak freezes autonomy expansion.
- Injection leading to tool request freezes external-source workflows.
- Proposal usefulness below agreed threshold blocks addition of more sources.
- Node unable to enforce sync classification blocks enterprise pilot.
- Hard-fail eval regression blocks model/skill/module promotion.

