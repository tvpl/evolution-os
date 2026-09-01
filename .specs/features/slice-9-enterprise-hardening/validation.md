# Slice 9 — Enterprise Hardening Validation

**Date**: 2026-09-01
**Spec**: `.specs/features/slice-9-enterprise-hardening/spec.md`
**Diff range (round 2 fix)**: `96d27b9..5a1f8dd` (1 commit: `5a1f8dd`)
**Diff range (full feature)**: `bfd6a48..5a1f8dd`
**Verifier**: independent sub-agent, round 2 (author ≠ verifier — fresh eyes, no context inherited from round 1)

**Result**: PASS ✅ — both round 1 findings are confirmed closed. 22/22 HARD-NN acceptance criteria are precisely covered with matching spec-defined outcomes. The 3 previously-missing 403 tests were independently re-derived (not just trusted): each corresponding guard-removal mutation was re-applied in a fresh isolated worktree and confirmed to fail the relevant new test before being reverted. A fresh round-2 discrimination sensor (4 new mutations, targets never touched by round 1) was killed 4/4. Full gate: 443 hub tests + 35 non-hub tests, all passing. Build gate (`typecheck`, `test`, `check_docs.py`) also green. This is the last slice of the 10-slice roadmap — with this PASS, all planned slices are covered by spec-driven execution.

---

## Round 1 — Historical Record (for context only; superseded by this report)

Round 1's own verdict line stated FAIL ❌, citing one Major finding and one Minor finding:

1. **(Major, confirmed surviving mutant)** The `admin.write` capability guard on `POST /orgs/current/retention`, `POST /orgs/current/retention/sweep`, and `POST /orgs/current/users/:userId/deactivate` was implemented correctly in `apps/hub/src/registry/routes.ts` but had zero test coverage. Round 1's sensor deleted the guard from the retention route and the full 441-test suite still passed green — a real, evidence-backed gap, not speculation.
2. **(Minor, spec-precision)** HARD-05's AC text named "the fleet list or revoke route" for a 403-cross-tenant outcome, but the design's own read-route Assumption (org always from session, never from a path parameter) makes that outcome structurally unreachable for the list route — the wording was broader than what the deliberate, documented design supports.

Both were fixed in commit `5a1f8dd`: one 403/`capability_denied` test was added per route to `apps/hub/test/hardening-retention.test.ts` (covering both `POST /orgs/current/retention` and `POST /orgs/current/retention/sweep` in a single test) and `apps/hub/test/hardening-users.test.ts` (covering `POST /orgs/current/users/:userId/deactivate`); HARD-05's AC text and traceability-table description in `spec.md` were narrowed to the revoke route only. No production code changed in the fix commit — only tests and the spec wording.

This round independently re-verifies both fixes from scratch rather than trusting that record — see below.

---

## Task Completion

| Task | Status  | Notes |
| ---- | ------- | ----- |
| T1   | ✅ Done | Migration `010_hardening.sql` re-read this round: adds `audit_log.entry_hash`/`prev_hash`, `evidence.redacted_at`, `users.deactivated_at`, `org_retention_policies` — matches design exactly. |
| T2   | ✅ Done | Node fleet list/revoke in `apps/hub/src/evolution/hardening.ts` + `apps/hub/src/registry/routes.ts:1699-1719`. |
| T3   | ✅ Done | `recordAudit`/`verifyAuditChain` in `apps/hub/src/policy/policy.ts:65-157`; hash chain computed internally, public signature unchanged. |
| T4   | ✅ Done | `GET /orgs/current/audit/export` at `apps/hub/src/registry/routes.ts:1721-1726`, reuses `exportAuditLog`/`verifyAuditChain`. |
| T5   | ✅ Done | Retention policy + sweep at `apps/hub/src/registry/routes.ts:1728-1755`; redaction never deletes rows (confirmed by direct read of `sweepEvidenceRetention`). |
| T6   | ✅ Done | User deactivation wired; `apps/hub/src/server.ts` `dev-login` gained the `deactivated_at` / `identity_deactivated` check. |
| T7   | ✅ Done | Docs closeout — `check_docs.py` passes clean this round (0 problems in 71 files) and `validate_spec.py` on the edited spec exits 0 errors/0 warnings. |
| Fix 1 (round 1) | ✅ Done | 3 missing 403 tests added in `5a1f8dd` — independently re-verified this round by re-applying each guard-removal mutation (see Discrimination Sensor). |
| Fix 2 (round 1) | ✅ Done | HARD-05 AC text + traceability row narrowed to the revoke route only — re-read fresh this round, confirmed to now precisely match the tested behavior. |

