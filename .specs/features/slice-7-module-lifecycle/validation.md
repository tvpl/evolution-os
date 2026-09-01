# Validation Report — Slice 7 Module Lifecycle

- **Result**: FAIL

Independent Verifier re-derivation of Slice 7 ("module-lifecycle") against `spec.md` (20 requirements, MODL-01..20), `design.md`, and `tasks.md`. All 20 EARS acceptance criteria are covered by tests that assert spec-exact outcomes (status codes, response shapes, DB state) — no spec-precision gaps were found in that phase. The FAIL verdict is driven entirely by the discrimination sensor (Section 2): 3 of 10 injected mutants survived the existing test suite, including one in the security-critical Ed25519 signature-verification path that is the explicit purpose of this slice's ADR-008 spike.

---

## 1. Per-requirement evidence

| Req | Acceptance Criterion (summary) | Implementation (file:line) | Test (file:line) | Verdict |
| --- | --- | --- | --- | --- |
| MODL-01 | Publish valid manifest → persist, digest, sign, SBOM, return `{moduleId,version,digest,signature,sbom}` | `apps/hub/src/evolution/modules.ts:149-201` (`publishModule`), digest at `:74-76`, sign at `:78-81,189-190`, SBOM at `:125-132,191` | `apps/hub/test/modules-publish.test.ts:60-76` — asserts `body.digest === computeManifestDigest(manifest)` exactly, non-empty signature, exact SBOM object | PASS |
| MODL-02 | Republish identical manifest → idempotent replay, no 2nd row | `modules.ts:176-187` (versionRow digest match → return existing) | `modules-publish.test.ts:78-89` — `second.json()` deep-equals `first.json()`; row count stays 1 | PASS |
| MODL-03 | Republish same version, different digest → 409 | `modules.ts:178` (`if (versionRow.digest !== digest) return {kind:"conflict"}`) | `modules-publish.test.ts:91-98` — 409, `title === "version_conflict"` | PASS |
| MODL-04 | Malformed manifest (missing id/version/publisher, 0 components, bad component type, non-SemVer, dup ids) → 422 | `modules.ts:49-71` (`isValidManifest`) | `modules-publish.test.ts:107-151` — 7 distinct malformed cases, each asserted 422 | PASS |
| MODL-05 | Read version → `signatureValid: true`, recomputed digest + reverified sig | `modules.ts:234-249` (`getModuleVersion`), `verifyStoredVersion` at `:204-219` | `modules-verify.test.ts:75-84` — `signatureValid === true` on fresh read | PASS |
| MODL-06 | Tampered persisted manifest → `signatureValid: false`, no throw | `modules.ts:211-212` (digest recompute mismatch short-circuits to `false`) | `modules-verify.test.ts:86-99` — direct SQL `UPDATE manifest`, then re-read: 200, `signatureValid === false` | PASS |
| MODL-07 | Install w/ all caps granted → `active`, lockfile entry, history row | `modules.ts:324-382` (`installModule`), route `apps/hub/src/registry/routes.ts:1365-1402` | `modules-install.test.ts:98-127` — exact object match on install response and lockfile entry | PASS |
| MODL-08 | Missing capability grant → 422 exact `missing` list, nothing persisted | `modules.ts:343-349` | `modules-install.test.ts:129-145` — 422, `title`, exact `missing` array, lockfile stays `[]` | PASS |
| MODL-09 | Unknown module/version → 404 | `modules.ts:331-338` | `modules-install.test.ts:157-170` — both unknown-module and unknown-version cases, 404 | PASS |
| MODL-10 | Signature doesn't reverify → 409 `signature_invalid`, nothing persisted | `modules.ts:340-341` | `modules-install.test.ts:172-185` — tamper manifest row, 409, exact title | PASS |
| MODL-11 | Read project lockfile → exact digest/version/capabilities | `modules.ts:394-403` (`getProjectLockfile`), route `routes.ts:1513-1520` | `modules-install.test.ts:116-127` (as part of MODL-07 test) — exact array match | PASS |
| MODL-12 | Update, all new caps granted → new lockfile row, `{added,removed}` diff | `modules.ts:417-464` (`updateModule`) | `modules-update.test.ts:111-136` (added/removed empty) and `:138-149` (removed capability case) — exact diff object | PASS |
| MODL-13 | New capability ungranted → 422 exact `added`, lockfile stays on prior version | `modules.ts:443,446-452` | `modules-update.test.ts:151-171` — 422, exact `added`, lockfile version unchanged | PASS |
| MODL-14 | Grant missing cap, retry update → succeeds | (same code path) | `modules-update.test.ts:173-189` — blocked then succeeds after grant | PASS |
| MODL-15 | Quarantine active install → `quarantined`; update on quarantined → 409 | `modules.ts:472-492` (`quarantineInstallation`), 409 guard in `updateModule:440` | `modules-quarantine-rollback.test.ts:109-125` (status), `:127-138` (409 on update) | PASS |
| MODL-16 | Rollback to project-proven version → reverts lock, new history row, `active`, old rows preserved | `modules.ts:505-534` (`rollbackInstallation`) | `modules-quarantine-rollback.test.ts:140-164` — exact lockfile + history count = 4 (install v1, update v2, quarantine, rollback v1) | PASS |
| MODL-17 | Rollback to never-proven version → 409 `unproven_version` | `modules.ts:522-523` | `modules-quarantine-rollback.test.ts:166-176` | PASS |
| MODL-18 | Uninstall → `uninstalled`, history preserved | `modules.ts:542-562` (`uninstallModule`, always `INSERT`) | `modules-uninstall.test.ts:125-137` (status+lockfile), `:150-169` (exact history rows incl. action/version/status per row) | PASS |
| MODL-19 | Update/rollback on uninstalled → both 409 | 409 guards `modules.ts:440` (update), `:520` (rollback) | `modules-uninstall.test.ts:171-186` | PASS |
| MODL-20 | List org modules → latest version digest + `signatureValid`; cross-org isolation | `modules.ts:260-289` (`listModules`, filtered `where m.org_id = $1`) | `modules-verify.test.ts:106-119` (exact object), `:121-131` (org-B never sees org-A's module, both read 404 and list-absence) | PASS |

### Edge cases (spec.md "Edge Cases")

| Edge case | Implementation | Test | Verdict |
| --- | --- | --- | --- |
| Reinstall same active version → idempotent no-op | `modules.ts:353-367` | `modules-install.test.ts:187-203` — same response, row count stays 1 | PASS |
| Zero-capability module installs without grant | `extractCapabilities` returns `[]`, loop no-ops (`modules.ts:344-349`) | `modules-install.test.ts:147-155` | PASS |
| Cross-tenant → 403 on every new route | `requireOwnedProject`/`enforceCapability` guards on every route, `routes.ts:1369-1373` etc. | Cross-tenant test in every module test file (install/update/quarantine/rollback/uninstall/lockfile) | PASS |
| Duplicate component ids → 422 | `modules.ts:57-63` (`seenIds` check) | `modules-publish.test.ts:140-151` | PASS |
| Install different version over active one (tasks.md T4, not in MODL list) → rejected | `modules.ts:368-370` (`already_installed`, 409) | `modules-install.test.ts:205-218` | PASS |

### Foundations (T1, T8)

| Item | Implementation | Test | Verdict |
| --- | --- | --- | --- |
| Migration applies, idempotent | `apps/hub/migrations/008_modules.sql:8-54` | `modules-migration.test.ts:19-33` | PASS |
| `module.write` grant for both dev tenants | `apps/hub/src/policy/policy.ts:101,120` | `modules-migration.test.ts:35-46` | PASS |
| `canonicalJson` reused (not duplicated) | `modules.ts:13,75` imports from `apps/hub/src/platform/canonical-json.ts:2-11` | N/A (design constraint) | PASS |
| `checkCapability`/`capability_grants` reused, no second policy engine | `modules.ts:14,346,449` import `policy/policy.ts:12-29` | Covered transitively by install/update tests | PASS |

**No spec-precision gaps found in this phase.** Every EARS acceptance criterion is backed by a test asserting the spec-defined exact outcome (status code, exact JSON shape/values, or exact DB row state), not merely "doesn't crash."

---

## 2. Discrimination sensor (mutation testing)

**Scratch location**: `/tmp/verify-slice7-scratch` (full `cp -r` of the repo, git-tracked, deleted after use — see Section 3).
**Baseline**: full `pnpm test:int` in scratch prior to any mutation — 58 files / 356 tests, all passing.
**Method**: one mutation at a time in `apps/hub/src/evolution/modules.ts`, run the relevant module test file(s), record kill/survive, `git checkout --` to revert before the next mutation.

| # | Mutation | Target (file:line) | Test run | Result | Evidence |
| - | -------- | ------------------- | -------- | ------ | -------- |
| 1 | Skip digest-recomputation gate in `verifyStoredVersion` — only verify crypto sig over the *stored* digest, never recompute | `modules.ts:211-212` | modules-verify, modules-install | **KILLED** | `modules-install.test.ts:172-185` fails (409 expected, got 201); `modules-verify.test.ts:86-99` fails (`signatureValid` expected false, got true) |
| 2 | Hard-code `verifyDigestSignature` to always return `true` (crypto check becomes a no-op) | `modules.ts:83-90` | modules-verify, modules-install, modules-update | **SURVIVED** | All 21 tests still pass — see gap #1 below |
| 3 | `updateModule` diff computed against new version's own capabilities twice (`added = newCapabilities.filter(c => !newCapabilities.includes(c))`) so `added` is always `[]` | `modules.ts:443` | modules-update | **KILLED** | `modules-update.test.ts:151-171` and `:173-189` fail (expected 422, got 200) |
| 4 | `installModule` calls `checkCapability` but discards the result, `missing` never populated | `modules.ts:345-347` | modules-install | **KILLED** | `modules-install.test.ts:129-145` fails (expected 422, got 201) |
| 5 | Drop `org_id` filter from `getModuleVersion`'s query (cross-org leak) | `modules.ts:241-243` | modules-verify | **KILLED** | `modules-verify.test.ts:121-131` fails (expected 404, got 200 — org B reads org A's module) |
| 6 | `rollbackInstallation` accepts any version, falling back to `rows[0]` when the requested version isn't in that project's history | `modules.ts:522-523` | modules-quarantine-rollback | **KILLED** | `modules-quarantine-rollback.test.ts:166-176` fails (expected 409, got 200) |
| 7 | `uninstallModule` issues a `DELETE` on `module_installations` instead of an `INSERT`-only append | `modules.ts:549-559` | modules-uninstall | **KILLED** | `modules-uninstall.test.ts:150-169` fails (history rows gone) and `:171-186` fails (404 instead of 409, no row left to find) |
| 8 | `publishModule`'s conflict check ignores the digest comparison, always returns `conflict` on any republish of an existing version | `modules.ts:178` | modules-publish | **KILLED** | `modules-publish.test.ts:78-89` fails (expected 201 replay, got 409) |
| 9 | Off-by-one: `nextSeq` base for a fresh install changed from `current?.seq ?? 0` to `current?.seq ?? 1` (first install gets `seq=2`, not `1`) | `modules.ts:373` | modules-install, modules-update, modules-quarantine-rollback, modules-uninstall | **SURVIVED** | All 28 tests still pass — see gap #3 below |
| 10 | `updateModule`'s capability check tested against **all** of the new version's capabilities (`newCapabilities`) instead of only `added` | `modules.ts:446-452` | modules-update, modules-quarantine-rollback | **SURVIVED** | All 13 tests still pass — see gap #2 below |

