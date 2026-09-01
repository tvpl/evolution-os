# Validation Report — slice-3-evidence-to-decision

- **Result**: PASS
- **Date**: 2026-09-01
- **Spec**: `.specs/features/slice-3-evidence-to-decision/spec.md`
- **Diff range**: `c06aef6..c1cf2a9` (T1–T10 plus the round-2/round-3 gap-fix commits)
- **Verifier**: independent sub-agent (author ≠ verifier), evidence-or-zero, across 3 rounds

**Final verdict**: ✅ **PASS** — see [Round 3 — Fix 6 closed](#round-3--fix-6-closed) at the bottom of this file. All 18 FLOW-NN acceptance criteria verified on value; 12/12 designed mutations across 3 rounds ultimately killed; gate green (172 hub + 8 node tests, 0 failed; typecheck clean).

History below is kept for audit: round 1 and round 2 each ended in a FAIL that was routed to fix tasks and re-verified, per the skill's bounded fix→re-verify loop. Only the final verdict above reflects the feature's current, shipped state.

**Round 2 outcome (`c1cf2a9`)**: narrow fail — every round-1 gap was genuinely closed (FLOW-18 implemented and covered; M1/M2/M8 all killed; FLOW-12 fields and both edge cases now asserted on value), but one new mutant survived inside the FLOW-18 code the fix added: the `d.decision = 'reject'` predicate — the AC's own discriminating word — was not exercised by any test. See [Re-verification](#re-verification-2026-09-01-round-2) below; closed by round 3.

**Round 1 outcome (`5b73706`)**: 1 acceptance criterion (FLOW-18) had no implementation and no test; 3 of 8 sensor mutations survived, all on payload fields asserted by presence rather than value. Closed by round 2.

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1 | ⚠️ Partial | Grants + tests landed in `3bb369d`, but `apps/hub/migrations/004_evolution.sql` and the `org_dev_a` grant block were committed earlier, inside the slice-2 commit `718e41b` — outside this slice's diff range. Functionally present, commit atomicity broken. |
| T2 | ✅ Done | `5f4a41f` |
| T3 | ✅ Done | `2b9dc97` |
| T4 | ✅ Done | `098d2d5` |
| T5 | ✅ Done | `6385c58` |
| T6 | ✅ Done | `967aefd` |
| T7 | ✅ Done | `01ae991` |
| T8 | ✅ Done | `21e8d64` |
| T9 | ⚠️ Partial | `6edfdab` — covers FLOW-17; FLOW-18 as written by the spec is not implemented (see below). |
| T10 | ✅ Done | `de832ba` |

---

## Spec-Anchored Acceptance Criteria

| Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + assertion | Result |
| ------------------------- | -------------------- | ----------------------- | ------ |
| FLOW-01 — submit manual/URL evidence → create with `status='quarantine'`, declared `type`, source metadata, content digest | status `quarantine`; `type` = declared (`humanStatement`\|`referenceOnly`); source metadata; a digest | `apps/hub/test/evidence.test.ts:68` — `expect(res.json()).toEqual({evidenceId: …, status:"quarantine"})`; `:72` — `expect(row.rows[0].status).toBe("quarantine")`; `:73` — `expect(row.rows[0].content_digest).toMatch(/^sha256:/)`; `:86` — `expect(row.rows[0]).toEqual({source_reference:"https://example.com/announcement", source_type:"url"})` | ⚠️ **PARTIAL** — status, source metadata and digest shape asserted; the persisted **`type`** is never asserted anywhere. Proven by surviving mutant M1. |
| FLOW-02 — activate quarantined evidence → `status='active'`, content and digest unchanged | status `active`; digest identical to pre-activation value | `apps/hub/test/evidence.test.ts:103` — `expect(res.json()).toEqual({evidenceId, status:"active"})`; `:108` — `expect(after.rows[0].status).toBe("active")`; `:109` — `expect(after.rows[0].content_digest).toBe(before.rows[0].content_digest)` | ✅ PASS (mutant M7 killed). Minor: `content_excerpt` not separately asserted; digest stands in as the integrity proxy. |
| FLOW-03 — evidence without source info → 422, no row created | HTTP 422; row count unchanged | `apps/hub/test/evidence.test.ts:117` — `expect(res.statusCode).toBe(422)`; `:121` — `expect(after.rows[0].n).toBe(before.rows[0].n)`; `:126` — missing `type` → `toBe(422)` | ✅ PASS |
| FLOW-04 — list project evidence → return with current status and digest | each item carries its **current** status and its digest | `apps/hub/test/evidence.test.ts:139` — `expect(e).toHaveProperty("status")`; `:140` — `expect(e.contentDigest).toMatch(/^sha256:/)` | ⚠️ **PARTIAL** — `status` asserted by **presence only**, never by value. A listing that reports a stale/wrong status passes. Proven by surviving mutant M8. |
| FLOW-05 — create claim referencing ≥1 active evidence → persist `statement` + `epistemicType`, linked to each evidence | claim persisted with statement, epistemic type, and a link row per evidence | `apps/hub/test/claims.test.ts:86` — `expect(res.statusCode).toBe(201)`; `:95` — `expect(found.evidenceIds.sort()).toEqual([e1,e2].sort())`; `:96` — `expect(found.epistemicType).toBe("inference")` | ✅ PASS. Minor: the persisted `statement` value is not asserted (epistemic type + N:N linkage, the AC's discriminating content, are). |
| FLOW-06 — claim references quarantined evidence → 422 | HTTP 422, reason "only active evidence supports a claim" | `apps/hub/test/claims.test.ts:109` — `expect(res.statusCode).toBe(422)`; `:110` — `expect(res.json().title).toBe("evidence_not_active")`; `:114` — no claim row written | ✅ PASS (mutant M3 killed) |
| FLOW-07 — claim references evidence of another project → 422 | HTTP 422 | `apps/hub/test/claims.test.ts:124` — `toBe(422)`; `:125` — `expect(res.json().title).toBe("invalid_evidence_reference")` | ✅ PASS |
| FLOW-08 — list claims → each with linked evidence IDs | evidence IDs present per claim | `apps/hub/test/claims.test.ts:95` — `expect(found.evidenceIds.sort()).toEqual([e1,e2].sort())` | ✅ PASS |
| FLOW-09 — link claim → compute and persist `evidenceStrength` + `confidence` deterministically from source authority and evidence count | derived values, deterministic, two fields | `apps/hub/test/signals.test.ts:100-101` — `toBe("moderate")` / `toBe("medium")`; `:107` — `expect(row.rows[0]).toEqual({evidenceStrength:"moderate", confidence:"medium"})`; `apps/hub/test/analysis-provider.test.ts:10,17,26,35,39` — exact `toEqual` on every threshold branch | ✅ PASS (mutant M4 killed, 3 failures) |
| FLOW-10 — signal response exposes both as separate fields, not merged | two distinct top-level fields | `apps/hub/test/signals.test.ts:98-99` — `toHaveProperty("evidenceStrength")` / `("confidence")`; `:100-101` — values asserted | ✅ PASS |
| FLOW-11 — relink same claim → return existing signal, no duplicate | existing signal returned; exactly 1 row | `apps/hub/test/signals.test.ts:119` — `expect(second.statusCode).toBe(200)`; `:120` — `expect(second.json().signalId).toBe(first.json().signalId)`; `:124` — `expect(after.rows[0].n).toBe(1)` | ✅ PASS |
| FLOW-12 — create proposal with title, summary, why-now, cost of inaction, ≥1 alternative incl. do-nothing, recommended alternative → persist `status='draft'` | `status='draft'` with all enumerated fields persisted | `apps/hub/test/proposals.test.ts:106` — `expect(res.json()).toEqual({proposalId: …, status:"draft"})`; `:111` — `expect(row.rows[0].status).toBe("draft")`; `:112` — `expect(row.rows[0].alternatives).toHaveLength(2)`; `costOfInaction` + do-nothing alternative proven indirectly by `apps/hub/test/proposal-ready.test.ts:145` — `expect(res.json().challengerFindings).toEqual([])` | ⚠️ **PARTIAL** — `status` and alternative count asserted; **`whyNow` and `recommendedAlternativeId` are never asserted on their persisted values** despite being named in the AC. Alternatives asserted by length, not content. |
| FLOW-13 — move to `readyForReview` → run Challenger and attach findings before inbox visibility | status `readyForReview` + findings persisted on the proposal | `apps/hub/test/proposal-ready.test.ts:113` — `expect(res.json().status).toBe("readyForReview")`; `:114` — findings `arrayContaining(["missing_do_nothing_alternative","single_source_evidence"])`; `:121` — DB `status` `toBe("readyForReview")`; `:122` — DB `challenger_findings` `arrayContaining([...])` | ✅ PASS (mutant M5 killed, 4 failures) |
| FLOW-14 — no do-nothing alternative → flag `missing_do_nothing_alternative` **without blocking** the transition | finding present AND status still transitions | `apps/hub/test/proposal-ready.test.ts:112-115` — `toBe(200)` + status `readyForReview` + finding present in the same assertion block; `apps/hub/test/analysis-provider.test.ts:61` — `expect(findings).toContain("missing_do_nothing_alternative")`; `:69` — `watch` accepted; `:105` — `not.toThrow()` on degenerate input | ✅ PASS |
| FLOW-15 — proposal with no claims and no explicit investigation state → 422 | HTTP 422 | `apps/hub/test/proposals.test.ts:121` — `toBe(422)`; `:122` — `expect(res.json().title).toBe("proposal_requires_evidence")` | ✅ PASS (mutant M6 killed) |
| FLOW-16 — inbox returns `readyForReview` proposals, most-recent-first, **including their Challenger findings** | only readyForReview; descending recency; findings included | `apps/hub/test/proposal-inbox.test.ts:89` — `expect(ids).not.toContain(draft)`; `:90` — `arrayContaining([first, second])`; `:91` — `expect(ids.indexOf(second)).toBeLessThan(ids.indexOf(first))`; `:95` — `expect(p.status).toBe("readyForReview")`; `:94` — `expect(p).toHaveProperty("challengerFindings")` | ⚠️ **PARTIAL** — filter and ordering asserted on value; **findings asserted by presence only**. The inbox can return empty findings for every proposal and the suite stays green. Proven by surviving mutant M2. Also a spec-precision gap: "most-recent-first" does not say by `created_at` or `ready_at`; the implementation uses `created_at desc` (`apps/hub/src/evolution/proposals.ts:190`). |
| FLOW-17 — record decision on a proposal → persist via the same mechanism (`subjectType='proposal'`) AND surface any prior decision on the same proposal | decision row with `subject_type='proposal'`; prior decisions in the response | `apps/hub/test/proposal-decisions.test.ts:78` — `toBe(201)`; `:79` — `toMatchObject({decision:"reject", subjectType:"proposal", subjectId})`; `:84` — `expect(row.rows[0]).toEqual({subject_type:"proposal", subject_id: proposalId})`; `:104` — `expect(prior).toHaveLength(1)`; `:105` — `toMatchObject({decision:"reject", subjectId})` | ✅ PASS. Note: only 3 of the 6 spec-listed verbs are exercised (`reject`, `investigate`, `accept`); `defer`, `experiment`, `supersede` are untested — the server does not validate the verb set (`apps/hub/src/registry/routes.ts:296`), so they behave identically. |
| FLOW-18 — **create a new proposal** whose subject was already rejected → surface the prior rejected decision (visibility, not a block) | the proposal-creation response exposes the prior rejected decision | **no evidence** — `POST /projects/:id/proposals` returns only `{proposalId, status:"draft"}` (`apps/hub/src/registry/routes.ts:694`); `createProposal` never queries `decisions` (`apps/hub/src/evolution/proposals.ts:36-76`); `priorRelatedDecisions` is produced solely by `recordDecision` (`apps/hub/src/idea-memory/decisions.ts:99-110`). No test creates a second proposal after a reject and inspects prior decisions. | ❌ **GAP — not covered** |

**Status**: ❌ Gaps present — 13/18 fully matched the spec outcome, 4 partial (payload asserted by presence, not value), 1 uncovered (FLOW-18).

### FLOW-18 detail

The spec's own Independent Test for this story is explicit: *"criar nova proposta relacionada ao mesmo signal e conferir que a API expõe a decisão rejeitada anterior"* (`spec.md:127`). The AC (`spec.md:125`) is equally explicit that the trigger is **proposal creation**, not a subsequent decision.

The design reduced FLOW-18 to the pre-existing generic decisions guard (`design.md:92`, `design.md:142`), and `proposal-decisions.test.ts:87` tests *a later decision on the same proposal* — which is FLOW-17's second clause, already counted there. FLOW-18 therefore has no distinct implementation and no distinct test. The spec is also internally inconsistent here: Success Criteria (`spec.md:177`) restates the guard as being about *a decision*, matching what was built, while the AC says *creation*. The AC is the source of truth.

---

## Discrimination Sensor

Isolation method: mutations applied to the real working tree one at a time, each reverted with `git checkout -- <file>` and confirmed with `git status --porcelain` before the next (never `git stash`). Pre-sensor baseline: clean tree at `5b73706`.

| # | File:line | Description | Scope run | Killed? |
| - | --------- | ----------- | --------- | ------- |
| M1 | `apps/hub/src/evolution/evidence.ts:41` | Persisted evidence `type` hardcoded to `"referenceOnly"` instead of `input.type` | full hub suite (168 tests) | ❌ **SURVIVED** — 168/168 passed |
| M2 | `apps/hub/src/evolution/proposals.ts:164` | `challengerFindings: r.challenger_findings` → `challengerFindings: []` in the row mapper | full hub suite (168 tests) | ❌ **SURVIVED** — 168/168 passed |
| M3 | `apps/hub/src/evolution/claims.ts:41` | Removed the active-evidence check (`if (row.status !== "active")` → `if (false)`) | `claims.test.ts` | ✅ Killed (1 failure, `:109` 422→201) |
| M4 | `apps/hub/src/evolution/analysis-provider.ts:27` | Off-by-one on strength thresholds (`count >= 3 / === 2` → `count >= 2 / === 1`) | `analysis-provider.test.ts`, `signals.test.ts` | ✅ Killed (3 failures) |
| M5 | `apps/hub/src/evolution/proposals.ts:124` | Removed the required side effect `status = 'readyForReview'` from the ready update | `proposal-ready.test.ts`, `proposal-inbox.test.ts` | ✅ Killed (4 failures) |
| M6 | `apps/hub/src/evolution/proposals.ts:42` | Removed the requires-evidence invariant (`if (!signalId && !investigationState)` → `if (false)`) | `proposals.test.ts` | ✅ Killed (1 failure) |
| M7 | `apps/hub/src/evolution/evidence.ts:60` | Activation overwrites the digest (`content_digest = 'sha256:mutated'`) | `evidence.test.ts` | ✅ Killed (1 failure, `:109`) |
| M8 | `apps/hub/src/evolution/evidence.ts:79` | Listing hardcodes `'quarantine' as status` | full hub suite (168 tests) | ❌ **SURVIVED** — 168/168 passed |

**Sensor depth**: P0-full (8 mutations, ≥5 required for a data-integrity path)
**Sensor tally (round 1)**: 5/8 killed, 3 survived — round-1 sensor did not fully pass, closed by round 2
**Isolation verified**: post-sensor `git status --porcelain` = 0 lines, `git diff` = 0 lines, HEAD = `5b73706` — exact match to the pre-sensor baseline.

All three survivors share one root cause: a payload field the spec names explicitly is asserted with `toHaveProperty` / not asserted at all, instead of on its value.

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code | ✅ Modules are small and single-purpose; no speculative abstraction beyond the `AnalysisProvider` shape the spec mandates (ADR-013) |
| Surgical changes | ✅ `decisions.ts` changed by exactly 2 lines; `policy.ts` by grant rows only |
| No scope creep | ✅ No lifecycle states beyond `draft → readyForReview` implemented |
| Matches patterns | ✅ Reuses `requireOwnedProject` / `enforceCapability` / `problem()` exactly as Slices 0–2 |
| Spec-anchored outcome check | ❌ 4 ACs assert presence, not value (FLOW-01, 04, 12, 16); 1 AC uncovered (FLOW-18) |
| Per-layer Coverage Expectation met | ⚠️ Routes cover happy + edge + error for every new route, but no negative-capability test exists for the 5 new capabilities (both dev tenants hold all grants) |
| Every test maps to a spec requirement — no unclaimed tests | ✅ All 54 new tests trace to a FLOW ID, a listed edge case, or a Done-when criterion |
| Documented guidelines followed | ✅ `AGENTS.md` + the Slices 0–2 integration convention (`freshDb` against real Postgres) |
| Commit atomicity | ❌ `migrations/004_evolution.sql` and the `org_dev_a` grant block were committed in the slice-2 commit `718e41b`, not in T1's `3bb369d` |

### Established-risk-pattern review

| Pattern | Finding |
| ------- | ------- |
| (a) jsonb round-trip `JSON.stringify` comparison | ✅ **Clean.** `JSON.stringify` appears only as a *write* parameter (`proposals.ts:70,72,126`; `decisions.ts:127`). No new code compares jsonb-sourced objects by stringify, so the Slice-2 key-order bug class is not reintroduced. |
| (b) dedup / state-transition guards covering every status | ✅ **Clean.** Signal dedup rests on `unique (project_id, claim_id)` in the DB (`004_evolution.sql:50`) plus an application pre-check and an `on conflict do nothing` race path (`signals.ts:29,48,52`) — status-independent, since `signals` has no status column. The proposal transition guard is `if (row.status !== "draft")` (`proposals.ts:104`), which rejects *every* non-draft status rather than enumerating them. |
| (c) 404-before-403 on new project-scoped routes | ✅ **Clean.** All 10 new routes call `requireOwnedProject` as their first DB touch (`routes.ts:500,532,548,557,601,610,635,644,702,722`), which checks existence → 404 before tenant → 403 (`routes.ts:38-66`). `enforceCapability` runs strictly after it on every write route. |
| (d) grants for only one dev tenant | ✅ **Clean.** All 5 capabilities present for both `org_dev_a` (`policy.ts:91-95`) and `org_dev_b` (`policy.ts:105-109`), and asserted for both by `evolution-migration.test.ts:38-53`. |

---

## Edge Cases

- [x] **Claim with zero linked evidence → 422** — `claims.test.ts:130` `toBe(422)`, `:131` `title` `toBe("claim_requires_evidence")`.
- [x] **Contradicting claims → `contradictory_claims`** — `analysis-provider.test.ts:96` `expect(findings).toContain("contradictory_claims")`. Covered at the pure-function level; not exercised end-to-end through `/ready`.
- [x] **Decision referencing a proposal from another project → 422** — `proposal-decisions.test.ts:116` `toBe(422)`. Minor: the error `title` is not asserted (the sibling cases at `claims.test.ts:125` and `proposals.test.ts:144` do assert it).
- [ ] **Two evidences sharing a content digest → both created, no error** — **NOT TESTED.** No test submits identical evidence content; the helpers deliberately randomize statements (`claims.test.ts:35`, `signals.test.ts:37`). The schema has no unique index on `content_digest` (`004_evolution.sql:5-19`), so the behavior is almost certainly correct, but it is unverified.
- [ ] **Evidence status field supports `source_unavailable`** — **NOT TESTED.** Satisfied structurally: `status` is an unconstrained `text` column with no CHECK (`004_evolution.sql:10`), so the value is storable by a future slice. No assertion exists.

---

## Gate Check

- **Gate command**: `bash scripts/dev-db.sh start && pnpm test:int` (Full gate per `tasks.md`), plus `pnpm --filter @evolution-os/hub typecheck`
- **Result (pre-sensor, clean tree)**: `apps/hub` 31 files / **168 passed**, 0 failed, 0 skipped; `apps/node` 2 files / **8 passed**, 0 failed
- **Result (post-sensor, restored tree)**: identical — 168 passed + 8 passed, 0 failed
- **Typecheck**: `tsc --noEmit` exit 0
- **Test count before feature**: 114 (hub) + 8 (node)
- **Test count after feature**: 168 (hub) + 8 (node)
- **Delta**: **+54 hub tests** (`evolution-migration` 2, `evidence` 8, `claims` 7, `analysis-provider` 13, `signals` 6, `proposals` 7, `proposal-ready` 4, `proposal-inbox` 3, `proposal-decisions` 4)
- **Skipped tests**: none
- **Failures**: none

The gate is green. It does not, however, discriminate the three behaviors that survived the sensor.

---

## Fix Plans

### Fix 1: FLOW-18 has no implementation and no test — Blocker

- **Root cause**: The design collapsed FLOW-18 into the generic decision guard (`design.md:92,142`), which is already FLOW-17's second clause. The AC's actual trigger — *creating a new proposal* whose subject was previously rejected — has no code path. `createProposal` never reads `decisions`.
- **Fix task**: Either (a) implement it: on `POST /projects/:id/proposals`, when the request carries a `signalId`, look up prior `decision='reject'` rows for proposals sharing that signal and return them as `priorRelatedDecisions` alongside `{proposalId, status:'draft'}` (visibility, never blocking); add the test the spec's Independent Test already describes — reject a proposal, create a new one on the same signal, assert the prior rejected decision appears. Or (b) if the reduced scope is genuinely intended, amend `spec.md:125` and `spec.md:127` so the AC matches what was built, and re-run `validate_spec.py`. **Do not resolve this by relabeling FLOW-17's test as FLOW-18's evidence.**
- **Priority**: Blocker

### Fix 2: Three surviving mutants — payload asserted by presence, not value — Major

- **Root cause**: `toHaveProperty(...)` without a value, and omitted field assertions, in the three ACs that name specific payload fields.
- **Fix task**:
  - `evidence.test.ts:68` / `:86` — assert the persisted `type` equals the declared type for both `humanStatement` and `referenceOnly` (kills M1).
  - `evidence.test.ts:139` — replace `toHaveProperty("status")` with a value assertion: after activating one of the listed evidences, assert that item's `status` is `"active"` and an unactivated one is `"quarantine"` (kills M8).
  - `proposal-inbox.test.ts:94` — replace `toHaveProperty("challengerFindings")` with a value assertion, e.g. `expect(p.challengerFindings).toEqual(expect.arrayContaining(["missing_do_nothing_alternative","missing_cost_of_inaction"]))` for the investigation-state proposals the helper builds (kills M2).
- **Priority**: Major

### Fix 3: FLOW-12 enumerated fields not asserted — Minor

- **Root cause**: `proposals.test.ts:108-112` asserts only `status` and `alternatives.length`.
- **Fix task**: Extend the DB assertion to `why_now`, `cost_of_inaction`, `recommended_alternative_id`, and the alternatives' contents (`toEqual` on the array, not `toHaveLength`).
- **Priority**: Minor

### Fix 4: Untested listed edge cases — Minor

- **Root cause**: Two `spec.md` Edge Cases have no test.
- **Fix task**: Add (i) a test submitting two evidences with identical content, asserting both are created (2 distinct IDs, 201 each, equal digests, no error); (ii) a test that `status='source_unavailable'` is storable and surfaces through `GET /projects/:id/evidence`.
- **Priority**: Minor

### Fix 5: Commit atomicity — Minor (process, no code change)

- **Root cause**: `apps/hub/migrations/004_evolution.sql` (74 lines) and the `org_dev_a` evolution grants were committed inside `718e41b fix(hub): close slice-2 verifier gaps…`, so T1's commit `3bb369d` contains only the `org_dev_b` grants and the test. The slice's diff range does not actually contain its own migration.
- **Fix task**: No code change — record the deviation. Going forward, run `git status` before starting a task's commit so in-progress files from the next slice are not swept into the previous slice's commit.
- **Priority**: Minor

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
Round-1 statuses, superseded by the Re-verification section for FLOW-01/04/12/16/18.

| FLOW-01 | Implementing | ⚠️ Needs Fix (type unasserted) |
| FLOW-02 | Implementing | ✅ Verified |
| FLOW-03 | Implementing | ✅ Verified |
| FLOW-04 | Implementing | ⚠️ Needs Fix (status unasserted) |
| FLOW-05 | Implementing | ✅ Verified |
| FLOW-06 | Implementing | ✅ Verified |
| FLOW-07 | Implementing | ✅ Verified |
| FLOW-08 | Implementing | ✅ Verified |
| FLOW-09 | Implementing | ✅ Verified |
| FLOW-10 | Implementing | ✅ Verified |
| FLOW-11 | Implementing | ✅ Verified |
| FLOW-12 | Implementing | ⚠️ Needs Fix (whyNow/recommendedAlternativeId unasserted) |
| FLOW-13 | Implementing | ✅ Verified |
| FLOW-14 | Implementing | ✅ Verified |
| FLOW-15 | Implementing | ✅ Verified |
| FLOW-16 | Implementing | ⚠️ Needs Fix (findings unasserted) |
| FLOW-17 | Implementing | ✅ Verified |
| FLOW-18 | Implementing | ❌ Needs Fix (not implemented) |

---

## Summary

**Overall**: ❌ Not Ready

**Spec-anchored check**: 13/18 ACs matched the spec-defined outcome; 4 partial (presence-only payload assertions); 1 uncovered (FLOW-18). 1 spec-precision gap flagged (FLOW-16 "most-recent-first" does not name a timestamp).
**Sensor**: 5/8 mutations killed, 3 survived.
**Gate**: 176 passed (168 hub + 8 node), 0 failed; typecheck exit 0.

**What works**: The vertical slice genuinely runs end to end — evidence quarantine → activation with digest integrity → claims with N:N evidence and epistemic typing → signal with decomposed relevance and DB-level dedup → proposal draft under the evidence invariant → deterministic Challenger that flags without blocking → filtered inbox → decision reusing the generic subject guard. The four established risk patterns from prior slices (jsonb stringify comparison, partial dedup guards, 404/403 ordering, single-tenant grants) are all clean. The pure `analysis-provider` functions are the best-tested code in the slice: exact `toEqual` on every threshold branch, and every Challenger finding covered including the negative cases.

**Issues found**:
1. FLOW-18 is not implemented — the spec's stated trigger is proposal creation; only the pre-existing decision-time guard exists.
2. Three surviving mutants, all the same defect class: a spec-named payload field asserted by presence rather than value, letting the evidence `type`, the listed evidence `status`, and the inbox `challengerFindings` all be silently wrong.
3. Two listed edge cases have no test.
4. The slice's own migration was committed under the previous slice.

**Next steps**: Route Fix 1 and Fix 2 to an implementer; re-verify. Fix 1 requires a product call first — implement FLOW-18 as written, or amend the AC to match the delivered design.

---

## Re-verification (2026-09-01, round 2)

**Date**: 2026-09-01
**Diff range**: `5b73706..c1cf2a9` (1 commit — `fix(hub): close slice-3 verifier gaps in proposals, evidence and inbox`)
**Verifier**: fresh independent sub-agent, no round-1 context, evidence-or-zero
**Scope**: the five round-1 findings only. Items already clean in round 1 (FLOW-02/03/05–11/13–15/17, risk patterns a–d, code quality) were not re-litigated; FLOW-02 and FLOW-13 were spot-checked via the sensor runs below and remain green.

**Verdict**: ❌ **FAIL** — one surviving mutant on the newly added FLOW-18 code. All four other round-1 findings are confirmed closed.

### Round-1 findings — status

| # | Round-1 finding | Severity | Status now | Evidence |
| - | --------------- | -------- | ---------- | -------- |
| Fix 1 | FLOW-18 not implemented, not tested | Blocker | ✅ **Closed** | `apps/hub/src/evolution/proposals.ts:67-69` (lookup before insert), `:96-113` (`findPriorRejectedDecisionsForSignal`), `:93` (returned on the `created` outcome), `apps/hub/src/registry/routes.ts:694-698` (surfaced on the 201 body). Test: `apps/hub/test/proposal-decisions.test.ts:157-175`. Killed by mutation N3. |
| Fix 2 | M1/M2/M8 survived — payload asserted by presence | Major | ✅ **Closed** | M1 → `evidence.test.ts:72`; M8 → `evidence.test.ts:177-178`; M2 → `proposal-inbox.test.ts:95-101`. All three re-run below and now fail. |
| Fix 3 | FLOW-12 `whyNow` / `recommendedAlternativeId` unasserted | Minor | ✅ **Closed** | `apps/hub/test/proposals.test.ts:118-125` — `alternatives` now `toEqual` on full content, plus `whyNow`, `costOfInaction`, `recommendedAlternativeId` on value. Killed by mutation N4. |
| Fix 4 | Two spec edge cases untested | Minor | ✅ **Closed** | `apps/hub/test/evidence.test.ts:161-173` (duplicate digest) and `:175-186` (`source_unavailable`). |
| Fix 5 | Commit atomicity | Minor (process) | ➖ Accepted as documented | Recorded in the fix commit message; no code change, as agreed. Not re-flagged. |

### FLOW-18 — independently verified

The spec's Independent Test (`spec.md:127`) reads *"criar nova proposta relacionada ao mesmo signal e conferir que a API expõe a decisão rejeitada anterior"*. The new test does exactly that, in that order:

- `proposal-decisions.test.ts:158` — build a real signal (evidence → activate → claim → signal).
- `:159-161` — create proposal #1 from that signal; assert `priorRelatedDecisions` is `[]` (no false positive on the first proposal).
- `:163-168` — `reject` proposal #1 through `POST /projects/:id/decisions`.
- `:170-174` — create proposal #2 **from the same signal**; assert `statusCode` is `201` (creation is not blocked — "visibility, not a hard block"), `prior` has length 1, and `prior[0]` matches `{ decision: "reject", subjectId: firstProposalId }`.

The lookup runs *before* the insert (`proposals.ts:67-71`), so the proposal being created can never surface its own (non-existent) decision. The AC's narrower qualifier *"without a new claim/evidence"* is not implemented — the rejection is surfaced regardless of whether new evidence was attached. Because this is a visibility-only signal that never blocks, surfacing in **more** cases than the AC requires is conservative, not a defect; flagged here as a spec-precision note, not a gap.

### New edge-case tests — content check (not just names)

- `evidence.test.ts:161-173` — submits the **same** statement string twice (`sameContent`, randomised once per run so it stays unique across runs but identical between the two calls), asserts both return 201, asserts the two `evidenceId`s differ, then reads both rows and asserts `content_digest` is **equal**. This is precisely the spec edge case *"WHEN two evidences share the same content digest THEN the system SHALL still create both records ... but SHALL NOT error"* — the equal-digest assertion is what makes it a duplicate-digest test rather than just two creations.
- `evidence.test.ts:175-186` — creates evidence, sets `status = 'source_unavailable'` directly via SQL, then asserts the value round-trips through `GET /projects/:id/evidence` as `source_unavailable`. It bypasses the API deliberately, which is correct: the spec scopes this to *"the evidence status field SHALL support `source_unavailable` so future slices can set it"* — no route sets it in this slice. It proves both halves (column accepts the value; listing surfaces it verbatim), and it is a second, independent killer of mutant M8.

### Discrimination Sensor — round 2

Isolation method: each mutation applied directly to the real tree one at a time, relevant test file(s) run, then reverted with `git checkout -- <file>` and `git status --porcelain` confirmed empty before the next (never `git stash`). Pre-sensor baseline: 0 porcelain lines at `c1cf2a9`.

| # | File:line | Description | Scope run | Killed? |
| - | --------- | ----------- | --------- | ------- |
| M1 (re-run) | `apps/hub/src/evolution/evidence.ts:41` | Persisted `type` hardcoded to `"referenceOnly"` instead of `input.type` | `evidence.test.ts` | ✅ **Killed** (1 failure, `:72` — `expected 'referenceOnly' to be 'humanStatement'`) |
| M8 (re-run) | `apps/hub/src/evolution/evidence.ts:79` | Listing hardcodes `'quarantine' as status` | `evidence.test.ts` | ✅ **Killed** (2 failures, `:178` and `:184`) |
| M2 (re-run) | `apps/hub/src/evolution/proposals.ts:201` | `challengerFindings: r.challenger_findings` → `[]` in `toProposalRow` | `proposal-inbox.test.ts` | ✅ **Killed** (1 failure, `:95`) |
| N1 (new) | `apps/hub/src/evolution/proposals.ts:106` | Dropped `and d.decision = 'reject'` from `findPriorRejectedDecisionsForSignal` — every decision verb now surfaces as a "prior rejected decision" | **full hub suite** | ❌ **SURVIVED** — 172/172 passed |
| N2 (new) | `apps/hub/src/evolution/proposals.ts:108` | Replaced `and p.signal_id = $2` with an always-true predicate — rejections leak across unrelated signals | `proposal-decisions.test.ts`, `proposals.test.ts` | ✅ **Killed** (4 failures) |
| N3 (new) | `apps/hub/src/evolution/proposals.ts:67-69` | Removed the lookup entirely; `priorRelatedDecisions` always `[]` (reverts FLOW-18 to its round-1 state) | `proposal-decisions.test.ts` | ✅ **Killed** (1 failure, `:173`) |
| N4 (new) | `apps/hub/src/evolution/proposals.ts:85,89` | Blanked `input.whyNow` and `input.recommendedAlternativeId` to `null` on insert | `proposals.test.ts` | ✅ **Killed** (1 failure, `:123`) |

**Sensor depth**: P0-full (7 mutations — 3 round-1 re-runs + 4 new, targeting the code introduced by `c1cf2a9`)
**Sensor tally (round 2)**: 6/7 killed, 1 survived — round-2 sensor did not fully pass, closed by round 3
**Isolation verified**: post-sensor `git status --porcelain` = 0 lines, `git diff` = 0 lines, `HEAD` = `c1cf2a9` — exact match to the pre-sensor baseline.

### Gate Check — round 2

- **Gate command**: `bash scripts/dev-db.sh start && pnpm test:int`, plus `pnpm --filter @evolution-os/hub typecheck`
- **Result**: `apps/hub` 31 files / **172 passed**, 0 failed, 0 skipped; `apps/node` 2 files / **8 passed**, 0 failed
- **Typecheck**: `tsc --noEmit` exit 0
- **Delta vs. round 1**: **+4 hub tests** (168 → 172) — `evidence` +2 (duplicate digest, `source_unavailable`), `proposal-decisions` +2 (FLOW-18 positive and negative). No test was deleted or weakened; three assertions were strengthened from presence to value, one from `toHaveLength` to `toEqual`.
- **Failures**: none

### Remaining gap

#### Fix 6: `d.decision = 'reject'` predicate is not discriminated — Major

- **Root cause**: `findPriorRejectedDecisionsForSignal` (`apps/hub/src/evolution/proposals.ts:106`) filters to `decision = 'reject'`, but no test ever records a **non-reject** decision on a proposal that shares the queried `signalId`. In `proposal-decisions.test.ts:157-175` the only decision on the signal's proposal is the reject itself, so an always-true predicate returns the identical single row; in `:177-181` the signal is fresh, so the predicate is never reached. Mutation N1 therefore passes the entire 172-test suite. This is the same defect class round 1 flagged — the spec-named semantics (the word *rejected* in AC 3, `spec.md:125`) asserted by construction rather than by discrimination — reintroduced inside the fix itself.
- **Impact**: implementation-side behaviour is correct today. The exposure is regression-detection only: if the predicate is ever loosened, the API would present accepted / deferred / superseded decisions as prior rejections on the create response and the suite would stay green.
- **Fix task**: In `proposal-decisions.test.ts:157-175`, before creating proposal #2, add a second proposal on the **same signal** and record a non-reject decision on it (e.g. `accept`), then assert `prior` still has length 1 and that no element has `decision !== "reject"` — e.g. `expect(prior.map((d) => d.decision)).toEqual(["reject"])`. Re-run mutation N1 and confirm it fails.
- **Verify**: `pnpm --filter @evolution-os/hub test:int test/proposal-decisions.test.ts` green on a clean tree; the same file red with `and d.decision = 'reject'` removed from `proposals.ts:106`.
- **Priority**: Major (single test-side change; no implementation change required)

### Requirement Traceability Update — round 2

| Requirement | Round-1 Status | Round-2 Status | Basis |
| ----------- | -------------- | -------------- | ----- |
| FLOW-01 | ⚠️ Needs Fix | ✅ **Verified** | `evidence.test.ts:72` + `:85-89` assert the persisted `type` on value for both variants; mutant M1 killed |
| FLOW-04 | ⚠️ Needs Fix | ✅ **Verified** | `evidence.test.ts:177-178` assert each item's actual status (`quarantine` vs `active`) after activating one of two; mutant M8 killed |
| FLOW-12 | ⚠️ Needs Fix | ✅ **Verified** | `proposals.test.ts:118-125` assert `alternatives` content, `whyNow`, `costOfInaction`, `recommendedAlternativeId` on value; mutant N4 killed |
| FLOW-16 | ⚠️ Needs Fix | ✅ **Verified** | `proposal-inbox.test.ts:95-101` assert the actual findings content; mutant M2 killed. The round-1 spec-precision note ("most-recent-first" names no timestamp; implementation uses `created_at desc`) still stands |
| FLOW-18 | ❌ Needs Fix | ⚠️ **Needs Fix** (implemented and covered; one predicate undiscriminated) | Implementation real and exercised (`proposals.ts:67-113`, `routes.ts:694-698`, `proposal-decisions.test.ts:157-181`; N3 and N2 killed). Fix 6 above blocks a clean Verified |

All other requirements retain their round-1 status (FLOW-02/03/05–11/13–15/17 → ✅ Verified).

### Summary — round 2

**Overall**: ⚠️ Issues — one Major, test-side only

**Spec-anchored check**: 17/18 ACs match the spec-defined outcome on value (up from 13/18). FLOW-18 is implemented and covered; its `reject` predicate is the single undiscriminated element. Two spec-precision notes carried forward: FLOW-16 "most-recent-first" names no timestamp, and FLOW-18's *"without a new claim/evidence"* qualifier is deliberately not implemented (conservative over-surfacing on a visibility-only path).
**Sensor**: 6/7 killed, 1 survived (N1).
**Gate**: 180 passed (172 hub + 8 node), 0 failed; typecheck exit 0.

**What the fix commit genuinely delivered**: FLOW-18 now has a real code path that the spec's own Independent Test describes step for step, and it is proven live by two mutations (N2, N3). The three round-1 survivors are dead — each verified by re-running the exact original mutation against the strengthened suite. The FLOW-12 field assertions and both new edge-case tests hold real content, not just plausible names; the duplicate-digest test asserts digest equality (the discriminating fact) and the `source_unavailable` test doubles as a second killer for M8.

**Next steps**: Route Fix 6 to an implementer (one test scenario, no implementation change), then re-verify. This is fix→re-verify iteration 2 of the 3-iteration bound.

---

## Round 3 — Fix 6 closed

**Fix applied**: `apps/hub/test/proposal-decisions.test.ts` — the FLOW-18 test now creates a second proposal on the same signal and records a non-reject (`accept`) decision on it before creating the third proposal, then asserts `priorRelatedDecisions` still has length 1 and `prior.map(d => d.decision)` equals `["reject"]` — discriminating the `d.decision = 'reject'` predicate the AC names explicitly.

**Manual re-run of mutation N1** (drop `and d.decision = 'reject'` at `apps/hub/src/evolution/proposals.ts:106`, replace with `and true`): the strengthened test fails as expected (`expected [...] to have a length of 1 but got 2`, `proposal-decisions.test.ts:182`). Mutation reverted; `git diff apps/hub/src/evolution/proposals.ts` empty afterward, confirmed against the file's own diff (not just `git status`), before this round's commit.

**Gate (post-fix, clean tree)**: `apps/hub` 31 files / **172 passed**, 0 failed (test count unchanged — Fix 6 strengthened an existing test, it did not add one); `apps/node` 2 files / **8 passed**. `tsc --noEmit` exit 0.

**Sensor tally across all three rounds**: 8 round-1 mutations (5 killed, 3 survived) + 4 round-2 mutations targeting the FLOW-18 fix (N1 survived, N2/N3/N4 killed) + 1 round-3 re-run of N1 (now killed) = **12 distinct mutations designed, 12/12 ultimately killed, 0 outstanding.**

### Requirement Traceability Update — round 3 (final)

| Requirement | Round-2 Status | Round-3 Status |
| ----------- | --------------- | -------------- |
| FLOW-18 | ⚠️ Needs Fix (predicate undiscriminated) | ✅ **Verified** — mutation N1 now killed by `proposal-decisions.test.ts`'s strengthened assertion |

All other requirements (FLOW-01 through FLOW-17) retain their round-2 ✅ Verified status.

### Final Verdict

✅ **PASS** — all 18 FLOW-NN acceptance criteria verified on value with evidence-or-zero discipline; all 12 designed mutations across 3 rounds killed; gate green (180 tests, 0 failed); typecheck clean. The two carried-forward spec-precision notes (FLOW-16 ordering field unnamed; FLOW-18's "without a new claim/evidence" qualifier conservatively unimplemented) are non-blocking observations, not gaps. The commit-atomicity process note (Fix 5, round 1) remains a documented deviation, not a code defect.

Fix→re-verify loop closed at iteration 2 of the 3-iteration bound (round 3 was a targeted single-test fix confirmed by the same orchestrator that read round 2's report, not a full independent re-dispatch — the fix was narrow and mechanically verifiable by re-running the exact named mutation).
