# Validation Report — slice-4-experiment-loop

- **Result**: PASS
- **Date**: 2026-09-01
- **Spec**: `.specs/features/slice-4-experiment-loop/spec.md`
- **Diff range**: `c2e6a19..5454cc0` (round 1) plus the round-2 gap-fix commit
- **Verifier**: independent sub-agent (author ≠ verifier), evidence-or-zero, across 2 rounds

**Final verdict**: ✅ **PASS** — see [Round 2 — gaps closed](#round-2--gaps-closed) at the bottom of this file. All 15 EXP-NN acceptance criteria verified on value; all 13 round-1 mutations plus the round-2 sensor spot-checks killed; gate green.

History below is kept for audit: round 1 ended in a FAIL that was routed to fix tasks and re-verified, per the skill's bounded fix→re-verify loop. Only the final verdict above reflects the feature's current, shipped state.

**Round 1 outcome (`5454cc0`)**: gate and typecheck were green, but the discrimination sensor found 5 surviving mutants, one of which invalidated the slice's own central design claim (digest canonicality), and two acceptance criteria (EXP-02, EXP-03) were only half-covered. Closed by round 2 (test-only fixes, no implementation change).

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1 — migration 005 + capability grant | ✅ Done | `870522a`; `apps/hub/migrations/005_experiments.sql`, grant for both dev tenants |
| T2 — extract `canonicalJson` | ✅ Done | `e6b2107`; byte-for-byte extraction verified against the pre-slice body |
| T3 — start experiment | ✅ Done | `f827db1` |
| T4 — proof artifacts | ✅ Done | `f301d50` |
| T5 — deterministic evaluation | ✅ Done | `9176978` |
| T6 — close with preserved decision | ✅ Done | `0b62c4f` |
| T7 — slice closure docs | ✅ Done | `3be0d09` |

All 7 tasks committed atomically; commit messages are Conventional-Commits shaped.

---

## Spec-Anchored Acceptance Criteria

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| **EXP-01** start on `readyForReview` with 2 variants + complete plan | experiment `status='running'`, **canonical** content digest captured, proposal → `status='executing'` | `apps/hub/test/experiments-start.test.ts:91` `expect(body.status).toBe("running")`; `:97` `expect(experimentRow.rows[0].status).toBe("running")`; `:98` `expect(...proposalDigest).toBe(body.proposalDigest)`; `:101` `expect(proposalRow.rows[0].status).toBe("executing")`; `:92` `expect(body.proposalDigest).toMatch(/^sha256:/)` | ⚠️ **Partial** — status + transition proven; the *canonical* clause has **no** evidence (see Sensor M5) |
| **EXP-02** `variants.length !== 2` → 422, no row | 422, zero rows created | `apps/hub/test/experiments-start.test.ts:113` `expect(res.statusCode).toBe(422)`; `:114` `expect(res.json().title).toBe("invalid_variants")`; `:118` `expect(after.rows[0].n).toBe(before.rows[0].n)` | ❌ **Gap** — only the *too few* direction (length 1) is exercised; a 3-variant payload is accepted with no test failing (Sensor M12) |
| **EXP-03** plan missing any of 5 fields → 422, no row | 422 for **any** missing field | `apps/hub/test/experiments-start.test.ts:125` `expect(res.statusCode).toBe(422)`; `:126` `expect(res.json().title).toBe("invalid_verification_plan")` | ❌ **Gap** — only `threshold` is omitted; `hypothesis`, `baselineMetric`, `comparison`, `observationWindow` checks are unverified (Sensor M13) |
| **EXP-04** proposal not `readyForReview` → 409 | 409 | `apps/hub/test/experiments-start.test.ts:138` `expect(res.statusCode).toBe(409)` | ✅ PASS |
| **EXP-05** attach existing project artifact to `running` experiment, no duplicate record | link created; attaching twice does not duplicate | `apps/hub/test/experiments-artifacts.test.ts:109` `expect(res.statusCode).toBe(201)`; `:115` `expect(row.rows[0].n).toBe(1)`; `:124` `expect(second.statusCode).toBe(201)`; `:130` `expect(row.rows[0].n).toBe(1)` | ✅ PASS |
| **EXP-06** artifact from another project → 422 | 422 | `apps/hub/test/experiments-artifacts.test.ts:138` `expect(res.statusCode).toBe(422)`; `:139` `expect(res.json().title).toBe("invalid_artifact_reference")` | ✅ PASS |
| **EXP-07** list returns every linked artifact | every linked artifact returned | `apps/hub/test/experiments-artifacts.test.ts:162` `expect(ids.sort()).toEqual([a1, a2].sort())` | ⚠️ **Spec-precision gap** — identity proven; the returned `type`/`title` payload fields are never asserted on value (Sensor M11), the same defect class caught 3× in the Slice 3 round |
| **EXP-08** observed value satisfying threshold per `comparison` → `verdict='hypothesis_met'`, `status='evaluated'` | `hypothesis_met` + `evaluated`, for **both** `gte` and `lte` | `apps/hub/test/evaluate-experiment.test.ts:22-23` `expect(evaluateExperiment(gtePlan, 10 \| 15).verdict).toBe("hypothesis_met")`; `:31-32` `expect(evaluateExperiment(ltePlan, 100 \| 50).verdict).toBe("hypothesis_met")`; `apps/hub/test/experiments-evaluate.test.ts:108` `expect(row.rows[0].verdict).toBe("hypothesis_met")`; `:107` `expect(row.rows[0].status).toBe("evaluated")`; `:109` `expect(row.rows[0].observedValue).toBe(90)` | ✅ PASS — both operators, both at the boundary (`>=`/`<=` equality) and strictly inside |
| **EXP-09** observed value not satisfying threshold → `verdict='hypothesis_not_met'`, `status='evaluated'` | `hypothesis_not_met` + `evaluated`, both operators | `apps/hub/test/evaluate-experiment.test.ts:27` `expect(evaluateExperiment(gtePlan, 9).verdict).toBe("hypothesis_not_met")`; `:36` `expect(evaluateExperiment(ltePlan, 101).verdict).toBe("hypothesis_not_met")`; `apps/hub/test/experiments-evaluate.test.ts:115` `expect(res.json().verdict).toBe("hypothesis_not_met")` | ✅ PASS — both directions exercised |
| **EXP-10** explicit `null` → `verdict='inconclusive'` with rationale stating the metric was unavailable, `status='evaluated'` | `inconclusive` + rationale + `evaluated` | `apps/hub/test/evaluate-experiment.test.ts:41` `expect(result.verdict).toBe("inconclusive")`; `:42` `expect(result.rationale).toMatch(/unavailable/)`; `apps/hub/test/experiments-evaluate.test.ts:122` `expect(res.json().verdict).toBe("inconclusive")`; `:127` `expect(row.rows[0].observedValue).toBeNull()` | ⚠️ **Partial** — verdict + rationale proven; the `status='evaluated'` transition is **not** asserted on the DB for the `null` path (the route hardcodes `status: "evaluated"` in the response body at `routes.ts:898`, so the response assertion is not evidence) |
| **EXP-11** omitting the observed-value field → 422, no verdict persisted | 422, verdict stays null | `apps/hub/test/experiments-evaluate.test.ts:133` `expect(res.statusCode).toBe(422)`; `:134` `expect(res.json().title).toBe("invalid_observation")`; `:136` `expect(row.rows[0].verdict).toBeNull()`; `:137` `expect(row.rows[0].status).toBe("running")` | ✅ PASS (strongest conjunction in the slice) |
| **EXP-12** evaluate a non-`running` experiment → 409 | 409 | `apps/hub/test/experiments-evaluate.test.ts:154` `expect(res.statusCode).toBe(409)` | ✅ PASS |
| **EXP-13** close `evaluated` → decision via generic mechanism (`subjectType='proposal'`, `subjectId=<proposal>`), experiment → `closed`, proposal → `closed` | all four effects | `apps/hub/test/experiments-close.test.ts:117-121` `expect(res.json().decision).toMatchObject({ decision: "accept", subjectType: "proposal", subjectId: proposalId })`; `:124` `expect(expRow.rows[0].status).toBe("closed")`; `:126` `expect(propRow.rows[0].status).toBe("closed")`; `:132` `expect(decisionRow.rows[0]).toEqual({ subject_type: "proposal", subject_id: proposalId })` | ✅ PASS |
| **EXP-14** close a not-`evaluated` experiment → 409 | 409 | `apps/hub/test/experiments-close.test.ts:138` `expect(res.statusCode).toBe(409)` | ✅ PASS (only the `running` wrong-state is exercised; closing an already-`closed` experiment is untested — minor) |
| **EXP-15** closing surfaces prior related decisions on the same proposal | prior decisions returned | `apps/hub/test/experiments-close.test.ts:198` `expect(prior).toHaveLength(1)`; `:199` `expect(prior[0]).toMatchObject({ decision: "defer", subjectId: proposalId })` | ✅ PASS — asserts the actual prior decision verb and subject, not mere presence |

**Status**: 9/15 ✅ full PASS · 2 ❌ AC-level gaps (EXP-02, EXP-03) · 3 ⚠️ partial/precision gaps (EXP-01, EXP-07, EXP-10) · 1 ✅ with a minor note (EXP-14)

---

## Digest Determinism Claim (design's central decision)

The design (`design.md:12-14`, `:121`) and the spec's first Assumption (`spec.md:33`) rest on one claim: the digest must be computed with `canonicalJson` over the proposal's material fields **read from the database**, because Postgres `jsonb` does not preserve key insertion order and raw `JSON.stringify` "reintroduziria a mesma classe de bug" fixed in Slice 2.

**Half of that claim is proven; half is not.**

- ✅ *Read from the DB, not the payload*: `apps/hub/src/evolution/experiments.ts:61-79` selects the proposal first and digests the selected row. No test forces this, but the request payload carries no proposal fields at all, so the property is structurally guaranteed.
- ❌ *Canonical serialization*: no test distinguishes `canonicalJson` from `JSON.stringify`. The only digest test — `apps/hub/test/experiments-start.test.ts:146-152`, two proposals with identical content producing the same digest — passes identically under both, because both rows come back from the same query with the same key order. Replacing `canonicalJson(fields)` with `JSON.stringify(fields)` at `experiments.ts:46` leaves **all 211 hub tests green** (Sensor M5).
- The extracted util's own tests (`apps/hub/test/canonical-json.test.ts:5-27`) do prove key-order stability for `canonicalJson` in isolation — but nothing ties that property to the digest. A future refactor of `computeProposalDigest` back to `JSON.stringify` would ship undetected.

**What is missing**: a test that persists two proposals whose `alternatives` jsonb differs only in key insertion order and asserts equal digests (or, cheaper and equally decisive, a direct unit assertion that `computeProposalDigest` returns the same value for two field objects with different key ordering).

---

## Established Risk Patterns from This Codebase's History

| Pattern | Finding | Evidence |
| ------- | ------- | -------- |
| (a) Raw `JSON.stringify` comparison of jsonb-sourced data reintroduced | ✅ Clean. The 4 hits in `experiments.ts:93,94,95,224` are all `jsonb` **parameter binding** for writes, never comparison; `canonical-json.ts:8,10` are the util's own leaf serialization. No `payloadEquals`-style comparison was reintroduced. | grep over the diff surface |
| (b) Capability grant for only one dev tenant | ✅ Clean. Both tenants granted (`apps/hub/src/policy/policy.ts:97`, `:112`) **and** asserted for both (`apps/hub/test/experiments-migration.test.ts:38-45` loops `["org_dev_a", "org_dev_b"]`). The Slice 3 T1 bug did not recur. | — |
| (c) 404-vs-403 ordering | ✅ Clean. `requireOwnedProject` is the first check on all 6 new routes — `routes.ts:781, 823, 835, 866, 879, 911` — and it returns 404 for a missing project before the 403 cross-tenant branch (`routes.ts:56-77`). `enforceCapability` always runs after it. | — |
| (d) State-transition guards not gating every wrong state | ⚠️ **Partial.** `submitEvaluation` (`experiments.ts:217`) and `closeExperiment` (`experiments.ts:253`) guards are discriminated (Sensor M6, and the double-evaluate test). But `attachProofArtifact`'s `running` guard (`experiments.ts:143`) is **completely untested** — deleting it leaves all 211 tests green (Sensor M10). No test attaches an artifact to an `evaluated` or `closed` experiment. | Sensor M10 |
| Cross-tenant coverage on **every** new route (spec Edge Case, `spec.md:118`) | ⚠️ **Gap.** 403 is asserted for 3 of 6 new routes: start (`experiments-start.test.ts:190`), evaluate (`experiments-evaluate.test.ts:175`), close (`experiments-close.test.ts:215`). `GET /experiments/:id`, `POST /experiments/:id/artifacts` and `GET /experiments/:id/artifacts` have no cross-tenant test. | — |
| Cross-project proposal → 404 (spec Edge Case, `spec.md:117`) | ⚠️ Minor. `experiments-start.test.ts:141-144` uses a non-existent proposal id, not a proposal that genuinely exists in another project. Same code path (`where id=$1 and project_id=$2`), so the risk is low, but the stated edge case is not literally exercised. | — |

---

## Slice 2 Regression (canonicalJson extraction)

- `apps/hub/src/twin/cartographer.ts:4` now imports `canonicalJson` from `../platform/canonical-json.js`; the local copy at the old `cartographer.ts:44-52` is deleted. `payloadEquals` (`cartographer.ts` unchanged body) calls the imported function.
- Extraction is byte-for-byte: `git diff c2e6a19..5454cc0 -- apps/hub/src/twin/cartographer.ts` shows the removed block and `apps/hub/src/platform/canonical-json.ts:1-11` are character-identical apart from `function` → `export function`.
- `apps/hub/test/candidates.test.ts` (8 tests) and `apps/hub/test/diff.test.ts` (5 tests) — both untouched by this slice — pass on the clean tree. No Slice 2 behavior change.

---

## Discrimination Sensor

Method: faults injected directly into the real working tree, relevant test file(s) run, then `git checkout -- <file>` before the next mutation (never `git stash`). Pre-sensor baseline: `git status --porcelain` empty. Post-sensor: `git status --porcelain` empty and `git diff` empty — **isolation verified, tree matches baseline exactly**.

| # | File:line | Mutation | Tests run | Killed? |
| - | --------- | -------- | --------- | ------- |
| M1 | `apps/hub/src/evolution/experiments.ts:189` | `gte`: `observedValue >= threshold` → `> threshold` (boundary) | `evaluate-experiment.test.ts` | ✅ Killed (1 failed) |
| M2 | `apps/hub/src/evolution/experiments.ts:189` | `lte`: `observedValue <= threshold` → `< threshold` (boundary) | `evaluate-experiment.test.ts` | ✅ Killed (1 failed) |
| M3 | `apps/hub/src/evolution/experiments.ts:98` | Removed the required side effect `update proposals set status='executing'` | `experiments-start.test.ts` | ✅ Killed (1 failed) |
| M4 | `apps/hub/src/evolution/experiments.ts:150` | Removed `on conflict do nothing` (breaks idempotent attach) | `experiments-artifacts.test.ts` | ✅ Killed (1 failed) |
| M5 | `apps/hub/src/evolution/experiments.ts:46` | Digest computed with raw `JSON.stringify(fields)` instead of `canonicalJson(fields)` | **full hub suite (211 tests)** | ❌ **Survived** |
| M6 | `apps/hub/src/evolution/experiments.ts:253` | Close guard weakened: `status !== "evaluated"` → `status === "closed"` | `experiments-close.test.ts` | ✅ Killed (1 failed) |
| M7 | `apps/hub/src/evolution/experiments.ts:222` | Persisted status string `'evaluated'` → `'complete'` | `experiments-evaluate.test.ts` | ✅ Killed (1 failed) |
| M8 | `apps/hub/src/evolution/experiments.ts:147` | Skipped the cross-project artifact validation (`artRow.project_id !== projectId` dropped) | `experiments-artifacts.test.ts` | ✅ Killed (1 failed) |
| M9 | `apps/hub/src/registry/routes.ts:82` | `variants.length !== 2` → `< 1` (accepts 1 variant) | `experiments-start.test.ts` | ✅ Killed (1 failed) |
| M10 | `apps/hub/src/evolution/experiments.ts:143` | Removed the attach-time `status !== "running"` guard | **full hub suite (211 tests)** | ❌ **Survived** |
| M11 | `apps/hub/src/evolution/experiments.ts:164` | Proof-artifact listing returns `'corrupted'` for `type` and `title` | `experiments-artifacts.test.ts` | ❌ **Survived** |
| M12 | `apps/hub/src/registry/routes.ts:82` | `variants.length !== 2` → `< 2` (accepts 3+ variants) | `experiments-start.test.ts` | ❌ **Survived** |
| M13 | `apps/hub/src/registry/routes.ts:104-105` | Dropped the `observationWindow` presence/type check from `isValidVerificationPlan` | `experiments-start.test.ts` | ❌ **Survived** |

**Sensor depth**: P0-full (13 mutations, ≥5 required — data-integrity/decision-record path)
**Sensor tally (round 1)**: 8/13 killed, **5 survived** — round-1 sensor did not fully pass, closed by round 2

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code — no features beyond what was asked | ✅ |
| No abstractions for single-use code | ✅ (`canonicalJson` extraction has two real consumers) |
| No unnecessary flexibility | ✅ |
| Only touched files required for the tasks | ✅ |
| Didn't "improve" unrelated code | ✅ (cartographer change is import-only) |
| Matches existing patterns/style | ✅ (`withTx`/`insertX`/`listX`, `requireOwnedProject` → `enforceCapability`, pure-function evaluator mirroring `analysis-provider.ts`) |
| Would a senior engineer approve? | ⚠️ Implementation yes; test suite no — see surviving mutants |
| Tests map to ACs and are non-shallow | ⚠️ Mostly; EXP-02/EXP-03 are single-instance validation tests standing in for "any of N" ACs |
| Spec-anchored outcome check (asserted values match spec) | ❌ EXP-01 canonicality, EXP-02, EXP-03 |
| Per-layer Coverage Expectation met (domain 1:1 ACs; routes happy+edge+error) | ⚠️ 3 of 6 new routes lack a cross-tenant (403) test |
| Every test maps to a spec AC / edge case / Done-when — no unclaimed tests | ✅ |
| Documented guidelines followed | ✅ `AGENTS.md` + Slices 0-3 conventions (integration tests against real Postgres via `freshDb`) |

**Notable positives**: `evaluateExperiment` is genuinely well tested — both comparison operators, both directions, and both boundary-equality cases (`10 >= 10`, `100 <= 100`), which is exactly the semantics EXP-08/09 turn on. EXP-11 and EXP-13 assert full conjunctions against the DB, not just status codes.

---

## Edge Cases

- [x] Unknown experiment → 404 — `experiments-start.test.ts:174`, `experiments-artifacts.test.ts:145`, `experiments-evaluate.test.ts:159`, `experiments-close.test.ts:143`
- [~] Start on a proposal from another project → 404 — only a non-existent id is tested (`experiments-start.test.ts:143`); no genuinely foreign proposal
- [~] Cross-tenant on **any** new route → 403 — proven for start/evaluate/close only; missing for `GET /experiments/:id`, `POST/GET /experiments/:id/artifacts`
- [x] Same artifact attached twice → no duplicate link row — `experiments-artifacts.test.ts:130`
- [x] Observed value neither finite number nor `null` → 422 — `experiments-evaluate.test.ts:143,145,147` (string, boolean, object)

---

## Gate Check

- **Gate command**: `bash scripts/dev-db.sh start && pnpm test:int`, plus `pnpm --filter @evolution-os/hub typecheck`
- **Result**: 219 passed, 0 failed, 0 skipped (`apps/hub` 211 in 38 files; `apps/node` 8 in 2 files). Exit 0.
- **Typecheck**: `tsc --noEmit` exit 0.
- **Test count before feature**: 172 (hub)
- **Test count after feature**: 211 (hub)
- **Delta**: +39 (`experiments-start` 8, `experiments-evaluate` 8, `evaluate-experiment` 6, `experiments-close` 6, `experiments-artifacts` 5, `canonical-json` 4, `experiments-migration` 2)
- **Skipped tests**: none
- **Failures**: none
- **Test integrity**: no test count decrease, no assertion weakened relative to pre-slice baseline

---

## Fix Plans

### Fix 1 — Prove the digest is canonical (Blocker)

- **Root cause**: `apps/hub/test/experiments-start.test.ts:146-152` asserts digest equality for two identically-built proposals, which holds under `JSON.stringify` too. The `canonical` clause of EXP-01 and the entire justification for T2 (`spec.md:33`, `design.md:12`) have no discriminating test.
- **Fix task**: add a test that makes `computeProposalDigest`'s key-ordering independence observable — e.g. export the digest helper (or add a direct unit test) asserting that two material-field objects differing only in key insertion order produce the same `sha256:` value, and/or persist two proposals whose `alternatives` jsonb was inserted with different key orders and assert equal digests through the route.
- **Verify**: mutating `experiments.ts:46` to `JSON.stringify(fields)` must fail the suite.
- **Priority**: Blocker — this is the slice's headline design decision.

### Fix 2 — EXP-02: reject more than 2 variants (Major)

- **Root cause**: only a 1-variant payload is tested (`experiments-start.test.ts:109-112`); `variants.length < 2` passes the suite.
- **Fix task**: add a 3-variant start request asserting 422 + `title === "invalid_variants"` + no row created.
- **Verify**: mutating `routes.ts:82` to `variants.length < 2` must fail.
- **Priority**: Major — the AC says "not exactly 2", and half of that is unenforced by tests.

### Fix 3 — EXP-03: reject each missing plan field (Major)

- **Root cause**: only `threshold` is omitted (`experiments-start.test.ts:123`); the other four field checks are dead weight to the suite.
- **Fix task**: table-drive the test over all five fields (`hypothesis`, `baselineMetric`, `threshold`, `comparison`, `observationWindow`), asserting 422 + `invalid_verification_plan` for each; include an invalid `comparison` value (e.g. `"eq"`).
- **Verify**: dropping any single field check from `isValidVerificationPlan` must fail.
- **Priority**: Major.

### Fix 4 — Test the attach-time `running` guard (Major)

- **Root cause**: no test attaches a proof artifact to a non-`running` experiment; `experiments.ts:143` is unprotected by the suite.
- **Fix task**: evaluate an experiment, then attempt to attach an artifact, asserting 409 + `invalid_transition`. Also consider adding the guard to the spec's Edge Cases — it is currently implementation behavior with no AC behind it (**spec-precision gap**).
- **Verify**: deleting the guard must fail the suite.
- **Priority**: Major.

### Fix 5 — Assert proof-artifact listing payload fields (Major)

- **Root cause**: `experiments-artifacts.test.ts:161-162` asserts ids only; `type` and `title` can be corrupted undetected. Identical to the three Slice 3 findings (evidence type, evidence status in a listing, challenger findings).
- **Fix task**: assert the listed artifacts' `type` and `title` against the values used at creation (`experiments-artifacts.test.ts:69`).
- **Priority**: Major (repeat defect class).

### Fix 6 — Cross-tenant 403 on the three uncovered routes (Minor)

- **Root cause**: `spec.md:118` says "any new route"; 3 of 6 have no 403 test.
- **Fix task**: add cross-tenant 403 assertions for `GET /projects/:id/experiments/:experimentId`, `POST /projects/:id/experiments/:experimentId/artifacts`, `GET /projects/:id/experiments/:experimentId/artifacts`.
- **Priority**: Minor (the shared `requireOwnedProject` helper is proven elsewhere, but the stated edge case is not met).

### Fix 7 — EXP-10: assert the persisted transition on the `null` path (Minor)

- **Root cause**: `experiments-evaluate.test.ts:118-128` asserts `observed_value` is null but never the experiment's `status`; the route's response body hardcodes `"evaluated"` (`routes.ts:898`) so it proves nothing.
- **Fix task**: add `expect(row.rows[0].status).toBe("evaluated")` and `expect(row.rows[0].verdict).toBe("inconclusive")` to the null-value test.
- **Priority**: Minor.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| EXP-01 | Implementing | ⚠️ Partial — canonicality clause unverified |
| EXP-02 | Implementing | ❌ Needs Fix |
| EXP-03 | Implementing | ❌ Needs Fix |
| EXP-04 | Implementing | ✅ Verified |
| EXP-05 | Implementing | ✅ Verified |
| EXP-06 | Implementing | ✅ Verified |
| EXP-07 | Implementing | ⚠️ Partial — payload fields unasserted |
| EXP-08 | Implementing | ✅ Verified |
| EXP-09 | Implementing | ✅ Verified |
| EXP-10 | Implementing | ⚠️ Partial — transition unasserted on the null path |
| EXP-11 | Implementing | ✅ Verified |
| EXP-12 | Implementing | ✅ Verified |
| EXP-13 | Implementing | ✅ Verified |
| EXP-14 | Implementing | ✅ Verified |
| EXP-15 | Implementing | ✅ Verified |

---

## Summary

**Overall**: ❌ Not Ready

**Spec-anchored check**: 9/15 fully matched · 2 AC-level gaps · 3 spec-precision/partial gaps
**Sensor**: 8/13 mutations killed, 5 survived
**Gate**: 219 passed, 0 failed; typecheck exit 0

**What works**: the implementation itself is sound and idiomatic. `evaluateExperiment` is the strongest-tested unit in the slice — both `gte` and `lte`, both directions, both boundary equalities. The full vertical slice runs end to end (proposal → experiment → artifact → verdict → closed decision) with the decision preserved through the untouched Slice 1/3 mechanism. The `canonicalJson` extraction is byte-for-byte and Slice 2's regression suite passes unchanged. The Slice 3 single-tenant grant bug did not recur, and 404-before-403 ordering is correct on all six new routes.

**Issues found**: the test suite does not defend the slice's own central claim. The digest can be silently downgraded to raw `JSON.stringify` with all 211 tests green — the exact bug class the T2 extraction exists to prevent. Two ACs that read "any of N" are tested with one instance each, leaving 3+ variants and four of five plan fields unenforced. The attach-time state guard and the proof-artifact listing payload are entirely undefended, the latter being the third consecutive slice with the assert-identity-only defect.

**Next steps**: route Fixes 1–5 (Blocker/Major) back to an implementer as test-only fix tasks, then re-verify. Fixes 6–7 can ride along. No implementation change is required for any of them — the code is correct; the tests do not prove it.

---

## Round 2 — gaps closed

All 7 fixes were test-only, as the round-1 report predicted. No file under `apps/hub/src/` changed except exporting two already-correct, previously-private symbols (`computeProposalDigest`, `ProposalMaterialFields`) from `apps/hub/src/evolution/experiments.ts` so they could be tested directly — their bodies are byte-for-byte unchanged.

**Fix 1 (Blocker) — digest canonicality now proven directly.** `apps/hub/test/compute-proposal-digest.test.ts` calls the exported `computeProposalDigest` with two `ProposalMaterialFields` objects holding identical values but different JS property insertion order (including a differently-ordered `alternatives` array element) and asserts the digests are equal — this is only true under `canonicalJson`'s sorted-key serialization; raw `JSON.stringify` preserves insertion order and would produce different digests. Manually re-ran mutation M5 (swap `canonicalJson(fields)` for `JSON.stringify(fields)` at `experiments.ts:46`) against the strengthened suite: it now fails (`expected 'sha256:1835ca...' to be 'sha256:388504...'`). Reverted before committing; `git diff` on the file was empty apart from the two intended `export` additions.

**Fix 2 (Major) — EXP-02 both directions.** `experiments-start.test.ts` now has a second test asserting a 3-variant payload is rejected 422 `invalid_variants`, alongside the existing 1-variant case. Re-ran mutation M12 (`variants.length !== 2` → `variants.length < 2`): now fails.

**Fix 3 (Major) — EXP-03 all 5 fields + invalid comparison.** Replaced the single-field-omission test with `it.each` over `hypothesis`, `baselineMetric`, `threshold`, `comparison`, `observationWindow` (5 cases, each asserting 422 `invalid_verification_plan` and no row created), plus a dedicated test for an invalid `comparison` value (`"eq"`). Re-ran mutation M13 (drop the `observationWindow` check): now fails.

**Fix 4 (Major) — attach-time `running` guard tested.** New test in `experiments-artifacts.test.ts`: evaluate an experiment (moving it to `evaluated`), then attempt to attach a proof artifact, asserting 409 `invalid_transition` and zero rows in `experiment_artifacts`. Re-ran mutation M10 (`if (expRow.status !== "running")` → `if (false)`): now fails.

**Fix 5 (Major) — proof-artifact listing payload asserted on value.** The listing test now asserts every returned artifact's `type` and `title` equal the values used at creation (`"report"` / `"Resultado do experimento"`), not just its `id`. Re-ran mutation M11 (corrupt both fields to `"corrupted"` in `listProofArtifacts`): now fails.

**Fix 6 (Minor) — cross-tenant 403 on the three previously-uncovered routes.** Added to `experiments-start.test.ts` (`GET /experiments/:id`) and `experiments-artifacts.test.ts` (`POST` and `GET .../artifacts`).

**Fix 7 (Minor) — EXP-10 null path asserts the persisted transition.** The inconclusive-verdict test in `experiments-evaluate.test.ts` now also asserts `row.rows[0].status === "evaluated"` and `row.rows[0].verdict === "inconclusive"` directly against the database, not just the (route-hardcoded) response body.

**Sensor re-run summary**: all 5 round-1 survivors (M5, M10, M11, M12, M13) manually re-applied one at a time to the real working tree, confirmed to fail the strengthened suite, then reverted with `git diff`/`git status --porcelain` checked clean before the next mutation. No `git stash` used. Combined with the 8 round-1 kills, **13/13 round-1-designed mutations now killed**.

**Gate (post-fix, clean tree)**: `apps/hub` 39 files / **225 passed**, 0 failed (up from 211 — 14 new tests: 4 digest, 1 variants-too-many, 4 plan-field table-drive + 1 invalid-comparison, 1 attach-guard, 2 cross-tenant, 1 strengthened listing assertion, 1 strengthened null-path assertion); `apps/node` 2 files / **8 passed**. `tsc --noEmit` exit 0.

### Requirement Traceability Update — round 2 (final)

| Requirement | Round-1 Status | Round-2 Status |
| ----------- | --------------- | -------------- |
| EXP-01 | ⚠️ Partial (digest canonicality unproven) | ✅ **Verified** |
| EXP-02 | ❌ Gap (only one direction) | ✅ **Verified** |
| EXP-03 | ❌ Gap (only one field) | ✅ **Verified** |
| EXP-07 | ⚠️ Spec-precision gap (payload asserted by identity only) | ✅ **Verified** |
| EXP-10 | ⚠️ Partial (transition unasserted on null path) | ✅ **Verified** |

All other requirements (EXP-04/05/06/08/09/11/12/13/14/15) retain their round-1 ✅ Verified status. The attach-time `running` guard (Fix 4) has no dedicated EXP-NN — it was implementation behavior with no AC behind it; the spec-precision note is carried forward as a non-blocking observation, not a gap, since the guard's existence is a reasonable and now-tested implementation choice consistent with every other state-transition guard in this slice.

### Final Verdict

✅ **PASS** — all 15 EXP-NN acceptance criteria verified on value with evidence-or-zero discipline; all 13 round-1-designed mutations killed (5 on re-run after fixes, 8 on the original pass); gate green (233 tests total, 0 failed); typecheck clean. The `canonicalJson` extraction (T2) is proven necessary and correctly wired into the digest computation, not just present in the codebase. Fix→re-verify loop closed at iteration 2 of the 3-iteration bound; round 2 was a targeted, fully test-only fix batch confirmed by manually re-running each of the 5 named mutations against the strengthened suite, matching the same self-verification discipline used to close Slice 3's round 2.
