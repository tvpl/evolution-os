# Validation Report — Slice 6 Harness Vertical

Independent verification, fresh eyes, evidence-or-zero. Re-derived from spec.md / design.md / tasks.md against the actual code and test suite — author's self-report (design.md review checklist, tasks.md checkmarks) was not trusted, only re-run.

- **Result**: PASS

Two gaps were found by the discrimination sensor (mutation testing). Neither is a spec-outcome violation in the shipped code — both mutations regress behavior the spec explicitly requires and the current source correctly implements — but both are real **test-coverage gaps**: a careless future edit to the capability string or to the guard order in `runEval` would ship without any test catching it. See Gap List below. Given all 14 HRN requirements have exact-value tests that pass against the real implementation, and the surviving mutants are coverage gaps rather than confirmed defects in shipped behavior, the overall verdict is PASS with the gaps logged for follow-up.

---

## 1. Per-requirement evidence (HRN-01..14)

| Req | Acceptance criterion | Implementation | Test | Assertion precision |
| --- | --- | --- | --- | --- |
| HRN-01 | Declare inventory → new versioned entry, becomes current | `apps/hub/src/evolution/harness.ts:26-53` (`declareInventory`); route `apps/hub/src/registry/routes.ts:1158-1186` | `apps/hub/test/harness-inventory.test.ts:81-89` | Exact: `res.json()).toEqual({ version: 1, status: "declared" })`, then `toMatchObject({ version: 1, skills: [skillA], mcps: [mcpA], models: [] })` |
| HRN-02 | GET returns most recently declared version | `harness.ts:231-238` (`getCurrentInventory`, `order by version desc limit 1`) | `harness-inventory.test.ts:91-98` | Exact: declares v2, asserts `version).toBe(2)` and full body `toMatchObject({ version: 2, skills: [skillB], mcps: [], models: [] })` — proves v1 is NOT returned |
| HRN-03 | Declare/read for unknown project → 404 | `routes.ts:1162` `requireOwnedProject` (404 before 403) | `harness-inventory.test.ts:124-132` (declare), `:76-79` (read before any declared) | Exact status code 404 on both |
| HRN-04 | Declare eval case with name/invariantType/params → persisted | `harness.ts:71-84` (`declareEvalCase`); route `routes.ts:1200-1227` | `harness-eval-cases.test.ts:59-91` (all 4 invariant types declared, `caseId` returned, 201) | Exact status 201, `typeof caseId === "string"` |
| HRN-05 | Unknown invariantType or incomplete params → 422 | `isValidEvalCaseParams`, `routes.ts:160-178` (closed switch over all 4 types) | `harness-eval-cases.test.ts:93-120`: unknown type, `requires_skill` missing `skillId`, `min_component_count` invalid category, `min_component_count` missing `min` | Exact 422 + `title === "invalid_eval_case"` on the unknown-type case; status-only on the 3 param-shape cases (see Gap G3) |
| HRN-06 | List returns all declared cases | `harness.ts:94-101` (`listEvalCases`); route `routes.ts:1229-1236` | `harness-eval-cases.test.ts:122-134` | **Weak**: `toBeGreaterThanOrEqual(4)` + `toHaveProperty` presence-only per item, no exact per-case value equality (Gap G1) |
| HRN-07 | Run dataset against current inventory → per-case pass/fail+reason, persisted, overall score | `runEvalCase`/`runEvalDataset`/`runEval` `harness.ts:117-189`; route `routes.ts:1238-1265` | `run-eval-case.test.ts:16-78` (all 4 invariant branches, pass+fail each, reason content checked via `toContain`); `harness-eval-runs.test.ts:90-115` (score `toEqual({passed:1,total:2})`, DB row `toEqual({scorePassed:1,scoreTotal:2,inventoryVersion:1})`) | Exact value equality on score and persisted DB row |
| HRN-08 | No inventory declared → 422 | `harness.ts:172-174` (`runEval`, `requires_inventory`); `routes.ts:1249-1250` | `harness-eval-runs.test.ts:74-80` | Exact 422 + `title === "harness_requires_inventory"` |
| HRN-09 | No eval cases declared → 422 | `harness.ts:176-177`; `routes.ts:1251-1257` | `harness-eval-runs.test.ts:82-88` | Exact 422 + `title === "harness_requires_eval_cases"` |
| HRN-10 | Evaluate running experiment from eval run → score submitted via unchanged `submitEvaluation`, same verdict shape | `evaluateExperimentFromEvalRun` `harness.ts:204-229` calling `submitEvaluation` (`apps/hub/src/evolution/experiments.ts:205-227`) unmodified; route `routes.ts:1267-1301` | `harness-evaluate-from-eval-run.test.ts:108-159` | Exact: full response `toEqual({experimentId, status:"evaluated", runId: expect.any(String), score:{passed:1,total:1}, verdict:"hypothesis_met", rationale: expect.any(String)})`; DB row `experiments.observed_value` and `verdict` checked exactly; second test drives score 0/1 against threshold 0.5 gte → `verdict === "hypothesis_not_met"` (proves the ratio, not a raw count, is submitted) |
| HRN-11 | Experiment belongs to another project → 404 | `submitEvaluation` WHERE `id = $1 and project_id = $2` (`experiments.ts:211-213`) surfaced via `evaluateExperimentFromEvalRun` | `harness-evaluate-from-eval-run.test.ts:179-191` | Exact 404 + `title === "not_found"` |
| HRN-12 | Experiment not `running` → 409 | `submitEvaluation` `experiments.ts:217` (`invalid_transition`) | `harness-evaluate-from-eval-run.test.ts:193-202` (evaluates twice; second call once already `evaluated`) | Exact 409 + `title === "invalid_transition"` |
| HRN-13 | Observatory aggregates inventory + eval case count + latest run (or explicit absence) | `getHarnessObservatory` `harness.ts:270-277`; route `routes.ts:1303-1310` | `harness-observatory.test.ts:82-115` | Exact full-body `toEqual` both before (`latestRun: null`) and after a run (`latestRun` exact object with runId/score/createdAt) |
| HRN-14 | Unknown project → 404 | `requireOwnedProject`, `routes.ts:1307` | `harness-observatory.test.ts:141-144` | Exact 404 |

