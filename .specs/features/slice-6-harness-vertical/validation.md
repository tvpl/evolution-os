# Validation Report — Slice 6 Harness Vertical

- **Result**: PASS

**Round**: 2 (final) — supersedes the round‑1 report entirely. Round 1 reported overall PASS with 3 gaps (2 surviving mutants, 1 spec‑precision gap); commit `76a5b7a` ("test(hub): close Slice 6 Verifier gaps in harness tests") added targeted tests for all 3, and this round independently re‑confirms each fix by re‑applying the exact mutation and observing the new test fail, then re‑runs a fresh, differently‑targeted mutation pass (6 new mutations) plus a full suite run and a spec‑anchored spot‑check. No gaps remain.

**Verifier**: independent second-round pass, `thiago.ls@outlook.com`'s session. Full hub integration suite re-run fresh (not trusted from round 1): `bash scripts/dev-db.sh start && pnpm --filter @evolution-os/hub test:int` → **51 test files, 311 tests, all passing** (0 failures), 2026-09-01.

---

## Per-requirement evidence (HRN-01..14)

| ID | Requirement | Implementation | Test |
| --- | --- | --- | --- |
| HRN-01 | Declare inventory → new versioned entry, becomes current | `apps/hub/src/evolution/harness.ts:26-53` (`declareInventory`), `apps/hub/src/registry/routes.ts:1158-1186` (`POST .../harness/inventory`) | `apps/hub/test/harness-inventory.test.ts:81-89` |
| HRN-02 | Read inventory → most recent version | `apps/hub/src/evolution/harness.ts:231-238` (`getCurrentInventory`), `routes.ts:1188-1198` | `apps/hub/test/harness-inventory.test.ts:91-98` |
| HRN-03 | Declare/read for unknown project → 404 | `apps/hub/src/registry/routes.ts:65-95` (`requireOwnedProject`, shared 404-before-403 guard) | `apps/hub/test/harness-inventory.test.ts:124-132` |
| HRN-04 | Declare eval case → persisted | `apps/hub/src/evolution/harness.ts:71-84` (`declareEvalCase`), `routes.ts:1200-1227` | `apps/hub/test/harness-eval-cases.test.ts:59-91` |
| HRN-05 | Unknown `invariantType` / incomplete `params` → 422 (all 4 types) | `apps/hub/src/registry/routes.ts:139-178` (`isValidComponentArray`, `isValidEvalCaseParams`) | `apps/hub/test/harness-eval-cases.test.ts:93-120` |
| HRN-06 | List eval cases → all of them | `apps/hub/src/evolution/harness.ts:94-101` (`listEvalCases`), `routes.ts:1229-1236` | `apps/hub/test/harness-eval-cases.test.ts:122-159` (rewritten in `76a5b7a`: exact `toEqual` on name/invariantType/params for all 4 cases, declaration order) |
| HRN-07 | Run eval → deterministic per-case pass/fail + score, persisted | `apps/hub/src/evolution/harness.ts:117-189` (`runEvalCase`, `runEvalDataset`, `runEval`), `routes.ts:1238-1265` | `apps/hub/test/run-eval-case.test.ts:16-78` (unit, all 4 invariant types incl. boundary), `apps/hub/test/harness-eval-runs.test.ts:97-136` |
| HRN-08 | Run without inventory → 422 `harness_requires_inventory` | `apps/hub/src/evolution/harness.ts:173-174` | `apps/hub/test/harness-eval-runs.test.ts:74-80`, `:90-95` (new: neither precondition declared, inventory checked first) |
| HRN-09 | Run without eval cases → 422 `harness_requires_eval_cases` | `apps/hub/src/evolution/harness.ts:176-177` | `apps/hub/test/harness-eval-runs.test.ts:82-88` |
| HRN-10 | Evaluate running experiment from eval run → `evaluated` w/ verdict from score | `apps/hub/src/evolution/harness.ts:204-229` (`evaluateExperimentFromEvalRun`), `routes.ts:1267-1301` | `apps/hub/test/harness-evaluate-from-eval-run.test.ts:108-159` |
| HRN-11 | Experiment from another project → 404 | `apps/hub/src/evolution/experiments.ts:216` (`submitEvaluation`, reused unchanged) | `apps/hub/test/harness-evaluate-from-eval-run.test.ts:179-191` |
| HRN-12 | Experiment not `running` → 409 | `apps/hub/src/evolution/experiments.ts:217` | `apps/hub/test/harness-evaluate-from-eval-run.test.ts:193-202` |
| HRN-13 | Observatory aggregates inventory + eval case count + latest run (or explicit absence) | `apps/hub/src/evolution/harness.ts:259-277` (`getHarnessObservatory`), `routes.ts:1303-1310` | `apps/hub/test/harness-observatory.test.ts:82-139` |
| HRN-14 | Observatory for unknown project → 404 | `apps/hub/src/registry/routes.ts:1307` (`requireOwnedProject`) | `apps/hub/test/harness-observatory.test.ts:141-144` |