**Sensor tally**: 7 killed / 3 survived (10 mutations run — above the 6-9 requested).

---

## 3. Cleanup verification

- Scratch copy: `/tmp/verify-slice7-scratch`, created via `cp -r`, mutated/reverted with `git checkout --` after each trial, fully removed with `rm -rf` after the last mutation.
- Real tree `git status --porcelain`: empty.
- Real tree `git diff --stat`: empty.
- No `git stash` was used anywhere; all reverts were `git checkout --` inside the isolated scratch git working tree.

---

## 4. Ranked gap list (most severe first)

1. **[HIGH] Crypto signature verification has no test independent of digest recomputation — Mutation #2 survived.**
   `verifyStoredVersion` (`apps/hub/src/evolution/modules.ts:204-219`) first recomputes the digest and short-circuits to `false` on mismatch (`:211-212`), *then* calls `verifyDigestSignature` (`:83-90`). Every existing "signature invalid" test (`modules-install.test.ts:172-185`, `modules-verify.test.ts:86-99`) achieves its effect by mutating the persisted **manifest** (which changes the recomputed digest and is caught by the digest-equality check alone). None of them corrupts the persisted `signature` column while leaving `manifest`/`digest` untouched. Consequence: `verifyDigestSignature` could be replaced with a function that always returns `true` — i.e., the actual Ed25519 cryptographic verification that this slice's ADR-008 spike exists to prove — and the entire test suite would still pass. This is exactly the axis the spec's Independent Test for "Verificar assinatura" (spec.md P1 story #2) and MODL-06/MODL-10 are meant to exercise, but it is not independently covered.
   **Recommended fix**: add a test that directly `UPDATE`s `module_versions.signature` to a corrupted/garbage base64 string (or one signed by a different key) while leaving `manifest`/`digest` untouched, then asserts `signatureValid: false` on read and 409 on install.

2. **[MEDIUM] `updateModule`'s capability gate is not proven to check only `added` capabilities — Mutation #10 survived.**
   `modules.ts:446-452` intends to check only newly-added capabilities against `capability_grants` (per MOD-FR-013 / MODL-13's "blocking only on added capabilities" contract). Every existing update test keeps the base/unchanged capability's grant active throughout the test (`modules-update.test.ts` never revokes `module-test.base.read` before an update). Checking **all** of the new version's capabilities (not just `added`) produces identical results on every existing test path, because the unchanged capability is never revoked mid-scenario. Consequence: a regression that broadens the check to "all new-version capabilities" (which would incorrectly block an update whenever a previously-granted, still-present capability's grant is later revoked, even though no *new* permission is being requested) would go undetected.
   **Recommended fix**: add a test that installs v1, revokes the base capability's grant (but does not remove it from the new manifest), then updates to a v2 that keeps the same capability set — assert the update still succeeds (since it's not a *newly added* capability).

3. **[LOW] `module_installations.seq` numbering base is undocumented-by-test — Mutation #9 survived.**
   `design.md`'s data model documents `seq` as "1,2,3... por (project_id, module_id)" but no test asserts the first install actually gets `seq=1` (only relative ordering — `max(seq)`, `order by seq desc` — is exercised). Changing the base so the first row is `seq=2` passes all 28 install/update/quarantine/rollback/uninstall tests. This is an internal invariant with no external/API-observable contract in `spec.md` itself, so severity is low, but it is a documented design invariant with zero test coverage.
   **Recommended fix**: low priority; optionally assert `seq` starts at 1 in one install test via a direct query, if the invariant is considered load-bearing for future consumers of the raw table.

No additional spec-precision gaps were found in the outcome-check phase (Section 1) — all 20 MODL requirements and all 5 listed edge cases are backed by tests asserting spec-exact outcomes.
