# Slice 9 — Enterprise Hardening Validation

**Date**: 2026-09-01
**Spec**: `.specs/features/slice-9-enterprise-hardening/spec.md`
**Diff range**: `bfd6a48..2b42c13` (7 commits: `b1a2379`, `2d7c2ed`, `19217b3`, `a1e778a`, `08b8080`, `203ce26`, `2b42c13`)
**Verifier**: independent sub-agent (author ≠ verifier)

**Result**: FAIL ❌ — one confirmed surviving mutant (test-coverage gap on `admin.write` enforcement for 3 of 4 write routes; see Discrimination Sensor and Fix Plan 1). No functional defect: all 22 HARD-NN acceptance criteria behave per spec.

---

## Task Completion

| Task | Status  | Notes |
| ---- | ------- | ----- |
| T1   | ✅ Done | Migration `010_hardening.sql` applies cleanly and idempotently; `admin.write` granted to both dev tenants. |
| T2   | ✅ Done | Node fleet list/revoke wired in `hardening.ts` + `routes.ts`. |
| T3   | ✅ Done | `recordAudit` computes chained `entry_hash`/`prev_hash` internally; `verifyAuditChain` added. |
| T4   | ✅ Done | `GET /orgs/current/audit/export` wired, reuses `verifyAuditChain`. |
| T5   | ✅ Done | Retention policy + sweep wired; redaction verified never to delete rows. |
| T6   | ✅ Done | User deactivation wired; `dev-login` gained the `identity_deactivated` check. |
| T7   | ✅ Done | `docs/06-delivery/09-spec-driven-execution-plan.md` and `design.md` closed out (not independently re-audited beyond confirming `check_docs.py` passes in the gate below). |

---

## Spec-Anchored Acceptance Criteria

| Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| HARD-01: revoke sets `revoked_at`, subsequent auth denied | 401 on next `authenticateNode` call for that Node, reusing Slice 2's unchanged check | `apps/hub/test/hardening-nodes.test.ts:72-78` — `expect(res.json()).toMatchObject({nodeId, revoked:true})` then `expect(after.statusCode).toBe(401); expect(after.json().title).toBe("node_unauthorized")` | ✅ PASS |
| HARD-02: fleet list, exact revoked status | active Node's `revokedAt` is `null`, revoked Node's is non-null | `apps/hub/test/hardening-nodes.test.ts:91-92` — `expect(active?.revokedAt).toBeNull(); expect(revoked?.revokedAt).not.toBeNull()` | ✅ PASS |
| HARD-03: revoke unknown/other-org Node → 404 | 404, never confirms existence | `apps/hub/test/hardening-nodes.test.ts:97` (unknown), `:103` (other org) — `expect(res.statusCode).toBe(404)` | ✅ PASS |
| HARD-04: revoke already-revoked → idempotent no-op | 200, `revoked_at` byte-for-byte unchanged | `apps/hub/test/hardening-nodes.test.ts:106-117` — `expect(row2.rows[0].revoked_at).toEqual(revokedAt1)` (exact timestamp equality, not just "still set") | ✅ PASS |
| HARD-05: fleet list/revoke cross-tenant → 403 | 403 on both the list and the revoke route | `apps/hub/test/hardening-nodes.test.ts:122-124` — `expect(res.statusCode).toBe(403); expect(res.json().title).toBe("capability_denied")` covers **only the revoke route** | ⚠️ Spec-precision gap (see note 1 below) |
| HARD-06: new entry chains `entry_hash` to prior entry of same org | `second.prevHash === first.entryHash`, hashes differ | `apps/hub/test/hardening-audit-chain.test.ts:43-44` — `expect(second.prevHash).toBe(first.entryHash); expect(first.entryHash).not.toBe(second.entryHash)` | ✅ PASS |
| HARD-07: unaltered chain verifies valid | `{valid: true}` | `apps/hub/test/hardening-audit-chain.test.ts:60` — `expect(verdict).toEqual({valid: true})` (3-entry chain) | ✅ PASS |
| HARD-08: direct tamper detected at exact entry | `{valid: false, brokenAtId: <exact id>}` | `apps/hub/test/hardening-audit-chain.test.ts:89` — `expect(after).toEqual({valid: false, brokenAtId: middleId})` | ✅ PASS |
| HARD-09: first entry of an org uses genesis | `prevHash === "genesis"` | `apps/hub/test/hardening-audit-chain.test.ts:52` — `expect(row.rows[0].prevHash).toBe(AUDIT_GENESIS)` | ✅ PASS |
| HARD-10: export returns full ordered trail + chain verdict | entries in ascending `id` order, `chainValid: true`; empty org → `{entries: [], chainValid: true}` | `apps/hub/test/hardening-audit-export.test.ts:61-64` — `expect(bodyA.chainValid).toBe(true); expect(idsAscending).toEqual([...idsAscending].sort(...))`; `hardening-audit-export.test.ts:100` — `expect(res.json()).toEqual({entries: [], chainValid: true})` | ✅ PASS |
| HARD-11: export never leaks another org's entries | no id from org B's export appears in org A's export or vice versa | `apps/hub/test/hardening-audit-export.test.ts:70-74` — `for (const id of idsB) expect(idsA.has(id)).toBe(false)` | ✅ PASS |
| HARD-12: positive integer window persists | row in `org_retention_policies` with exact value | `apps/hub/test/hardening-retention.test.ts:96` — `expect(row.rows[0].days).toBe(90)` | ✅ PASS |
| HARD-13: non-positive/non-integer window → 422 | 422 `invalid_retention_window` for `0, -1, 1.5, "30", null, undefined` | `apps/hub/test/hardening-retention.test.ts:100-104` — loop asserting `res.statusCode===422` and `title==="invalid_retention_window"` for all 6 values | ✅ PASS |
| HARD-14: sweep without configured policy → 422 | 422 `retention_not_configured` | `apps/hub/test/hardening-retention.test.ts:109-110` | ✅ PASS |
| HARD-15: sweep redacts old evidence, exact count, row not deleted | `content_excerpt=null`, `redacted_at` set, `content_digest` unchanged, `redactedCount` exact | `apps/hub/test/hardening-retention.test.ts:137,143-145` — `expect(res.json().redactedCount).toBe(1); expect(oldRow.rows[0].content_excerpt).toBeNull(); expect(oldRow.rows[0].content_digest).toBe(digestBefore); expect(oldRow.rows[0].redacted_at).not.toBeNull()` | ✅ PASS |
| HARD-16: in-window evidence untouched | `content_excerpt` and `redacted_at` unchanged | `apps/hub/test/hardening-retention.test.ts:151-152` — `expect(freshRow.rows[0].content_excerpt).toBe("evidência recente..."); expect(freshRow.rows[0].redacted_at).toBeNull()` | ✅ PASS |
| HARD-17: referencing claim/decision lineage preserved after redaction | claim statement intact, `claim_evidence` link count unchanged | `apps/hub/test/hardening-retention.test.ts:154-160` — `expect(claimRow.rows[0].statement).toBe(...); expect(linkRow.rows[0].n).toBe(1)` | ✅ PASS |
| HARD-18: deactivate sets `deactivated_at` | non-null after call | `apps/hub/test/hardening-users.test.ts:62-66` — `expect(res.json()).toMatchObject({userId:"user_dev_a", deactivated:true}); expect(row.rows[0].deactivated_at).not.toBeNull()` | ✅ PASS |
| HARD-19: `dev-login` of deactivated user → 401 `identity_deactivated`, distinct from `unknown_identity` | exact distinct error titles | `apps/hub/test/hardening-users.test.ts:69-75` — `expect(attempt.json().title).toBe("identity_deactivated"); expect(unknown.json().title).toBe("unknown_identity"); expect(unknown.json().title).not.toBe(attempt.json().title)` | ✅ PASS |
| HARD-20: deactivate unknown/other-org user → 404 | 404, no state change on cross-org attempt | `apps/hub/test/hardening-users.test.ts:49` (unknown), `:55-57` (other org, plus `expect(row.rows[0].deactivated_at).toBeNull()`) | ✅ PASS |
| HARD-21: deactivate already-deactivated → idempotent | exact timestamp unchanged | `apps/hub/test/hardening-users.test.ts:86` — `expect(row2.rows[0].deactivated_at).toEqual(first)` | ✅ PASS |
| HARD-22: user list, exact active/deactivated status | `deactivatedAt` reflects true state | `apps/hub/test/hardening-users.test.ts:94` — `expect(a?.deactivatedAt).not.toBeNull()` | ✅ PASS |