---

## Spec-Anchored Acceptance Criteria

All 22 requirements re-derived from scratch this round (not inherited from round 1's table) by reading `spec.md`, the source files, and the test files directly.

| Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| HARD-01: revoke sets `revoked_at`, subsequent auth denied | 401 on next `authenticateNode` call for that Node, reusing Slice 2's unchanged check | `apps/hub/test/hardening-nodes.test.ts:72-78` — `expect(res.json()).toMatchObject({nodeId, revoked:true})`; `expect(after.statusCode).toBe(401); expect(after.json().title).toBe("node_unauthorized")` | ✅ PASS |
| HARD-02: fleet list, exact revoked status | active Node's `revokedAt` is `null`, revoked Node's is non-null | `apps/hub/test/hardening-nodes.test.ts:91-92` — `expect(active?.revokedAt).toBeNull(); expect(revoked?.revokedAt).not.toBeNull()` | ✅ PASS |
| HARD-03: revoke unknown/other-org Node → 404 | 404, never confirms existence | `apps/hub/test/hardening-nodes.test.ts:97` (unknown), `:103` (other org) — `expect(res.statusCode).toBe(404)` | ✅ PASS |
| HARD-04: revoke already-revoked → idempotent no-op | 200, `revoked_at` byte-for-byte unchanged | `apps/hub/test/hardening-nodes.test.ts:106-117` — `expect(row2.rows[0].revoked_at).toEqual(revokedAt1)` (exact timestamp equality) | ✅ PASS |
| HARD-05: revoke without `admin.write` capability → 403 | 403 `capability_denied` on the revoke route (AC text narrowed to revoke only this round; list route has no capability by design — see Assumptions) | `apps/hub/test/hardening-nodes.test.ts:119-124` — `expect(res.statusCode).toBe(403); expect(res.json().title).toBe("capability_denied")` | ✅ PASS — spec-precision gap from round 1 is closed: the AC text now matches exactly what is tested and what the design supports |
| HARD-06: new entry chains `entry_hash` to prior entry of same org | `second.prevHash === first.entryHash`, hashes differ | `apps/hub/test/hardening-audit-chain.test.ts:43-44` — `expect(second.prevHash).toBe(first.entryHash); expect(first.entryHash).not.toBe(second.entryHash)` | ✅ PASS |
| HARD-07: unaltered chain verifies valid | `{valid: true}` | `apps/hub/test/hardening-audit-chain.test.ts:55-60` — `expect(verdict).toEqual({valid: true})` (3-entry chain) | ✅ PASS |
| HARD-08: direct tamper detected at exact entry | `{valid: false, brokenAtId: <exact id>}` | `apps/hub/test/hardening-audit-chain.test.ts:74-89` — `expect(after).toEqual({valid: false, brokenAtId: middleId})` | ✅ PASS |
| HARD-09: first entry of an org uses genesis | `prevHash === "genesis"` | `apps/hub/test/hardening-audit-chain.test.ts:47-52` — `expect(row.rows[0].prevHash).toBe(AUDIT_GENESIS)` | ✅ PASS |
| HARD-10: export returns full ordered trail + chain verdict | entries in ascending `id` order, `chainValid: true`; empty org → `{entries: [], chainValid: true}` | `apps/hub/test/hardening-audit-export.test.ts:58-64` — `expect(bodyA.chainValid).toBe(true); expect(idsAscending).toEqual([...idsAscending].sort(...))`; `hardening-audit-export.test.ts:97-101` — `expect(res.json()).toEqual({entries: [], chainValid: true})` | ✅ PASS |
| HARD-11: export never leaks another org's entries | no id from org B's export appears in org A's export or vice versa | `apps/hub/test/hardening-audit-export.test.ts:70-74` — `for (const id of idsB) expect(idsA.has(id)).toBe(false)` | ✅ PASS |
| HARD-12: positive integer window persists | row in `org_retention_policies` with exact value | `apps/hub/test/hardening-retention.test.ts:92-97` — `expect(row.rows[0].days).toBe(90)` | ✅ PASS |
| HARD-13: non-positive/non-integer window → 422 | 422 `invalid_retention_window` for `0, -1, 1.5, "30", null, undefined` | `apps/hub/test/hardening-retention.test.ts:99-105` — loop asserting `res.statusCode===422` and `title==="invalid_retention_window"` for all 6 values | ✅ PASS |
| HARD-14: sweep without configured policy → 422 | 422 `retention_not_configured` | `apps/hub/test/hardening-retention.test.ts:107-111` | ✅ PASS |
| HARD-15: sweep redacts old evidence, exact count, row not deleted | `content_excerpt=null`, `redacted_at` set, `content_digest` unchanged, `redactedCount` exact | `apps/hub/test/hardening-retention.test.ts:135-145` — `expect(res.json().redactedCount).toBe(1); expect(oldRow.rows[0].content_excerpt).toBeNull(); expect(oldRow.rows[0].content_digest).toBe(digestBefore); expect(oldRow.rows[0].redacted_at).not.toBeNull()` | ✅ PASS |
| HARD-16: in-window evidence untouched | `content_excerpt` and `redacted_at` unchanged | `apps/hub/test/hardening-retention.test.ts:147-152` — `expect(freshRow.rows[0].content_excerpt).toBe("evidência recente..."); expect(freshRow.rows[0].redacted_at).toBeNull()` | ✅ PASS |
| HARD-17: referencing claim/decision lineage preserved after redaction | claim statement intact, `claim_evidence` link count unchanged | `apps/hub/test/hardening-retention.test.ts:154-160` — `expect(claimRow.rows[0].statement).toBe(...); expect(linkRow.rows[0].n).toBe(1)` | ✅ PASS |
| HARD-18: deactivate sets `deactivated_at` | non-null after call | `apps/hub/test/hardening-users.test.ts:60-66` — `expect(res.json()).toMatchObject({userId:"user_dev_a", deactivated:true}); expect(row.rows[0].deactivated_at).not.toBeNull()` | ✅ PASS |
| HARD-19: `dev-login` of deactivated user → 401 `identity_deactivated`, distinct from `unknown_identity` | exact distinct error titles | `apps/hub/test/hardening-users.test.ts:68-75` — `expect(attempt.json().title).toBe("identity_deactivated"); expect(unknown.json().title).toBe("unknown_identity"); expect(unknown.json().title).not.toBe(attempt.json().title)` | ✅ PASS |
| HARD-20: deactivate unknown/other-org user → 404 | 404, no state change on cross-org attempt | `apps/hub/test/hardening-users.test.ts:47-50` (unknown), `:52-58` (other org, plus `expect(row.rows[0].deactivated_at).toBeNull()`) | ✅ PASS |
| HARD-21: deactivate already-deactivated → idempotent | exact timestamp unchanged | `apps/hub/test/hardening-users.test.ts:78-87` — `expect(row2.rows[0].deactivated_at).toEqual(first)` | ✅ PASS |
| HARD-22: user list, exact active/deactivated status | `deactivatedAt` reflects true state | `apps/hub/test/hardening-users.test.ts:89-95` — `expect(a?.deactivatedAt).not.toBeNull()` | ✅ PASS |

**Status**: ✅ 22/22 ACs precisely matched the spec-defined outcome. No spec-precision gaps remain (HARD-05's round-1 gap is closed).

---

## Discrimination Sensor

Two sensor passes this round, both run in a single throwaway `git worktree` (`git worktree add <scratch> HEAD`, sibling `node_modules`/workspace-package `node_modules` symlinked in for pnpm resolution — `git stash` never used), tests run via `npx vitest run <file>` scoped to the affected test file, each mutation reverted with `git checkout -- <file>` immediately after confirming the kill, and the worktree removed with `git worktree remove --force` at the end. `git status --porcelain` on the real tree was captured empty before any sensor work and confirmed empty again after worktree removal — isolation held throughout.

### Pass 1 — independent re-verification of round 1's fix (3 mutations, one per previously-uncovered route)

Round 1's claim ("deleting the guard leaves the suite green") was not trusted — each guard was independently deleted, tested, and reverted in this round's own worktree run.

| # | File:line | Description | Killed? |
| - | --------- | ------------ | ------- |
| 1 | `apps/hub/src/registry/routes.ts:1731-1734` | Removed the `enforceCapability(pool, scope, "admin.write", ...)` guard block from `POST /orgs/current/retention` | ✅ Killed — `hardening-retention.test.ts` new HARD-05-pattern test fails: `expected 200 to be 403` |
| 2 | `apps/hub/src/registry/routes.ts:1746-1749` | Removed the `enforceCapability` guard block from `POST /orgs/current/retention/sweep` | ✅ Killed — same test fails: `expected 422 to be 403` (the unguarded sweep falls through to `retention_not_configured` for `org_dev_b`, which never had a policy set in this test file — still a clear, correct kill since 403 is never returned) |
| 3 | `apps/hub/src/registry/routes.ts:1767-1770` | Removed the `enforceCapability` guard block from `POST /orgs/current/users/:userId/deactivate` | ✅ Killed — `hardening-users.test.ts` new HARD-05-pattern test fails: `expected 200 to be 403` |

### Pass 2 — fresh round-2 sensor (4 new mutations, targets never mutated in round 1)

| # | File:line | Description | Killed? |
| - | --------- | ------------ | ------- |
| 4 | `apps/hub/src/evolution/hardening.ts:51` | `setRetentionPolicy` validation: `evidenceRetentionDays <= 0` → `evidenceRetentionDays < 0` (boundary flip — `0` would now be accepted as a valid window) | ✅ Killed — `hardening-retention.test.ts` HARD-13 fails on the `0` case (`expected 200 to be 422`) and HARD-14 cascades to fail too (`0` now persists a policy, so the "no policy configured" 422 check also breaks) |
| 5 | `apps/hub/src/evolution/hardening.ts:15` | `listNodeFleet`'s `where org_id = $1` filter dropped from the query (org-scoping removed, `$1` param left unused/mismatched) | ✅ Killed — `hardening-nodes.test.ts` fails 2 tests: HARD-02 (`expected 500 to be 200`, unused bind param) and "never leaks another org's nodes" (`TypeError` on the malformed response) |
| 6 | `apps/hub/src/policy/policy.ts:168` | `exportAuditLog`'s `order by id asc` → `order by id desc` | ✅ Killed — `hardening-audit-export.test.ts` fails: `idsAscending` `[2,1]` no longer deep-equals its own sorted-ascending copy `[1,2]` |
| 7 | `apps/hub/src/policy/policy.ts:45-57` (`computeEntryHash`) | Field-composition fault: `reason` excluded from the object hashed (`const { reason: _reason, ...hashed } = fields`) — both `recordAudit`'s write-time hash and `verifyAuditChain`'s recompute stop incorporating `reason`, so a direct tamper on `reason` is no longer detectable | ✅ Killed — `hardening-audit-chain.test.ts` HARD-08 fails: `expected {valid:true} to deeply equal {valid:false, brokenAtId:'9'}` — the exact tamper-detection guarantee HARD-08 requires is defeated by this fault, and the test catches it |

**Sensor depth**: lightweight (7 total mutations across both passes — 3 re-verifying round 1's fix, 4 fresh — well above the 3-5 minimum for a standard-tier feature).

**Sensor outcome**: 7/7 killed, 0 survived — ✅ PASS.

**Isolation check**: `git status --porcelain` on the real tree — empty before Pass 1, empty after Pass 1, empty after Pass 2, empty after worktree removal. No mutation ever touched the real working tree.

---

## Interactive UAT Results

Not performed — backend-only administrative/infrastructure feature (Node fleet, audit chain, retention, user deprovisioning) with no UI. Per `validate.md` §3, automated checks are sufficient for backend-only work. Consistent with round 1.

---

## Code Quality

| Principle | Status |
| --- | --- |
| Minimum code | ✅ — round 2's diff is 2 test files + 1 spec wording edit; no production code changed |
| Surgical changes | ✅ — each new test mirrors the existing `hardening-nodes.test.ts` HARD-05 pattern exactly (delete grant, call route, assert 403/`capability_denied`, re-insert grant) |
| No scope creep | ✅ — `git diff 96d27b9..5a1f8dd --stat` touches exactly 3 files: `spec.md`, `hardening-retention.test.ts`, `hardening-users.test.ts` |
| Matches patterns | ✅ — reuses `pool.query` grant-delete/re-insert idiom already established in `hardening-nodes.test.ts:119-130` |
| Spec-anchored outcome check (asserted values match spec) | ✅ — 22/22 exact, no gaps remaining |
| Per-layer Coverage Expectation met (domain 1:1 ACs; routes happy+edge+error) | ✅ — all 4 `admin.write`-gated write routes now have a capability-denied test; confirmed empirically via Pass 1 above, not just by reading the diff |
| Every test maps to a spec requirement — no unclaimed tests | ✅ — both new tests are directly attributable to HARD-05's guard pattern applied to the 3 previously-uncovered routes |
| Documented guidelines followed | `AGENTS.md` (integration-against-real-Postgres convention) — followed throughout; no deviation found |

---

## Edge Cases

- [x] Cross-tenant 403 on **every** write route introduced by this slice (spec.md Edge Cases, first bullet, and HARD-05): now tested on all 4 — `hardening-nodes.test.ts:119-130` (revoke), `hardening-retention.test.ts:169-182` (set-policy + sweep), `hardening-users.test.ts:108-120` (deactivate). This closes round 1's flagged edge-case gap.
- [x] Single-entry org audit chain valid by construction: `hardening-audit-chain.test.ts:63-67`.
- [x] Zero-entry org audit chain valid (vacuously): `hardening-audit-chain.test.ts:69-72` and export-side `hardening-audit-export.test.ts:97-101`.
- [x] Sweep with zero eligible rows returns count `0`, not an error: `hardening-retention.test.ts:163-167`.
- [x] Re-enrolling a revoked Node id: no new behavior claimed by this slice — correctly deferred to Slice 2's existing enrollment tests, out of this slice's diff surface (unchanged from round 1).

---

## Gate Check

- **Gate command**: `bash scripts/dev-db.sh start && pnpm test:unit && pnpm test:int` (Full gate, per tasks.md) — re-run independently this round, not inherited from round 1's report
- **Outcome**: 443 hub integration tests passed, 0 failed, 0 skipped (plus 20 contract unit tests, 7 node unit tests, 8 node integration tests — all passing)
- **Build gate also re-run**: `pnpm typecheck` (all 5 workspace packages clean) + `python3 scripts/check_docs.py` (`0 problema(s) em 71 arquivo(s)`) + `validate_spec.py` on the edited `spec.md` (`0 error(s), 0 warning(s)`)
- **Test count before round 2 fix** (at `96d27b9`): 441 hub tests
- **Test count after round 2 fix**: 443 hub tests
- **Delta**: +2 new tests (1 in `hardening-retention.test.ts` covering 2 routes, 1 in `hardening-users.test.ts` covering 1 route) — matches the stated "441 + 2 = 443"
- **Skipped tests**: none
- **Failures**: none

---

## Fix Plans

None. Both round-1 findings are closed and independently re-verified above; the round-2 discrimination sensor found no new gaps.

---

## Requirement Traceability Update

| Requirement | Previous Status (round 1) | New Status (round 2) |
| --- | --- | --- |
| HARD-01 | ✅ Verified | ✅ Verified |
| HARD-02 | ✅ Verified | ✅ Verified |
| HARD-03 | ✅ Verified | ✅ Verified |
| HARD-04 | ✅ Verified | ✅ Verified |
| HARD-05 | ⚠️ Verified with spec-precision gap | ✅ Verified (gap closed — AC text now matches tested behavior exactly) |
| HARD-06 | ✅ Verified | ✅ Verified |
| HARD-07 | ✅ Verified | ✅ Verified |
| HARD-08 | ✅ Verified | ✅ Verified |
| HARD-09 | ✅ Verified | ✅ Verified |
| HARD-10 | ✅ Verified | ✅ Verified |
| HARD-11 | ✅ Verified | ✅ Verified |
| HARD-12 | ✅ Verified | ✅ Verified |
| HARD-13 | ✅ Verified | ✅ Verified |
| HARD-14 | ✅ Verified | ✅ Verified |
| HARD-15 | ✅ Verified | ✅ Verified |
| HARD-16 | ✅ Verified | ✅ Verified |
| HARD-17 | ✅ Verified | ✅ Verified |
| HARD-18 | ✅ Verified | ✅ Verified |
| HARD-19 | ✅ Verified | ✅ Verified |
| HARD-20 | ✅ Verified | ✅ Verified |
| HARD-21 | ✅ Verified | ✅ Verified |
| HARD-22 | ✅ Verified | ✅ Verified |

---

## Summary

**Overall**: ✅ Ready

**Spec-anchored check**: 22/22 ACs matched the spec-defined outcome precisely; 0 spec-precision gaps remain.
**Sensor**: 7/7 mutations killed (3 independently re-verifying round 1's fix, 4 fresh round-2 mutations on untouched targets), 0 survived.
**Gate**: 443 hub tests passed, 0 failed (plus 35 non-hub tests passed); Build gate (typecheck, check_docs.py, validate_spec.py) also clean.

**What works**: Node fleet kill switch reuses Slice 2's `authenticateNode`/`revoked_at` check with zero modification and is denied correctly post-revoke; the audit hash chain is computed inside `recordAudit` with its public signature untouched, correctly detects both a broken link and a same-position field tamper (independently re-confirmed this round by mutating `computeEntryHash`'s field composition directly), and identifies the exact `id`; audit export is org-isolated, correctly ordered, and vacuously valid for an empty org; the retention sweep redacts exactly the eligible rows, never deletes, preserves `content_digest` and all referencing claim/decision lineage, leaves in-window evidence completely untouched, and correctly rejects an invalid window at its exact boundary (`0` is rejected, confirmed by an independent boundary-flip mutation); user deactivation is idempotent, 404s correctly on unknown/cross-org ids, and `dev-login` returns a distinct `identity_deactivated` 401; **and, closing round 1's gap**, all 4 `admin.write`-gated write routes (revoke, set-retention, sweep, deactivate) now return 403/`capability_denied` when the capability is absent, each independently confirmed by re-applying the corresponding guard-removal mutation in a fresh isolated worktree and watching the new test fail before reverting.

**Issues found**: None this round. Both round-1 findings (the coverage gap and the HARD-05 wording) are closed and independently re-verified from scratch, not inherited.

**Next steps**: None required for this slice. This is the last of the 10-slice roadmap ([build-sequence](../../../docs/06-delivery/05-build-sequence.md)) — with HARD-01..22 implemented, tested, and independently verified clean on this second round, the roadmap's planned spec-driven execution is complete.