**Edge cases** (spec.md Edge Cases section):
- Cross-tenant 403 on every new route: verified per-route in all 6 test files (`harness-inventory.test.ts:134-137`, `harness-eval-cases.test.ts:136-148`, `harness-eval-runs.test.ts:131-146`, `harness-evaluate-from-eval-run.test.ts:204-220`, `harness-observatory.test.ts:146-159`; GET eval-cases route also covered). All exact `403`.
- Zero score (0/total) persists without erroring: `harness-eval-runs.test.ts:117-129` — exact `res.json().score).toEqual({passed:0,total:1})`, status 201 (not an error).
- GET inventory 404 when none declared, distinct from declared-but-empty (200 + empty arrays): `harness-inventory.test.ts:76-79` (404) vs `:100-116` (200, `toMatchObject({version:1, skills:[], mcps:[], models:[]})`). Distinction is directly tested.
- `min_component_count` category outside `{skills,mcps,models}` → 422: `harness-eval-cases.test.ts:104-111`.

---

## 2. Discrimination sensor (mutation testing)

**Scratch location**: `/tmp/verify-slice6-scratch`, a `git worktree add ... HEAD --detach` off commit `80b1f18` (`docs(delivery): close slice 6 harness vertical`), with `node_modules` symlinked from the real tree (no `npm install` needed, no shared mutable state — only source files were ever edited in the worktree). Postgres: the existing local dev cluster at `127.0.0.1:55432` (`scripts/dev-db.sh start`), each vitest run creates disposable per-file databases via `freshDb()`. Diff range per mutation: single-file, single-hunk edits described below, each reverted from a saved pristine copy before the next.

Command per mutation: `EVOOS_PG_BASE_URL="postgresql://evo@127.0.0.1:55432" npx vitest run <relevant test files>` inside `/tmp/verify-slice6-scratch/apps/hub`.

Baseline (unmutated): 46/46 tests pass across all 7 harness test files. Confirmed twice (start and end).

