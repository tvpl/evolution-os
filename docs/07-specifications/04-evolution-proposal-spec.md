# Especificação — Evolution Proposal

## 1. Objetivo

Padronizar o caso de mudança. Uma proposal é reviewable, versioned e policy-routable; não é apenas um texto de recomendação.

## 2. Lifecycle

`draft → investigating → readyForReview → underReview → decided → executing → verifying → closed`

Terminal outcomes: rejected, deferred, superseded, expired, adopted, rolledBack, inconclusive.

## 3. Estrutura

### Identity/context

- ID/version/status.
- Project/snapshot.
- Finding/signal refs.
- Proposal type: watch, experiment, adopt, migrate, redesign, retire, baselineChange.
- Authors: agents/humans and versions.
- Created/updated/expiry.

### Executive case

- title.
- summary.
- why now.
- intended outcome.
- cost of inaction.

### Evidence

- supporting claims/evidence.
- contradicting/weakening evidence.
- assumptions and unknowns.
- coverage/freshness.

### Impact

- affected entities/artifacts/decisions/hypotheses.
- direct/indirect impacts.
- blast radius.
- stakeholders/owners.
- product, architecture, security, data, operations, harness, cost dimensions.

### Alternatives

Each alternative:

- ID/name/description.
- includes `do nothing/watch` when valid.
- benefits and drawbacks.
- effort/cost/time range.
- risk/urgency/reversibility.
- strategic fit.
- prerequisites.
- evidence/uncertainty.

### Recommendation

- recommended alternative and rationale.
- score decomposition.
- Challenger counter-analysis.
- conditions that would change recommendation.

### Plan

- experiment/change stages.
- dependencies.
- exact target/scope.
- capabilities.
- data/environment.
- canary/waves.
- communication/migration.

### Verification

- hypothesis.
- baseline/metrics.
- deterministic checks/evals.
- guardrails/stop conditions.
- proof artifacts expected.
- observation window.

### Safety/governance

- risk class.
- policy decision/ref.
- required approvers.
- separation of duties.
- rollback/compensation.
- approval expiry.

## 4. Decision

Decision object references exact proposal version/digest and records:

- accept/reject/defer/investigate/experiment/supersede;
- actor/role/time;
- rationale;
- selected alternative;
- conditions/capabilities;
- review triggers;
- dissent/exception when relevant.

## 5. Invariants

- Proposal material has at least one evidence-backed claim or explicit investigation state.
- Facts/inferences/recommendations separated.
- Approval invalid if proposal/plan digest changes.
- Reject/defer records trigger/date.
- Verification criteria fixed before result.
- Baseline change proposal separate from drift remediation.
- Score cannot be sole rationale.
- Agent version lineage required.

## 6. Rendering

The same object can render as:

- dashboard workspace;
- concise executive brief;
- Markdown/RFC;
- issue/PR description;
- campaign item;
- audit export.

Renderers never omit contrary evidence in material decision views.

