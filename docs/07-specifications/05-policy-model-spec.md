# Especificação — Policy e approval model

## 1. Objetivo

Decidir deterministicamente quem/qual workload pode realizar uma capability sobre um resource, em que contexto e com quais aprovações/controles.

## 2. Input de policy

- principal: human/workload/Node/agent delegation.
- tenant/workspace/project.
- action/capability.
- resource/target/environment/branch.
- data classifications.
- run/task/proposal/plan digest.
- module/tool/model identities/versions.
- risk dimensions.
- requested duration/volume.
- current health/revocation state.
- prior approvals/exceptions.

## 3. Output

- `permit`, `deny`, `requireApproval`, `requireControl`, `reduceScope`.
- constraints.
- required approver roles/count/separation.
- required checks/proofs.
- expiry/lease.
- explanation codes and policy bundle version.

## 4. Policy layers

1. Platform mandatory controls.
2. Organization.
3. Workspace/domain.
4. Project.
5. Environment/resource.
6. Task-specific grant.

Effective permission is intersection/most restrictive. Lower layer cannot override platform mandatory deny. Exceptions are explicit objects evaluated by higher-authority policy.

## 5. Capability grant

- exact capability.
- resource selectors.
- allowed actions/parameters limits.
- validity window.
- max uses/volume.
- bound task/plan digest.
- issuedBy/policy decision.
- revocation status.

## 6. Approval policy examples

- A0/A1 read public/internal project data: pre-authorized by project setup.
- A2 restricted code sandbox: owner approval or organization rule.
- A3 draft PR: code owner; security if data/tool boundary changes.
- Module capability elevation: platform admin + security.
- Architecture baseline change: architecture owner + affected owners.
- A4 auto-merge deterministic patch: allowlisted recipe + full proof + branch policy.

## 7. Exceptions

Exception contains scope, rationale, owner, compensating controls, expiry, review, approvers and linked risk. No permanent exception by default. Expired exception denies and opens review item.

## 8. Explainability

Every decision returns machine code and human explanation:

- matched rules;
- denied/required condition;
- scope reduction;
- next possible action;
- policy version.

Avoid exposing sensitive resource existence in denial.

## 9. Evaluation and tests

- Table-driven positive/negative matrix.
- Cross-tenant/resource tests.
- Capability wildcard tests.
- Expiry/revocation.
- Changed plan digest.
- Module permission diff.
- Node offline cached bundle and staleness.
- Break-glass humans only.

## 10. Implementation

OPA/Rego-compatible bundles are preferred first implementation, but domain contract is engine-neutral. Node caches signed policy bundle and enforces local ceiling.