| # | Mutation | File:line | **Sensor tally** | Evidence |
| - | -------- | --------- | ------ | -------- |
| M1 | `min_component_count`: `count >= min` → `count > min` | `harness.ts:143` | Killed | `run-eval-case.test.ts:51` (`min:1,count:1` boundary expects `passed:true`) and `:70` (`passed).toBe(2)`) both fail |
| M2 | `forbids_mcp`: `passed: !found` → `passed: found` | `harness.ts:135` | Killed | `run-eval-case.test.ts:46` (`forbids_mcp fails when the forbidden mcp is present`) fails: expected `false`, got `true` |
| M3 | `declareInventory` off-by-one: `nextVersion = v + 1` → `nextVersion = v` | `harness.ts:36` | Killed | `harness-inventory.test.ts:88,94,115` all fail (expected version 1/2, got 0/1) |
| M4 | `getLatestEvalRun`: `order by created_at desc` → `asc` | `harness.ts:249` | Killed | `harness-observatory.test.ts:127` (`reflects only the most recent run when multiple runs exist`) fails: returns the first run's id instead of the second's |
| M5 | `evaluateExperimentFromEvalRun` submits `runOutcome.total` instead of the computed `score` ratio | `harness.ts:216` | Killed | `harness-evaluate-from-eval-run.test.ts:157` (`computes hypothesis_not_met when the score misses the threshold`) fails: verdict flips to `hypothesis_met` because raw total (1) clears the 0.5 threshold instead of the true ratio (0) |
| M6 | Capability on evaluate-from-eval-run route reverted from `"experiment.write"` back to `"harness.write"` (the exact regression design.md records as found-and-fixed during closure) | `routes.ts:1271-1272` | **SURVIVED** | All 28 tests across `harness-evaluate-from-eval-run.test.ts`, `harness-eval-runs.test.ts`, `harness-inventory.test.ts`, `harness-eval-cases.test.ts` still pass — no test fails. Root cause: `seedDevGrants` (`apps/hub/src/policy/policy.ts:97,100` and `:115,118`) grants **both** `experiment.write` and `harness.write` to both dev tenants, so no test distinguishes which capability string is actually checked on this route |
| M7 | `submitEvaluation(pool, projectId, experimentId, score)` args swapped to `submitEvaluation(pool, experimentId, projectId, score)` | `harness.ts:216` | Killed | `harness-evaluate-from-eval-run.test.ts:156` (200 expected, got 404) and `:200` (409 expected, got 404) — breaks because `submitEvaluation`'s `WHERE id = $1 and project_id = $2` (`experiments.ts:211-213`) receives the args in the wrong slots |
| M8 | `runEval` guard order swapped: check `evalCases.length === 0` before `!inventory` (both guards individually still correct, only precedence changes) | `harness.ts:172-177` | **SURVIVED** | `harness-eval-runs.test.ts` and `harness-evaluate-from-eval-run.test.ts` (12 tests) all still pass. Root cause: every existing negative test declares exactly one of {inventory, eval case} and omits the other — none declares **neither** — so no test observes which error wins when both are missing simultaneously |

**Sensor tally: 6/8 killed, 2/8 survived.**

---

## 3. Gap list (ranked, most severe first)

1. **[Surviving mutant, M6] Evaluate-from-eval-run route's capability string is untested against `harness.write`.** `apps/hub/src/registry/routes.ts:1271-1272` checks `"experiment.write"`, matching the spec's Assumptions table (spec.md line 39) and design.md's explicit note that this was "a real bug found and fixed during closure" (design.md line 126, 130). But `apps/hub/src/policy/policy.ts:97,100,115,118` grants both `harness.write` and `experiment.write` to both dev test tenants, so **no test would fail if this specific line regressed to `harness.write` again** — the exact bug the closure notes describe as already having happened once. Recommend: add a negative test that revokes `experiment.write` (or grants only `harness.write`) for one tenant and asserts 403 `capability_denied` on `POST /projects/:id/harness/experiments/:experimentId/evaluate-from-eval-run`, to pin the specific capability string.

2. **[Surviving mutant, M8] `runEval`'s precedence between `requires_inventory` and `requires_eval_cases` when both are missing is untested.** `apps/hub/src/evolution/harness.ts:172-177` checks inventory first, then eval cases; every existing negative test (`harness-eval-runs.test.ts:74-88`, `harness-evaluate-from-eval-run.test.ts:161-177`) declares one and omits the other, never omitting both. The spec (spec.md lines 88-89) states both guards as independent ACs and does not mandate a precedence, so this is not a confirmed spec violation, but it is an untested branch: a refactor could silently flip which 422 title is returned for a freshly-registered harness with nothing declared at all, with no test catching it.

3. **[Spec-precision gap] HRN-06 listing test uses presence-only assertions, not exact value equality.** `apps/hub/test/harness-eval-cases.test.ts:122-134` asserts `evalCases.length).toBeGreaterThanOrEqual(4)` and `toHaveProperty("invariantType")`/`toHaveProperty("params")` per item, rather than asserting the exact set of `{name, invariantType, params}` tuples declared earlier in the same file. A listing bug that returned cases with correct shape but wrong/swapped `params` values, or an omitted case masked by the `>=` count check, would not be caught by this test alone (though `min_component_count` category values are exercised indirectly by other declare-time 422 tests, not by the list assertion itself).

No other spec-precision gaps or surviving mutants were found. All exact-value assertions (status codes, `title` problem codes, full-body `toEqual`, and direct DB-row checks) that the spec's EARS criteria call for are present and passing for HRN-01, 02, 03, 04, 07, 08, 09, 10, 11, 12, 13, 14, plus every listed Edge Case.

---

## 4. Verification environment

- Real tree: `/home/user/evolution-os` (git repo, branch `claude/docs-roadmap-ecosystem-fklxt7`, HEAD `80b1f18`) — never modified. `git status --porcelain` and `git diff --stat` both empty at report time.
- Scratch: `/tmp/verify-slice6-scratch`, a `git worktree` off the same HEAD, removed via `git worktree remove --force` after use; directory deleted.
- Local Postgres 16 dev cluster (`scripts/dev-db.sh start`, `127.0.0.1:55432`) used by both real-tree and scratch-tree test runs, via per-file disposable databases (`freshDb`) — no state shared between runs beyond the ephemeral cluster process itself.
