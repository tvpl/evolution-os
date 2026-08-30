# Observabilidade e evals

## 1. Dois planos distintos

### Platform observability

Entender disponibilidade, performance, custo e falhas do Hub, Nodes, connectors e storage.

### Agentic observability

Entender trajetória, contexto, tools, policy, qualidade e outcome dos agentes.

Observability data não substitui audit. Logs podem ser amostrados/retidos de forma diferente; decisões e side effects materiais exigem registro próprio.

## 2. OpenTelemetry

Usar OTel para traces, metrics e logs, propagando:

- tenant/workspace/project IDs pseudonimizados conforme policy;
- run/plan/task IDs;
- agent role;
- module/skill/model versions;
- connector/tool identifiers;
- policy decision ID;
- classification band;
- cost and token measures;
- error category.

Não incluir prompts completos, secrets, source code ou customer data por default.

## 3. Trace model

```text
evolution.run
├── context.assemble
├── policy.evaluate
├── agent.plan
├── task.execute
│   ├── skill.activate
│   ├── model.invoke
│   └── tool.call
├── artifact.validate
├── challenge.execute
├── approval.wait
└── verification.execute
```

Cada span liga a audit/event IDs quando aplicável.

## 4. Métricas de plataforma

- API latency/error/saturation.
- Queue depth e task age.
- Workflow completion/timeout.
- Connector health/rate limit/freshness.
- Node heartbeat/sync lag.
- Storage/search projection lag.
- Model/provider availability/cost.
- Module failures/quarantine.
- Tenant quotas and noisy-neighbor indicators.

## 5. Métricas agentic

- task success e verified outcome;
- grounded claim rate;
- tool selection correctness;
- unauthorized request rate;
- context utilization/retrieval precision;
- schema-valid output rate;
- human correction/intervention;
- proposal usefulness/acceptance por tipo;
- false-positive recurrence;
- tokens/cost/latency por outcome;
- loop/retry rate;
- rollback/regression.

Acceptance não é equivalente a correctness: pode refletir viés humano. Verified outcomes e long-term metrics têm peso separado.

## 6. Eval pyramid

### L0 — Deterministic tests

Schemas, policies, parsers, graph rules, idempotency, redaction e permissions.

### L1 — Component evals

Skill activation, extraction, classification, retrieval e tool selection.

### L2 — Workflow evals

End-to-end proposal, challenger, approval routing e experiment plan.

### L3 — Scenario/gauntlet

Ambiguous, conflicting, malicious, stale, incomplete e enterprise-scale cases.

### L4 — Shadow/canary

Comparar versão nova sem impactar decisões; promover progressivamente.

### L5 — Outcome evaluation

Resultado real da decisão após janela definida.

## 7. Evals obrigatórios

- Groundedness e citation/evidence correctness.
- Relevance to project.
- Distinção fact/inference/recommendation.
- Contradictory evidence handling.
- Hype/newness resistance.
- Decision memory retrieval.
- Tool/capability compliance.
- Prompt injection resistance.
- PII/secret leakage.
- Proposal completeness.
- Alternative and do-nothing coverage.
- Confidence calibration.
- Cross-tenant isolation.
- Long-running checkpoint continuity.

## 8. Golden datasets

Cada eval case inclui:

- versioned project snapshot;
- evidence set;
- allowed tools/capabilities;
- expected invariants;
- acceptable output ranges;
- forbidden outcomes;
- human rubric;
- proof artifacts.

Não exigir texto exato quando múltiplas respostas são válidas. Use invariants e structured fields.

## 9. Promotion gate

Mudança de model, prompt, skill, policy ou module:

1. contract/security tests;
2. offline eval comparison;
3. failure slice review;
4. shadow runs;
5. canary por projects de baixo risco;
6. monitor guardrails;
7. promote ou rollback;
8. registrar decision e review trigger.

Melhoria média não compensa regressão em security/policy critical slices.

## 10. Dashboards operacionais

- Run explorer.
- Model/skill version comparison.
- Failure clusters.
- Cost per verified outcome.
- Policy denial/override trends.
- Node/connectors freshness.
- Eval promotion board.
- Data quality and lineage gaps.

## 11. Retenção

Raw prompts/tool results podem ser desabilitados ou redigidos. Structured trace metadata tem retenção configurável. Audit e decisions seguem políticas próprias. Datasets derivados de produção exigem consentimento/classification e sanitização.

