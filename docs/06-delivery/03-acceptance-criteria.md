# Critérios de aceite transversais

## Projeto e memória

- [ ] Ideia é cadastrável sem repo/stack.
- [ ] Repo pode mapear múltiplos services/products.
- [ ] Declared, observed, inferred e expected não são misturados.
- [ ] Artifact/decision têm versões e provenance.
- [ ] Rejected decision é encontrada antes de nova proposal relacionada.
- [ ] Review trigger reabre decisão sem apagar histórico.

## Evidência

- [ ] Fonte, timestamp, version/digest e classification existem.
- [ ] Claim navega para evidence.
- [ ] Contradiction permanece visível.
- [ ] External injection não se torna instruction.
- [ ] Deleted/unavailable source marca derivados.
- [ ] Confidence breakdown é acessível.

## Proposal

- [ ] Finding e affected entities.
- [ ] Why now e cost of inaction.
- [ ] Alternatives including do nothing/watch.
- [ ] Benefit, effort, risk, urgency, reversibility.
- [ ] Assumptions/unknowns.
- [ ] Experiment/change plan.
- [ ] Verification and rollback.
- [ ] Policy/approvers.
- [ ] Evidence favorable e contrary.

## Agentic runtime

- [ ] Run pins snapshot and versions.
- [ ] Task has capability and budget ceiling.
- [ ] Context is authorized and minimal.
- [ ] Tool schema/output validated.
- [ ] Retry semantics match error class.
- [ ] Checkpoint survives process restart.
- [ ] Loop/budget exhaustion terminates safely.
- [ ] Human intervention is durable.

## Node

- [ ] Standalone works offline for local analysis.
- [ ] Managed enrollment and revocation.
- [ ] Metadata-only proven.
- [ ] Spool/reconnect idempotent.
- [ ] Signed task validation.
- [ ] Module verification and sandbox.
- [ ] Upgrade rollback.

## Security

- [ ] Cross-tenant negative tests.
- [ ] No secret in prompt/log/trace/artifact.
- [ ] OAuth token audience and no passthrough.
- [ ] Approval bound to exact digest.
- [ ] Unknown side effect reconciled.
- [ ] Prompt injection suite.
- [ ] Module signature/SBOM/provenance.
- [ ] Kill switch/revocation tested.

## Next.js UX

- [ ] WCAG 2.2 AA critical flows.
- [ ] Initial attention view is actionable.
- [ ] Evidence in ≤3 navigation layers.
- [ ] Score decomposable.
- [ ] Streaming reconnect/resume.
- [ ] No data leak through URL/cache/error.
- [ ] Idea mode has no empty technical dependency.

## Evals

- [ ] Golden and holdout cases versioned.
- [ ] Hard fails zero for promoted material workflow.
- [ ] Contradictory/stale/malicious cases.
- [ ] Longitudinal scenario.
- [ ] Shadow/canary before provider/harness promotion.
- [ ] Cost and latency measured per verified outcome.

## Operations

- [ ] SLOs and alerts.
- [ ] Backup/restore drill.
- [ ] Schema/Node/module compatibility.
- [ ] Partial failure visible.
- [ ] Data retention/deletion workflow.
- [ ] Runbook and rollback.