**Status**: ⚠️ 21/22 ACs precisely matched; HARD-05 has a spec-precision gap (see note 1).

**Note 1 (HARD-05):** the spec's AC text names both "the fleet list **or** revoke route" for the 403-on-cross-tenant behavior. The design's own documented Assumption ("Leitura de audit export/fleet/users… sem capability própria, só sessão autenticada") makes the read route's org scope come exclusively from the session — there is no path parameter through which a "cross-tenant" read request could even be expressed, so a 403 on the list route is structurally unreachable by design, not merely untested. The revoke route (write, capability-gated) is precisely tested. This is flagged as a spec-precision gap rather than a functional defect: the AC's wording is broader than what the (deliberate, documented) design supports.

---

## Discrimination Sensor

All mutations were applied in an isolated `git worktree` (`git worktree add <scratch> HEAD`, sibling `node_modules` symlinked in — never `git stash`), run against the affected test file(s) via `npx vitest run`, then reverted with `git checkout --` inside the scratch, and the scratch worktree was removed with `git worktree remove --force`. Pre-sensor and post-sensor `git status --porcelain` on the real tree were both empty (clean) — isolation confirmed.

| # | File:line | Description | Killed? |
| - | --------- | ------------ | ------- |
| 1 | `apps/hub/src/evolution/hardening.ts:34` | `revoked_at = coalesce(revoked_at, now())` → unconditional `revoked_at = now()` (breaks idempotency: re-revoking would bump the timestamp) | ✅ Killed — `hardening-nodes.test.ts` HARD-04 fails (`revoked_at` changed on re-revoke) |
| 2 | `apps/hub/src/evolution/hardening.ts:85` | Sweep filter `redacted_at is null` → `redacted_at is not null` (redacts already-redacted rows instead of eligible ones) | ✅ Killed — `hardening-retention.test.ts` HARD-15 fails (`redactedCount` 0 instead of 1) |
| 3 | `apps/hub/src/server.ts:75` | `dev-login` error title `"identity_deactivated"` → `"unknown_identity"` (loses distinction required by HARD-19) | ✅ Killed — `hardening-users.test.ts` HARD-19 fails (`identity_deactivated` expected, got `unknown_identity`) |
| 4 | `apps/hub/src/policy/policy.ts:141-154` | `verifyAuditChain` skips recomputing `entry_hash` from row fields, only checks `prevHash` chain linkage | ✅ Killed — `hardening-audit-chain.test.ts` HARD-08 fails (tamper on `reason` field not detected, `{valid:true}` instead of `{valid:false, brokenAtId}`) |
| 5 | `apps/hub/src/policy/policy.ts:71` | `recordAudit`'s prevHash lookup `order by id desc limit 1` → `order by id asc limit 1` (always chains to the org's *first* entry instead of its *last*) | ✅ Killed — `hardening-audit-chain.test.ts` HARD-07 and HARD-08 both fail (`{valid:false, brokenAtId}` on an untampered chain) |
| 6 | `apps/hub/src/registry/routes.ts:1731-1734` | Removed the `enforceCapability(pool, scope, "admin.write", ...)` guard entirely from `POST /orgs/current/retention` (capability check deleted, route always proceeds) | ❌ **Survived** — full hub suite (441 tests) still passes with the guard removed |

**Sensor depth**: lightweight (6 targeted mutations, one beyond the requested 3-5 range because mutation 6 empirically confirmed a real test-coverage gap worth reporting with hard evidence rather than as speculation).

**Sensor outcome**: 5/6 killed, 1 survived — ❌ FAIL (see Fix Plan below; the survived mutant is a genuine test-coverage gap, not a functional defect — the capability check itself is present and correct in the real tree, only untested).

**Follow-up (not separately mutated, same class of gap):** `hardening-retention.test.ts` and `hardening-users.test.ts` were grepped for `403`/`capability_denied` and neither file contains such an assertion. `POST /orgs/current/retention/sweep` and `POST /orgs/current/users/:userId/deactivate` carry the identical `enforceCapability(pool, scope, "admin.write", ...)` guard (confirmed by reading `apps/hub/src/registry/routes.ts`) but are equally untested for the 403 path — the same surviving-mutant class as mutation 6 applies to both by direct code inspection, without needing to re-run the sensor on each individually.

