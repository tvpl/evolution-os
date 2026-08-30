# Especificação — Evolution Module Package

**Kind:** `EvolutionModule`  
**API version inicial:** `evolutionos.io/v1alpha1`

## 1. Objetivo

Descrever e distribuir uma extensão com compatibilidade, capabilities, dados, side effects, runtime, provenance e evals verificáveis.

## 2. Metadata

- `id`: reverse-DNS global ID.
- `name`, `description`.
- `version`: SemVer.
- `publisher`: identity reference.
- `license`.
- `homepage`, `source`, `support`.
- `releaseChannel`: dev/community/verified/private.

## 3. Compatibility

- Hub protocol range.
- Node protocol range.
- OS/architecture/runtime.
- Required module dependencies/conflicts.
- Schema versions.
- Optional feature capabilities.

Dependency ranges are resolved to exact digests in `modules.lock`.

## 4. Components

Cada component:

- `id`, `type`, `entrypoint`.
- input/output schema refs.
- execution location: hub/node/either.
- runtime: declarative/wasm/container/process/skill.
- timeout/resource limits defaults.
- capabilities required.
- data classifications accepted/produced.
- network destinations.
- side effects and idempotency.
- config schema and secret references.

Component types: sensor, analyzer, skill, policyPack, connector, mcpAdapter, executor, uiContribution, ontologyExtension, evalPack, transformation.

## 5. Skills

- Path to `SKILL.md`.
- Activation description.
- Allowed agent roles/task classes.
- Capability requirements.
- Output schema.
- Eval refs.

Skill instruction cannot request undeclared capabilities.

## 6. Security material

- Package digest.
- Signature/attestation refs.
- SPDX SBOM.
- SLSA provenance.
- Vulnerability scan ref/time.
- Publisher trust tier.
- Data handling declaration.

## 7. Permissions

Capabilities are declared individually, with reason and constraints. Wildcards are prohibited in verified modules except bounded read namespace approved by governance.

Upgrade permission diff is a first-class artifact:

- added/removed/changed capability;
- data classification change;
- new network destination;
- side-effect change;
- runtime/isolation change.

## 8. Evals and conformance

Module includes:

- manifest/schema validation;
- component contract tests;
- activation positive/negative tests;
- security/adversarial cases;
- sample project fixture;
- expected artifacts;
- compatibility matrix.

Verified tier defines thresholds and human review.

## 9. Lifecycle

- Install pins digest.
- Activate per project/profile.
- Update staged/canary.
- Rollback restores prior digest/config.
- Quarantine blocks new runs and marks affected results.
- Uninstall preserves historical provenance/artifacts.
- Deprecation includes replacement and deadline.

## 10. Example

Ver [`examples/evolution.module.example.yaml`](../../examples/evolution.module.example.yaml).