Capability wiring (`harness.write` for inventory/eval-cases/eval-runs, `experiment.write` for evaluate-from-eval-run per the spec's Assumptions table) and dev-tenant grants: `apps/hub/migrations/007_harness.sql`, `apps/hub/src/policy/policy.ts:100,118` (`seedDevGrants`). All 7 harness routes carry cross-tenant 403 tests (one per test file).

---

## Discrimination sensor

All mutation work was done in an isolated scratch copy (`/tmp/verify-slice6-round2-scratch`, deleted after use) — never in the real tree. Each mutation below was applied, the specific test file re-run to observe the failure, then reverted before the next mutation; the real tree's `git status`/`git diff` were confirmed empty throughout (see Tree Cleanliness below).

### Round-1 gaps re-confirmed closed (3/3)

| # | Mutation | Re-applied at | Killed by | Result |
| --- | --- | --- | --- | --- |
| 1 | Revert `evaluate-from-eval-run` capability from `experiment.write` back to `harness.write` | `apps/hub/src/registry/routes.ts:1271-1272` | `apps/hub/test/harness-evaluate-from-eval-run.test.ts:204-233` ("is gated specifically by experiment.write, not harness.write") | **KILLED** — revoking `experiment.write` alone no longer produces 403 under the mutant (route still uses `harness.write`, unrevoked); test asserts `expected 200 to be 403` and fails, correctly detecting the mutant |
| 2 | Swap guard order in `runEval` (check `eval_cases` before `inventory`) | `apps/hub/src/evolution/harness.ts:173-177` | `apps/hub/test/harness-eval-runs.test.ts:90-95` ("rejects running with neither inventory nor eval cases declared, checking inventory first") | **KILLED** — with neither declared, mutant returns `harness_requires_eval_cases`; test expects `harness_requires_inventory` and fails as designed |
| 3 | (Spec-precision gap, not a code mutant) HRN-06 listing assertions | `apps/hub/test/harness-eval-cases.test.ts:122-159` | N/A — verified by inspection | **CLOSED** — listing test now uses exact `toEqual` against id/name/invariantType/params/createdAt for all 4 declared cases in order, replacing the prior `toBeGreaterThanOrEqual`/`toHaveProperty` presence checks |

### New round-2 mutations (6, different functions/branches than round 1)

**Sensor tally: 6/6 killed, 0 surviving.**

| # | Mutation | Location | Killed by | Result |
| --- | --- | --- | --- | --- |
| 1 | `declareInventory`: version off-by-one (`v` instead of `v + 1`, so first declare persists as version 0) | `apps/hub/src/evolution/harness.ts:36` | `apps/hub/test/harness-inventory.test.ts:81-89` (`expect(res.json()).toEqual({ version: 1, ... })`) + cascading failures in `harness-observatory.test.ts`, `harness-evaluate-from-eval-run.test.ts` | **KILLED** (6 tests failed across 3 files) |
| 2 | `getHarnessObservatory`: `evalCaseCount: evalCases.length + 1` | `apps/hub/src/evolution/harness.ts:276` | `apps/hub/test/harness-observatory.test.ts:113`, `:138` (exact `evalCaseCount` assertions) | **KILLED** (3 tests failed) |
| 3 | `declareEvalCase`: always persists `params` as `{}` instead of `input.params` | `apps/hub/src/evolution/harness.ts:81` | `apps/hub/test/harness-eval-cases.test.ts:122-159` (the round-1-fixed exact listing test) + cascading failures | **KILLED** (5 tests failed) — direct confirmation that the round-1 HRN-06 fix has teeth against a real persistence bug, not just presence checks |
| 4 | `isValidEvalCaseParams`: drop the `INVENTORY_CATEGORIES.has(p.category)` enum check for `min_component_count`, accepting any string category | `apps/hub/src/registry/routes.ts:170-176` | `apps/hub/test/harness-eval-cases.test.ts:104-111` ("rejects min_component_count with an invalid category") | **KILLED** (2 tests failed) |
| 5 | `GET .../harness/inventory`: return `200` with a synthetic empty inventory instead of `404` when none declared | `apps/hub/src/registry/routes.ts:1193-1196` | `apps/hub/test/harness-inventory.test.ts:76-79` ("returns 404 before any inventory is declared") | **KILLED** — directly exercises the spec's Edge Case distinguishing "no inventory" (404) from "declared-but-empty" (200) |
| 6 | `runEvalCase` `min_component_count`: boundary `count >= min` → `count > min` | `apps/hub/src/evolution/harness.ts:143` | `apps/hub/test/run-eval-case.test.ts:50-53` ("min_component_count passes when the count meets the minimum", count==min boundary) + `:61-72` | **KILLED** (2 tests failed) |

---

## Spec-anchored spot-check (5 of 14 requirements, random sample)

| ID | Spec-defined exact value | Test assertion |
| --- | --- | --- |
| HRN-01 | Declaring an inventory returns `{version: 1, status: "declared"}` and becomes current | `harness-inventory.test.ts:83-84` asserts `res.json()).toEqual({ version: 1, status: "declared" })` — exact object, not just `res.statusCode` |
| HRN-06 | Listing returns cases with exact declared `name`/`invariantType`/`params`, in declaration order | `harness-eval-cases.test.ts:129-158` asserts `toEqual([...])` with all 4 cases' literal name/invariantType/params values in order (post-fix) |
| HRN-08 | Rejected with 422 and `harness_requires_inventory` | `harness-eval-runs.test.ts:78-79` asserts both `res.statusCode).toBe(422)` and `res.json().title).toBe("harness_requires_inventory")` — exact problem-type string, not just the code |
| HRN-10 | Score/verdict/rationale computed from the eval run, same shape as Slice 4's evaluate endpoint | `harness-evaluate-from-eval-run.test.ts:121-128` asserts the full body via `toEqual` (`score: {passed:1,total:1}`, `verdict: "hypothesis_met"`) and separately queries the `experiments`/`harness_eval_runs` rows (`:130-142`) to confirm the persisted `observedValue`/`scorePassed`/`scoreTotal` match exactly |
| HRN-13 | Observatory shows explicit `latestRun: null` before any run, and the run's exact score after | `harness-observatory.test.ts:89-99` (exact `toEqual` incl. `latestRun: null`) and `:114` (`toEqual({ runId, score: { passed: 1, total: 2 }, createdAt: expect.any(String) })`) |

All 5 sampled requirements assert exact spec-defined values (status code **and** body shape/content), not status-code-only or presence-only checks.

---

## Tree cleanliness

All mutation testing was performed in an isolated copy at `/tmp/verify-slice6-round2-scratch` (created via `cp -r`, deleted with `rm -rf` after use). Before this report was written, `git status --porcelain` and `git diff --stat` in the real tree (`/home/user/evolution-os`) were both empty — no mutation, no stray edit, leaked into the real tree. (Note: during this verification round, an unrelated docs-only commit `d9190ef` — "record Verifier round 1 validation report" — landed in the real tree from outside this session; it only added the round-1 `validation.md`, touched no code, and is now superseded by this file.) The only change this session makes to the real tree is this overwrite of `validation.md`.

---

## Ranked gap list

None. All 3 round-1 gaps are confirmed closed by targeted, re-verified tests; all 6 new round-2 mutations across previously-uncovered functions/branches (`declareInventory` versioning, `getHarnessObservatory` aggregation, `declareEvalCase` persistence, `isValidEvalCaseParams` category enum, the inventory 404-vs-empty distinction, and the `min_component_count` boundary) were killed; the full suite passes (311/311); and a random spot-check across 5 of the 14 HRN requirements confirms exact spec-defined value assertions, not status-code-only checks.