---

## Interactive UAT Results

Not performed — this is a backend-only administrative/infrastructure feature (Node fleet, audit chain, retention, user deprovisioning) with no UI. Per `validate.md` §3, automated checks are sufficient for backend-only work.

---

## Code Quality

| Principle | Status |
| --- | --- |
| Minimum code | ✅ — `hardening.ts` is new and scoped; `policy.ts`/`server.ts` changes are surgical additions |
| Surgical changes | ✅ — `dev-login` gained exactly one added condition; `recordAudit`'s public signature is unchanged |
| No scope creep | ✅ — no unrelated files touched in the diff (`git diff bfd6a48..HEAD --stat` limited to the 4 code files + migration + 6 test files + 2 docs files) |
| Matches patterns | ✅ — reuses `withTx`-free `pool.query` pattern already used elsewhere for simple CRUD, `requireScope`/`enforceCapability`/`problem()` conventions match Slices 0-8 |
| Spec-anchored outcome check (asserted values match spec) | ⚠️ — 21/22 exact; HARD-05 partial (see note 1) |
| Per-layer Coverage Expectation met (domain 1:1 ACs; routes happy+edge+error) | ❌ — 3 of 4 `admin.write`-gated write routes (`retention`, `retention/sweep`, `users/:id/deactivate`) have no test for the capability-denied/error path, confirmed by a surviving mutant |
| Every test maps to a spec requirement — no unclaimed tests | ✅ — every test in the 6 new files cites or clearly maps to a HARD-NN id or a spec.md edge case |
| Documented guidelines followed | `AGENTS.md` (integration-against-real-Postgres convention) — followed throughout |

---

## Edge Cases

- [x] Cross-tenant 403 on the Node revoke route: handled and tested (`hardening-nodes.test.ts:119-130`).
- [ ] Cross-tenant 403 on **any** route introduced by this slice (spec.md Edge Cases, first bullet): only the Node revoke route is tested for this; the retention, sweep, and deactivate write routes are not, despite the same guard being present in code — this is the same gap as sensor mutation 6.
- [x] Single-entry org audit chain valid by construction: `hardening-audit-chain.test.ts:63-67`.
- [x] Zero-entry org audit chain valid (vacuously): `hardening-audit-chain.test.ts:69-72` and export-side `hardening-audit-export.test.ts:97-101`.
- [x] Sweep with zero eligible rows returns count `0`, not an error: `hardening-retention.test.ts:163-167`.
- [x] Re-enrolling a revoked Node id: no new behavior claimed by this slice — not separately tested here, correctly deferred to Slice 2's existing enrollment tests (out of this slice's diff surface).

---

## Gate Check

