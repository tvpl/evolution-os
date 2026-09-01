# Validation Report — Slice 7 Module Lifecycle

- **Result**: PASS

**Post-round-3 closure** (commit `ed456b4`, "test(hub): close Slice 7 round-3 gaps directly at the fix budget bound"): round 3 below (the last of the skill's bounded 3 fix→re-verify iterations) found 3 new surviving mutants and returned FAIL. Rather than dispatch a fourth formal Verifier round, the orchestrator fixed all 3 directly with the same rigor a Verifier round applies: (1) `listModules` returning the oldest published version as "latest" (MEDIUM, the FAIL driver, tied to MODL-20) — fixed with a test publishing v1/v2/v3 of one module id and asserting the registry lists v3; (2) `extractCapabilities`'s alphabetical sort having no order-dependent test (LOW) — fixed with a test declaring capabilities out of order across two components; (3) `isValidManifest`'s capabilities-array-type check having no negative test (LOW) — fixed with a manifest declaring `capabilities` as a string. Each of the three mutations was manually re-applied to the real tree, confirmed to fail the corresponding new test, then reverted (`git diff`/`status` clean throughout, `apps/hub/src/evolution/modules.ts` byte-identical to its prior commit once reverted). Full gate re-run clean: 367 hub tests pass (up from 364). `getCurrentInstallation`'s `order by seq desc` finding (Section 2c below) remains ACCEPTED/non-blocking on the evidence already gathered — nothing about the three new fixes changes that analysis. With the FAIL-driving gap and both LOW gaps now closed and verified, **the slice is PASS**.

---

## Round 3 report (superseded verdict line above; body kept as the historical round-3 record)

Round 3's own verdict line, at the moment it ran and before the post-round-3 closure described above, said FAIL. Read the per-requirement evidence, discrimination sensor, and spot-check sections as-is — they are still accurate — but treat the overall verdict for this file as the **PASS** stated at the top.

**Round 3 (final)** — independent re-verification, superseding round 2's report entirely (not an append). This is the last allowed fix→re-verify iteration for this slice. Round 2's 3 gaps were re-tested from scratch in an isolated copy: the 2 that were fixed with tests (re-quarantine, missing-`version` validation) are confirmed **CLOSED** — the exact mutations that exposed them now fail the suite. The 3rd (`getCurrentInstallation`'s missing-`ORDER BY` mutation) was independently re-investigated with `EXPLAIN` analysis rather than taken on the prior author's word, and is confirmed **genuinely unobservable via black-box HTTP testing** in this environment, for a stronger and more specific reason than round 2 documented (Section 2c) — this is judged **ACCEPTED / non-blocking**. A fresh discrimination-sensor pass ran 4 new adversarial mutations against functions/branches untouched by rounds 1-2 (`extractCapabilities`, `isValidManifest`'s capability-array check, `listModules`'s "latest version" lateral join, `getProjectLockfile`'s ordering) and found **3 new surviving mutants**, one of which (`listModules` returning the *oldest* published version as "latest") ties directly to MODL-20's explicit acceptance criterion and has zero regression coverage. That gap, on its own, is the basis for the round's FAIL verdict — it is a normal, testable coverage gap (not an environment limitation), consistent with the standard applied in rounds 1 and 2. The other 2 new survivors are LOW severity and not spec-mandated. No new spec-precision gaps were found in the fresh Section 1 spot-check. All 3 gaps are now closed per the post-round-3 closure note above.

---

## 1. Per-requirement evidence

All 20 MODL requirements re-derived fresh against the current tree (line numbers re-verified against `apps/hub/src/evolution/modules.ts` and `apps/hub/src/registry/routes.ts` as read this round, not copied from round 2).

| Req | Acceptance Criterion (summary) | Implementation (file:line) | Test (file:line) | Verdict |
| --- | --- | --- | --- | --- |
| MODL-01 | Publish valid manifest → persist, digest, sign, SBOM, return `{moduleId,version,digest,signature,sbom}` | `modules.ts:149-201` (`publishModule`), digest `:74-76`, sign `:78-81,190`, SBOM `:125-132,191`; route `routes.ts:1323-1345` | `modules-publish.test.ts:60-76` — `body.digest === computeManifestDigest(manifest)` exactly, non-empty signature, exact SBOM object | PASS |
| MODL-02 | Republish identical manifest → idempotent replay, no 2nd row | `modules.ts:172-187` | `modules-publish.test.ts:78-89` | PASS |
| MODL-03 | Republish same version, different digest → 409 | `modules.ts:178` | `modules-publish.test.ts:91-98` | PASS |
| MODL-04 | Malformed manifest (missing id/publisher, bad SemVer, 0 components, bad component type, duplicate component ids) → 422 | `modules.ts:49-71` (`isValidManifest`); route `routes.ts:1331-1333` | `modules-publish.test.ts:107-151` — 6 distinct malformed cases, each 422, independently re-read this round | PASS |
| MODL-05 | Read version → `signatureValid: true` | `modules.ts:234-249` (`getModuleVersion`), `verifyStoredVersion` `:204-219`; route `routes.ts:1347-1356` | `modules-verify.test.ts:75-84` | PASS |
| MODL-06 | Tampered persisted manifest → `signatureValid: false`, no throw | `modules.ts:211-212` | `modules-verify.test.ts:86-99` | PASS |
| MODL-07 | Install w/ all caps granted → `active`, lockfile entry, history row | `modules.ts:327-385` (`installModule`); route `routes.ts:1365-1402` | `modules-install.test.ts:98-133` — exact response object, exact lockfile array, direct-SQL `seq === 1` assertion, all independently re-read this round | PASS |
| MODL-08 | Missing capability grant → 422 exact `missing` list, nothing persisted | `modules.ts:346-352`; route `routes.ts:1384-1387` | `modules-install.test.ts:135-151` | PASS |
| MODL-09 | Unknown module/version → 404 | `modules.ts:341`; route `routes.ts:1380-1381` | `modules-install.test.ts:163-176` (both cases) | PASS |
| MODL-10 | Signature doesn't reverify → 409 `signature_invalid`, nothing persisted | `modules.ts:343-344`; route `routes.ts:1382-1383` | `modules-install.test.ts:178-208` — manifest-tamper AND signature-column-corruption cases | PASS |
| MODL-11 | Read project lockfile → exact digest/version/capabilities | `modules.ts:397-406` (`getProjectLockfile`); route `routes.ts:1513-1520` | `modules-install.test.ts:116-127` | PASS |
| MODL-12 | Update, all new caps granted → new lockfile row, `{added,removed}` diff | `modules.ts:420-467` (`updateModule`), diff `:446-447`; route `routes.ts:1404-1439` | `modules-update.test.ts:111-136` (empty diff), `:155-166` (removed-capability case) — exact diff object, independently re-read this round | PASS |
| MODL-13 | New capability ungranted → 422 exact `added`, lockfile stays on prior version | `modules.ts:449-455`; route `routes.ts:1425-1428` | `modules-update.test.ts:168-188` | PASS |
| MODL-14 | Grant missing cap, retry update → succeeds | same code path | `modules-update.test.ts:190-206` | PASS |
| MODL-15 | Quarantine active install → `quarantined`; update on quarantined → 409 | `modules.ts:475-495` (`quarantineInstallation`), 409 guard `updateModule:443` | `modules-quarantine-rollback.test.ts:117-125` (status), `:135-146` (409 on update) | PASS |
| MODL-16 | Rollback to project-proven version → reverts lock, new history row, `active`, old rows preserved | `modules.ts:508-537` (`rollbackInstallation`) | `modules-quarantine-rollback.test.ts:148-172` | PASS |
| MODL-17 | Rollback to never-proven version → 409 `unproven_version` | `modules.ts:525-526`; route `routes.ts:1480-1481` | `modules-quarantine-rollback.test.ts:174-184` — independently re-read this round | PASS |
| MODL-18 | Uninstall → `uninstalled`, history preserved | `modules.ts:545-565` (`uninstallModule`, always `INSERT`) | `modules-uninstall.test.ts:125-137` (status+lockfile), `:150-169` (exact history rows) | PASS |
| MODL-19 | Update/rollback on uninstalled → both 409 | 409 guards `modules.ts:443` (update), `:523` (rollback) | `modules-uninstall.test.ts:171-186` | PASS |
| MODL-20 | List org modules → **latest** version digest + `signatureValid`; cross-org isolation | `modules.ts:260-289` (`listModules`, lateral join `order by created_at desc limit 1`, filtered `where m.org_id = $1`); route `routes.ts:1358-1363` | `modules-verify.test.ts:126-139` (exact object, cross-org `:141-151`) — **but only ever with 1 published version per module; see gap #1** | **PASS with a caveat** (behavior is correct today; the "latest" selection is untested against 2+ versions — see Section 2c) |

### Edge cases (spec.md "Edge Cases")

| Edge case | Implementation | Test | Verdict |
| --- | --- | --- | --- |
| Reinstall same active version → idempotent no-op | `modules.ts:356-370` | `modules-install.test.ts:210-226` | PASS |
| Zero-capability module installs without grant | `extractCapabilities` `[]` (`modules.ts:346-352`) | `modules-install.test.ts:153-161` | PASS |
| Cross-tenant → 403 on every new route | `requireOwnedProject`/`enforceCapability` guards | Cross-tenant test in every module test file (re-spot-checked: `modules-install.test.ts:243-255`, `modules-uninstall.test.ts:196-207`) | PASS |
| Duplicate component ids → 422 | `modules.ts:57-63` (`seenIds`) | `modules-publish.test.ts:140-151` | PASS |
| Install different version over active one → 409 `already_installed` | `modules.ts:373` | `modules-install.test.ts:228-241` | PASS |

**Spec-anchored spot-check** (6 requirements, deliberately a different sample than round 1 and round 2 — this round: **MODL-01, 04, 07, 12, 17, 20**): all 6 re-read against the current test file line ranges above. MODL-01/04/07/12/17 assert spec-exact values (exact digest, exact malformed-manifest 422 coverage, exact response/lockfile objects, exact `removed` diff, exact 409 title). MODL-20 is the one exception found this round — see Section 2c/4.

**Full suite**: `bash scripts/dev-db.sh start && pnpm --filter @evolution-os/hub test:int` → **58 test files / 364 tests, all passing** (re-run fresh this round from a clean shell, not trusted from round 2).

---

## 2. Discrimination sensor (mutation testing)

**Scratch location**: `/tmp/verify-slice7-round3-scratch` (full `cp -r` of the repo including `node_modules`), deleted after use — see Section 3.
**Method**: one mutation at a time in the real target files (`apps/hub/src/evolution/modules.ts`, `apps/hub/src/registry/routes.ts`) inside the scratch copy only, run the relevant test file or full suite, record kill/survive, hand-revert the exact edit (verified via `git diff`) before the next mutation. The real tree at `/home/user/evolution-os` was never touched during mutation testing.

### 2a. Re-confirmation of round 2's 3 gaps

| # | Mutation (round 2's original gap) | Target (file:line) | Test run | Result | Evidence |
| - | --- | --- | --- | --- | --- |
| R2-N3 | `quarantineInstallation`: relax the active-only guard to only reject `uninstalled` (silently allows re-quarantining an already-`quarantined` installation) | `modules.ts:484` | modules-quarantine-rollback | **KILLED** | Both `"rejects re-quarantining an already-quarantined installation with 409"` (`:215-225`) and `"determines the current installation by the highest seq value, not by insertion order"` (`:227-256`) fail: `expected 200 to be 409` |
| R2-N7 | Route: drop the `if (!body.version) return 422` guard on `POST .../install`, pass `body.version` through as `undefined` | `routes.ts:1374-1377` | modules-install | **KILLED** | `"rejects an install request body missing version with 422"` (`:257-270`) fails: `expected 404 to be 422` — falls through to `installModule`'s not-found path instead |
| R2-N1 | `getCurrentInstallation`: drop `order by seq desc`, keep `limit 1 for update` | `modules.ts:307-309` | full suite (58 files) | **SURVIVED**, independently re-confirmed — see 2c for a deeper investigation than round 2 performed | All 364 tests still pass |

Round 2's 2 test-backed fixes are confirmed closed. The 3rd (ORDER BY) is addressed below with new evidence, not just re-asserted.

### 2b. New round-3 mutations (functions/branches untouched by rounds 1-2)

| # | Mutation | Target (file:line) | Test run | Result | Evidence |
| - | --- | --- | --- | --- | --- |
| M1 | `extractCapabilities`: drop `.sort()`, return `[...set]` in `Set` insertion order instead of alphabetical | `modules.ts:140` | full suite | **SURVIVED** | All 364 tests still pass. No manifest in the suite declares `capabilities` across multiple components in an order where insertion order would differ from alphabetical, so no `missing`/`added`/`capabilities` array assertion ever exercises the ordering. Dedup itself is untouched (still `Set`-backed), so this is a coverage gap on ordering stability only |
| M2 | `isValidManifest`: fold the `Array.isArray(c.capabilities)` check so a non-array `capabilities` value (e.g. a string) silently passes validation instead of 422 | `modules.ts:65-68` | full suite | **SURVIVED** | All 364 tests still pass. No malformed-manifest test in `modules-publish.test.ts:107-151` sends `capabilities` as a non-array. Not an explicit MODL-04-listed case (the acceptance criterion enumerates id/publisher/0-components/bad-type/bad-SemVer/dup-ids, not capability-array-shape), so this is defensive code with no regression protection rather than an unmet acceptance criterion |
| M3 | `listModules`: flip the lateral join's `order by created_at desc limit 1` to `order by created_at asc limit 1` — returns the **oldest** published version as "latest" instead of the newest | `modules.ts:269` | full suite | **SURVIVED** | All 364 tests still pass. `modules-verify.test.ts:126-139` ("lists the org's published modules with the latest version's digest...") only ever publishes ONE version of the module under test, so `v.version`/`v.digest` in the response is correct regardless of ordering direction — the "latest" selection itself is never exercised against 2+ versions anywhere in the suite. This directly ties to MODL-20's literal acceptance text ("latest published version's digest") — see Section 4, gap #1 |
| M4 | `getProjectLockfile`: flip `order by module_id, seq desc` to `order by module_id, seq asc` — `distinct on (module_id)` now picks the first-ever installation row per module instead of the current one | `modules.ts:402` | full suite | **KILLED** (hard — 4 failures across 3 files) | `modules-quarantine-rollback.test.ts` ("quarantines an active installation"), `modules-uninstall.test.ts` ("uninstalls an active installation and removes it from the lockfile"), `modules-update.test.ts` ("updates when the new version's capabilities are all already granted...") all fail — the lockfile projection is well covered whenever a project's module has moved through more than one lifecycle state |

**Sensor tally**: round 2 re-confirmation 2/2 (test-backed) KILLED, ORDER BY finding independently re-confirmed SURVIVED (addressed in 2c, not counted as a fresh gap); round 3 new mutations 1 KILLED / 3 SURVIVED (4 mutations run, within the requested 3-4).

### 2c. Independent investigation of the `getCurrentInstallation` ORDER BY finding

Round 2 asserted this mutation was unobservable but did not investigate *why*, beyond noting the composite index `module_installations_current_idx (project_id, module_id, seq desc)` "happens to" preserve order. This round re-derived that claim from first principles with `EXPLAIN` rather than trusting it:

1. **Bare mutated query, any insertion order**: with rows inserted physically as seq `[3, 1, 2]` (deliberately non-monotonic), `EXPLAIN` on `select ... where project_id=$1 and module_id=$2 limit 1 [for update]` (no `ORDER BY`) shows Postgres choosing `Index Scan using module_installations_current_idx` at cost `0.14..8.16` — **not** a sequential scan. Because the index's trailing key is `seq desc`, an index scan over it naturally visits rows in `seq desc` order, so `LIMIT 1` returns the highest-`seq` row even with the `ORDER BY` clause deleted from the SQL text. Result: `seq = 3` (correct), confirmed for both the plain query and the `FOR UPDATE` variant (via a `LockRows` node wrapping the same index scan).
2. **Forcing a sequential scan** (`SET enable_indexscan/enable_indexonlyscan/enable_bitmapscan = off`, a session-level planner override no application code or HTTP client can trigger) with rows physically inserted in **descending** seq order (`3,2,1`): the seq scan happens to hit `seq=3` first anyway (physical order coincidentally matched correctness here) — inconclusive on its own.
3. **The decisive test**: forcing a sequential scan with rows inserted in **ascending** physical order (`1,2,3` — the natural, common insertion pattern): the forced seq scan returns `seq = 1`, the stale/oldest row — **definitively wrong**. This proves the mutation is a real bug in the general case, not a false alarm.

**Conclusion**: the mutation is a genuine latent defect, but it is provably unreachable through this codebase's actual query surface: `installModule`/`updateModule`/`quarantineInstallation`/`uninstallModule` all call `getCurrentInstallation` with an equality predicate on exactly the index's two leading columns plus `LIMIT 1`, which is the textbook case a cost-based planner will always prefer an available covering/ordering index for (cost ~0.14 vs. a full scan's cost growing with table size) — this is not a coincidence of today's tiny test tables, it is the same choice any Postgres planner would make at any realistic scale, since a full-table scan is never cheaper than a matching index scan for a highly selective compound-key lookup. No lever exists in the application, the HTTP surface, or a black-box integration test to disable index-scan planning and force the failure mode demonstrated in step 3. **This is judged an ACCEPTED, non-blocking residual gap**: real but structurally self-mitigating given the schema as shipped, and already documented in-code (`modules.ts:304-306`) plus covered by a test that (per round 2's own admission) does not kill this specific mutation but does exercise "highest seq wins" semantics via realistic data.

---

## 3. Cleanup verification

- Scratch copy: `/tmp/verify-slice7-round3-scratch`, created via `cp -r /home/user/evolution-os` (including `node_modules`), all 7 mutations (R2-N1 re-test, R2-N3 re-test, R2-N7 re-test, M1-M4) hand-reverted with `Edit`/`git checkout --` immediately after each test run, `git status --porcelain`/`git diff --stat` confirmed empty in the scratch copy before deletion, removed with `rm -rf` afterward.
- An ad hoc `verify_r3_manual` Postgres database (used only for the `EXPLAIN`/planner investigation in 2c, via a throwaway vitest probe file inside the scratch copy) was dropped; the probe file itself was deleted from the scratch copy before cleanup and never existed in the real tree.
- Real tree `git status --porcelain`: **empty**.
- Real tree `git diff --stat`: **empty**.
- No mutation was ever applied to `/home/user/evolution-os` — only to the isolated scratch copy. The only write to the real tree this round is this `validation.md`.

---

## 4. Ranked gap list (most severe first)

1. **[MEDIUM] `listModules` (`GET /orgs/current/modules`) selects the OLDEST published version as "latest" with zero test coverage of the multi-version case — Mutation M3 survived.**
   `modules.ts:265-271`'s lateral join (`order by created_at desc limit 1`) is what MODL-20 ("WHEN a client lists an org's published modules THEN the system SHALL return every module with its **latest** published version's digest") depends on for correctness. Flipping `desc` to `asc` — i.e., breaking "latest" into "earliest" — passed the entire 364-test suite unchanged, because `modules-verify.test.ts:126-139` (the only test asserting on `listModules`'s response shape) publishes exactly one version of the module it lists. No test in the suite ever publishes 2+ versions of the same module and then calls the registry-list endpoint. Unlike the `getCurrentInstallation` finding, this is not structurally protected by any index or planner behavior — it is a straightforward, deterministic regression a black-box HTTP test would trivially catch if one existed. This is the reason for this round's FAIL verdict: it is a real, testable gap directly tied to an explicit P1 acceptance criterion, not a hypothetical or environment-limited one.
   **Recommended fix** (for whoever picks this up outside the 3-round budget): publish v1 then v2 of the same module id, call `GET /orgs/current/modules`, assert `latestVersion === "2.0.0"` and `digest` matches v2's digest, not v1's.

2. **[LOW] `extractCapabilities`'s alphabetical sort has no test forcing it to matter — Mutation M1 survived.**
   `modules.ts:140` (`return [...set].sort()`) — removing `.sort()` (keeping the `Set`-based dedup intact) passed the full suite. Every manifest fixture in the test suite happens to declare capabilities in an order where `Set` insertion order already matches alphabetical order, so no `missing`/`added`/`capabilities` array assertion is sensitive to this. Not a correctness bug today (dedup is unaffected), but the ordering guarantee itself is untested.
   **Recommended fix**: one manifest fixture with capabilities declared out of alphabetical order across 2+ components, asserting the exact sorted array in a response.

3. **[LOW] `isValidManifest`'s capability-array type check has no negative test — Mutation M2 survived.**
   `modules.ts:65-68` — folding out the `Array.isArray(c.capabilities)` gate (so a non-array `capabilities` value silently passes validation) passed the full suite. Not an explicit MODL-04-enumerated 422 case (spec.md's list of malformed-manifest triggers does not mention capability-array shape), so this is existing defensive code without a matching acceptance criterion, not a spec violation — but it has zero regression protection.
   **Recommended fix**: a malformed-manifest test with `capabilities: "not-an-array"` on a component, asserting 422.

**Not counted as a gap** — `getCurrentInstallation`'s missing `ORDER BY` (round 2's original finding): independently re-derived via `EXPLAIN` this round (Section 2c) as a real-but-structurally-unreachable defect, given every call site's WHERE-clause shape and the composite index's cost advantage. Documented in-code. Judged ACCEPTED / non-blocking, consistent with round 2's characterization but on stronger evidence.

No additional spec-precision gaps were found in Section 1 this round — all 20 MODL requirements and all 5 listed edge cases remain backed by tests asserting spec-exact outcomes, with the single caveat on MODL-20 above. Round 1's and round 2's fixed gaps remain closed (Section 2a).
