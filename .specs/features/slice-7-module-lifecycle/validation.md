# Validation Report — Slice 7 Module Lifecycle

- **Result**: FAIL

**Round 2** — independent re-verification, superseding round 1's report entirely (not an append). Round 1's 3 surviving mutants were re-applied against the current tree and are now confirmed CLOSED by the fix commit `2545926`. A fresh discrimination sensor pass with 7 new adversarial mutations (different functions/branches than round 1) found 3 new surviving mutants in `getCurrentInstallation`, `quarantineInstallation`, and the install route's body validation — none in the crypto-signature path round 1 flagged. Per-requirement spec-precision coverage (Section 1) remains clean; the FAIL verdict is driven entirely by the discrimination sensor (Section 2).

---

## 1. Per-requirement evidence

All 20 MODL requirements re-derived fresh against the current tree (line numbers re-verified, not copied from round 1).

| Req | Acceptance Criterion (summary) | Implementation (file:line) | Test (file:line) | Verdict |
| --- | --- | --- | --- | --- |
| MODL-01 | Publish valid manifest → persist, digest, sign, SBOM, return `{moduleId,version,digest,signature,sbom}` | `apps/hub/src/evolution/modules.ts:149-201` (`publishModule`), digest `:74-76`, sign `:78-81,189-190`, SBOM `:125-132,191` | `apps/hub/test/modules-publish.test.ts:60-76` — `body.digest === computeManifestDigest(manifest)` exactly, non-empty signature, exact SBOM object | PASS |
| MODL-02 | Republish identical manifest → idempotent replay, no 2nd row | `modules.ts:172-187` | `modules-publish.test.ts:78-89` — `second.json()` deep-equals `first.json()`; row count stays 1 | PASS |
| MODL-03 | Republish same version, different digest → 409 | `modules.ts:178` | `modules-publish.test.ts:91-98` — 409, `title === "version_conflict"` | PASS |
| MODL-04 | Malformed manifest → 422 | `modules.ts:49-71` (`isValidManifest`) | `modules-publish.test.ts:107-151` — 7 distinct malformed cases, each 422 | PASS |
| MODL-05 | Read version → `signatureValid: true` | `modules.ts:234-249` (`getModuleVersion`), `verifyStoredVersion` `:204-219` | `modules-verify.test.ts:75-84` | PASS |
| MODL-06 | Tampered persisted manifest → `signatureValid: false`, no throw | `modules.ts:211-212` | `modules-verify.test.ts:86-99` — direct SQL `UPDATE manifest`, re-read: 200, `signatureValid === false` | PASS |
| MODL-07 | Install w/ all caps granted → `active`, lockfile entry, history row | `modules.ts:324-382` (`installModule`), route `apps/hub/src/registry/routes.ts:1365-1402` | `modules-install.test.ts:98-133` — exact object match on install response, lockfile entry, `seq === 1` | PASS |
| MODL-08 | Missing capability grant → 422 exact `missing` list, nothing persisted | `modules.ts:343-349` | `modules-install.test.ts:135-151` — 422, exact `missing` array, lockfile stays `[]` | PASS |
| MODL-09 | Unknown module/version → 404 | `modules.ts:331-338` | `modules-install.test.ts:163-176` — both unknown-module and unknown-version cases | PASS |
| MODL-10 | Signature doesn't reverify → 409 `signature_invalid`, nothing persisted | `modules.ts:340-341` | `modules-install.test.ts:178-208` — manifest-tamper case AND direct signature-column-corruption case, both 409 | PASS |
| MODL-11 | Read project lockfile → exact digest/version/capabilities | `modules.ts:394-403` (`getProjectLockfile`), route `routes.ts:1513-1520` | `modules-install.test.ts:116-127` — exact array match | PASS |
| MODL-12 | Update, all new caps granted → new lockfile row, `{added,removed}` diff | `modules.ts:417-464` (`updateModule`) | `modules-update.test.ts:111-136` (empty diff), `:155-166` (removed capability case) — exact diff object | PASS |
| MODL-13 | New capability ungranted → 422 exact `added`, lockfile stays on prior version | `modules.ts:443,446-452` | `modules-update.test.ts:168-188` — 422, exact `added`, lockfile version unchanged | PASS |
| MODL-14 | Grant missing cap, retry update → succeeds | (same code path) | `modules-update.test.ts:190-206` — blocked then succeeds after grant | PASS |
| MODL-15 | Quarantine active install → `quarantined`; update on quarantined → 409 | `modules.ts:472-492` (`quarantineInstallation`), 409 guard `updateModule:440` | `modules-quarantine-rollback.test.ts:109-125` (status), `:127-138` (409 on update) | PASS |
| MODL-16 | Rollback to project-proven version → reverts lock, new history row, `active`, old rows preserved | `modules.ts:505-534` (`rollbackInstallation`) | `modules-quarantine-rollback.test.ts:140-164` — exact lockfile + history count = 4 | PASS |
| MODL-17 | Rollback to never-proven version → 409 `unproven_version` | `modules.ts:522-523` | `modules-quarantine-rollback.test.ts:166-176` | PASS |
| MODL-18 | Uninstall → `uninstalled`, history preserved | `modules.ts:542-562` (`uninstallModule`, always `INSERT`) | `modules-uninstall.test.ts:125-137` (status+lockfile), `:150-169` (exact history rows incl. action/version/status per row) | PASS |
| MODL-19 | Update/rollback on uninstalled → both 409 | 409 guards `modules.ts:440` (update), `:520` (rollback) | `modules-uninstall.test.ts:171-186` | PASS |
| MODL-20 | List org modules → latest version digest + `signatureValid`; cross-org isolation | `modules.ts:260-289` (`listModules`, filtered `where m.org_id = $1`) | `modules-verify.test.ts:126-139` (exact object), `:141-151` (org-B never sees org-A's module) | PASS |

### Edge cases (spec.md "Edge Cases")

| Edge case | Implementation | Test | Verdict |
| --- | --- | --- | --- |
| Reinstall same active version → idempotent no-op | `modules.ts:353-367` | `modules-install.test.ts:210-226` — same response, row count stays 1 | PASS |
| Zero-capability module installs without grant | `extractCapabilities` returns `[]` (`modules.ts:344-349`) | `modules-install.test.ts:153-161` | PASS |
| Cross-tenant → 403 on every new route | `requireOwnedProject`/`enforceCapability` guards, `routes.ts:1369-1373` etc. | Cross-tenant test in every module test file | PASS |
| Duplicate component ids → 422 | `modules.ts:57-63` (`seenIds` check) | `modules-publish.test.ts:140-151` | PASS |
| Install different version over active one → 409 `already_installed` | `modules.ts:368-370` | `modules-install.test.ts:228-241` | PASS |

### Foundations

| Item | Implementation | Test | Verdict |
| --- | --- | --- | --- |
| Migration applies, idempotent | `apps/hub/migrations/008_modules.sql` | `modules-migration.test.ts` | PASS |
| `module.write` grant for both dev tenants | `apps/hub/src/policy/policy.ts:101,120` | `modules-migration.test.ts` | PASS |
| `canonicalJson` reused (not duplicated) | `modules.ts:13,75` | N/A (design constraint) | PASS |
| `checkCapability`/`capability_grants` reused | `modules.ts:14,346,449` | Covered transitively by install/update tests | PASS |

**Spec-anchored spot-check** (6 of 20 requirements picked at random — MODL-02, MODL-09, MODL-11, MODL-14, MODL-16, MODL-18 — re-read in full above): all 6 assert spec-defined exact values (exact digest equality, exact `missing`/`added`/`removed` arrays, exact lockfile/history row shapes with real field values), never status-code-only. No spec-precision gaps found in this phase.

**Full suite**: `bash scripts/dev-db.sh start && pnpm --filter @evolution-os/hub test:int` → **58 test files / 359 tests, all passing** (re-run fresh this round, not trusted from round 1).

---

## 2. Discrimination sensor (mutation testing)

**Scratch location**: `/tmp/verify-slice7-round2-scratch` (full `cp -r` of the repo including `node_modules`), deleted after use — see Section 3.
**Method**: one mutation at a time in the real target files (`apps/hub/src/evolution/modules.ts`, `apps/hub/src/registry/routes.ts`) inside the scratch copy only, run the relevant test file(s) or full suite, record kill/survive, hand-revert the exact edit before the next mutation. The real tree at `/home/user/evolution-os` was never touched during mutation testing.

### 2a. Re-confirmation of round 1's 3 fixed gaps

| # | Mutation (round 1's original gap) | Target (file:line) | Test run | Result | Evidence |
| - | --- | --- | --- | --- | --- |
| R1 | Hard-code `verifyDigestSignature` to always return `true` | `modules.ts:83-90` | modules-verify, modules-install | **KILLED** | `modules-install.test.ts:193-208` fails (409 expected, got 201); `modules-verify.test.ts:101-119` fails (`signatureValid` expected false, got true) — both are the new signature-column-corruption tests added by commit `2545926` |
| R2 | `updateModule`'s capability check tested against **all** new-version capabilities instead of only `added` | `modules.ts:446-452` | modules-update | **KILLED** | `modules-update.test.ts:138-153` fails (200 expected, got 422) — the new "unchanged capability revoked" test |
| R3 | Off-by-one: fresh-install `nextSeq` base changed from `current?.seq ?? 0` to `current?.seq ?? 1` (first install gets `seq=2`) | `modules.ts:373` | modules-install | **KILLED** | `modules-install.test.ts:128-132` fails (`seq` expected 1, got 2) — the new direct-seq assertion added by commit `2545926` |

All 3 of round 1's surviving mutants are now killed by the tests added in `2545926`. Round 1's gaps are confirmed closed.

### 2b. New round-2 mutations (different functions/branches from round 1)

| # | Mutation | Target (file:line) | Test run | Result | Evidence |
| - | --- | --- | --- | --- | --- |
| N1 | `getCurrentInstallation`: drop `order by seq desc`, keep `limit 1 for update` (returns an arbitrary row, not necessarily the latest) | `modules.ts:299-309`, specifically `:306` | full suite (58 files) | **SURVIVED** | All 359 tests still pass — see gap #1 below |
| N2 | `rollbackInstallation`: limit history scan to the 2 most recent rows instead of full history (`order by seq desc limit 2 for update`) | `modules.ts:505-517`, specifically `:515` | modules-quarantine-rollback | **KILLED** | `modules-quarantine-rollback.test.ts:140-164` fails (200 expected, got 409) — rollback to v1.0.0 is the 3rd-oldest of 3 history rows at that point, invisible to a `limit 2` scan |
| N3 | `quarantineInstallation`: relax the active-only guard to only reject `uninstalled` (silently allows re-quarantining an already-`quarantined` installation) | `modules.ts:472-492`, specifically `:481` | full suite (58 files) | **SURVIVED** | All 359 tests still pass — see gap #2 below |
| N4 | `installModule`: swap the replay-vs-`already_installed` comparison from `current.version === input.version` to `current.digest === version.digest` | `modules.ts:352-353` | modules-install | **EQUIVALENT MUTATION** — `computeManifestDigest` hashes the full canonical manifest, which always includes the `version` field, so two different version strings can never share a digest; the comparison is provably identical in every reachable case. Not counted as a gap. |
| N5 | `updateModule`: swap the `removed` diff to also compute against `newCapabilities` (duplicate of `added`'s logic, so `removed` is always `[]`) | `modules.ts:443-444` | modules-update | **KILLED** | `modules-update.test.ts:155-166` fails (`removed: ["module-test.base.read"]` expected, got `removed: []`) |
| N6 | `publishModule`: org-ownership conflict check compares `moduleRow.org_id` against `scope.workspaceId` instead of `scope.orgId` | `modules.ts:161` | full suite | **KILLED** (hard — 11 failures across 5 files) | `modules-publish.test.ts` idempotent-replay test, cross-org test, and every downstream install/update/quarantine-rollback test that republishes an already-published module id all fail |
| N7 | Route: drop the `if (!body.version) return 422 "invalid_install"` guard on `POST .../install`, pass `body.version` through as-is (`undefined`) | `routes.ts:1374-1377` | modules-install | **SURVIVED** | All 359 tests still pass — see gap #3 below (no test sends an install/update/rollback request with a missing `version` field) |

**Sensor tally**: round 1 re-confirmation 3/3 killed; round 2 new mutations 4 killed / 1 equivalent / 3 survived (7 mutations run, within the requested 5-7).

---

## 3. Cleanup verification

- Scratch copy: `/tmp/verify-slice7-round2-scratch`, created via `cp -r /home/user/evolution-os` (including `node_modules`, ~529M), every mutation hand-reverted with `Edit` immediately after its test run, final `diff` of both target files against the real tree confirmed byte-identical before deletion, removed with `rm -rf` after the last mutation.
- Real tree `git status --porcelain`: **empty**.
- Real tree `git diff --stat`: **empty**.
- No mutation was ever applied to `/home/user/evolution-os` — only to the isolated scratch copy. The only write to the real tree this round is this `validation.md`.

---

## 4. Ranked gap list (most severe first)

1. **[MEDIUM] `getCurrentInstallation`'s "latest installation" row is selected without `ORDER BY`, relying on undocumented Postgres scan-order behavior — Mutation N1 survived.**
   `modules.ts:299-309` is the single chokepoint used by `installModule`, `updateModule`, `quarantineInstallation`, and `uninstallModule` to determine the "current" state of a project's module installation (`... order by seq desc limit 1 for update`). Removing `order by seq desc` (keeping `limit 1 for update`) still passed all 359 tests, because on this Postgres version/query-planner/table-size combination, a sequential scan with no `ORDER BY` happens to return rows in physical (insertion) order for these freshly-populated, never-`VACUUM`'d test tables — so `limit 1` without ordering incidentally still returns the newest row in every test scenario exercised. This is not a guarantee: Postgres explicitly documents that row order is undefined without `ORDER BY`, and a different query plan (e.g. once the unique index on `(project_id, module_id, seq)` is chosen by the planner instead of a seq scan, or after `ANALYZE`/`VACUUM`, or on a different Postgres version) could return the *oldest* row instead, silently treating a stale install/quarantine/uninstall state as "current" across every lifecycle route. No test exercises this because none of the existing multi-row scenarios (install→update, install→quarantine) would fail either way — the "active" status only ever appears on the true-latest row in every current test's data shape, so a wrong-but-plausible row often still has the same `status` value.
   **Recommended fix**: this is arguably already correct-by-accident; the real gap is that the code has no test proving `ORDER BY` matters. Add a test that inserts installation rows out of natural correctness order relevance (e.g., install→quarantine→attempt a second quarantine, asserting the SECOND quarantine correctly reports `invalid_transition` against the truly-latest `quarantined` row, not row 1) to make the ordering load-bearing and test-visible. This overlaps with gap #2 below and one added test could cover both.

2. **[LOW-MEDIUM] `quarantineInstallation` re-quarantining an already-`quarantined` (or previously-`uninstalled`) installation has no negative test — Mutation N3 survived.**
   `modules.ts:481` currently guards `if (current.status !== "active") return { kind: "invalid_transition" }`, blocking quarantine of a non-`active` installation. Relaxing this to only reject `uninstalled` (silently allowing re-quarantine of an already-`quarantined` install, appending a redundant history row) still passed all 359 tests — no test ever calls `quarantine` twice in a row, or calls `quarantine` after `uninstall`. `spec.md` MODL-15 only specifies the positive case ("quarantines an active installation") and design.md's error-handling table only documents 409 for *update/rollback* on a non-active installation, not for quarantine-on-quarantine itself — so this is a test-coverage gap for an existing implementation guard rather than an unmet acceptance criterion, but the guard exists in the shipped code for a reason (idempotency/state-machine hygiene) and a regression removing it would go undetected today.
   **Recommended fix**: add a test asserting `quarantine` on an already-`quarantined` installation returns 409 `invalid_transition` (and, separately, on an `uninstalled` one).

3. **[LOW] `POST .../install`'s (and equally `.../update`, `.../rollback`) `version is required` 422 body-validation path is untested — Mutation N7 survived.**
   `routes.ts:1374-1377` (and the identical pattern at `:1414-1416` for update, `:1471-1473` for rollback) returns 422 `invalid_install`/`invalid_update`/`invalid_rollback` when the request body omits `version`. Removing this guard on the install route still passed all 359 tests — no test ever POSTs to install/update/rollback with a missing `version` field. Without the guard, a missing-`version` request now falls through to `installModule` with `version: undefined`, which fails to match any row and surfaces as 404 `not_found` instead of 422 — a less precise but not incorrect-in-spirit error (spec.md does not define a body-shape validation acceptance criterion for these routes, so this is a defensive-coding path with no explicit spec anchor, hence LOW not MEDIUM).
   **Recommended fix**: add one test per route (install/update/rollback) posting `{}` and asserting 422 with the documented `title`.

No additional spec-precision gaps were found in Section 1 — all 20 MODL requirements and all 5 listed edge cases remain backed by tests asserting spec-exact outcomes. The FAIL verdict is driven entirely by the 3 new discrimination-sensor gaps above; round 1's 3 gaps are confirmed closed and require no further action.