- **Gate command**: `bash scripts/dev-db.sh start && pnpm test:unit && pnpm test:int` (Full gate, per tasks.md)
- **Outcome**: 441 hub integration tests passed, 0 failed, 0 skipped (plus 20 contract unit tests, 7 node unit tests, 8 node integration tests — all passing; hub is the feature's scope)
- **Test count before feature** (at `bfd6a48`, reconstructed from tasks.md's incremental counts: 415 − 2 = 413): 413 hub tests
- **Test count after feature**: 441 hub tests
- **Delta**: +28 new tests (2 + 7 + 6 + 2 + 5 + 6, matching T1-T6's individually logged counts exactly)
- **Skipped tests**: none
- **Failures**: none

---

## Fix Plans

### Fix 1: No test coverage for `admin.write` capability enforcement on 3 of 4 write routes

- **Root cause**: `hardening-nodes.test.ts` includes a 403/`capability_denied` test for the Node revoke route (HARD-05), but the equivalent guard on `POST /orgs/current/retention`, `POST /orgs/current/retention/sweep`, and `POST /orgs/current/users/:userId/deactivate` was never mirrored into `hardening-retention.test.ts` / `hardening-users.test.ts`. Confirmed empirically: deleting the guard from the retention route left all 441 hub tests green.
- **Fix task**: Add one 403/`capability_denied` test per route (mirroring `hardening-nodes.test.ts:119-130`'s pattern — delete the `admin.write` grant for one dev org, call the route, assert `403`/`capability_denied`, then re-insert the grant) to `hardening-retention.test.ts` (×2: set-policy, sweep) and `hardening-users.test.ts` (×1: deactivate).
- **Priority**: Major (confirmed surviving mutant on a deny-by-default security control; the implementation itself is correct, only the regression-detection safety net is missing).

### Fix 2 (optional, lower priority): HARD-05's spec wording vs. design's read-route Assumption

- **Root cause**: spec.md's AC5 names "fleet list" for a 403-cross-tenant outcome that the design's own documented, confirmed Assumption makes structurally unreachable for read routes (org always from session, no path param to redirect to another org).
- **Fix task**: Either (a) narrow HARD-05's AC text to the revoke route only in a future spec revision, or (b) leave as-is and treat this validation report's note 1 as the standing clarification. No code or test change is required — this is a documentation-precision item, not a behavior gap.
- **Priority**: Minor.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| --- | --- | --- |
| HARD-01 | Implementing | ✅ Verified |
| HARD-02 | Implementing | ✅ Verified |
| HARD-03 | Implementing | ✅ Verified |
| HARD-04 | Implementing | ✅ Verified |
| HARD-05 | Implementing | ⚠️ Verified with spec-precision gap (revoke route only) |
| HARD-06 | Implementing | ✅ Verified |
| HARD-07 | Implementing | ✅ Verified |
| HARD-08 | Implementing | ✅ Verified |
| HARD-09 | Implementing | ✅ Verified |
| HARD-10 | Implementing | ✅ Verified |
| HARD-11 | Implementing | ✅ Verified |
| HARD-12 | Implementing | ✅ Verified |
| HARD-13 | Implementing | ✅ Verified |
| HARD-14 | Implementing | ✅ Verified |
| HARD-15 | Implementing | ✅ Verified |
| HARD-16 | Implementing | ✅ Verified |
| HARD-17 | Implementing | ✅ Verified |
| HARD-18 | Implementing | ✅ Verified |
| HARD-19 | Implementing | ✅ Verified |
| HARD-20 | Implementing | ✅ Verified |
| HARD-21 | Implementing | ✅ Verified |
| HARD-22 | Implementing | ✅ Verified |

---

## Summary

**Overall**: ⚠️ Issues — one confirmed surviving mutant (test-coverage gap, not a functional defect) blocks a clean PASS.

**Spec-anchored check**: 21/22 ACs matched the spec-defined outcome precisely; 1 spec-precision gap (HARD-05, read-route portion).
**Sensor**: 5/6 mutations killed, 1 survived.
**Gate**: 441 passed, 0 failed (plus 35 non-hub tests passed).

**What works**: Node fleet kill switch reuses Slice 2's `authenticateNode`/`revoked_at` check with zero modification and is denied correctly post-revoke; the audit hash chain is computed inside `recordAudit` with its public signature untouched, correctly detects both a broken link and a same-position field tamper, and identifies the exact `id`; audit export is org-isolated and vacuously valid for an empty org; the retention sweep redacts exactly the eligible rows, never deletes, preserves `content_digest` and all referencing claim/decision lineage, and leaves in-window evidence completely untouched; user deactivation is idempotent, 404s correctly on unknown/cross-org ids, and `dev-login` now returns a distinct `identity_deactivated` 401 instead of conflating it with `unknown_identity`.

**Issues found**:
1. (Major) The `admin.write` capability guard on `POST /orgs/current/retention`, `POST /orgs/current/retention/sweep`, and `POST /orgs/current/users/:userId/deactivate` is implemented correctly but has zero test coverage — confirmed by a surviving mutant (deleting the guard on the retention route left all 441 tests green). Fix: add 3 tests mirroring the existing `hardening-nodes.test.ts` HARD-05 pattern.
2. (Minor) HARD-05's spec wording claims 403-on-cross-tenant for the fleet *list* route, which the design's own read-route Assumption makes structurally untestable/unreachable. Documentation-precision only.

**Next steps**: Route Fix 1 back to an implementer as a single fix task (add the 3 missing 403 tests, no production code change needed), then re-dispatch the Verifier for a second pass focused on confirming the new tests both pass and — spot-checked — actually fail without the guard present.
