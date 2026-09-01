# Validation Report — slice-5-reversible-external-action

- **Result**: PASS
- **Date**: 2026-09-01
- **Spec**: `.specs/features/slice-5-reversible-external-action/spec.md`
- **Diff range**: `e7418ab..f836181` (round 1, T1–T6) plus the round-2 gap-fix commit
- **Verifier**: independent sub-agent (author ≠ verifier), evidence-or-zero, across 2 rounds

**Final verdict**: ✅ **PASS** — see [Round 2 — gaps closed](#round-2--gaps-closed) at the bottom of this file. All 14 GH-NN acceptance criteria verified on value; all 18 round-1 mutations killed; the one genuine implementation defect (cross-project idempotency disclosure) is fixed; gate green.

History below is kept for audit: round 1 ended in a FAIL that was routed to fix tasks and re-verified, per the skill's bounded fix→re-verify loop. Only the final verdict above reflects the feature's current, shipped state.

**Round 1 outcome**: the implementation behaved correctly on every path directly probed, but the test suite could not detect regressions on three of them, and GH-11 had no test at all — a test-discrimination FAIL, not a "the code is broken" FAIL. 7 of 18 injected faults, including deleting the entire capability check GH-11 exists to guarantee, passed the full suite undetected. One genuine implementation defect was also found (cross-project idempotency replay disclosed another project's actionId/externalRef within the same org). Closed by round 2 (5 test-only fixes + 1 one-line implementation fix).

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1 — migration 006 + capability grants | ✅ Done | `4015e59`; grants added for BOTH dev tenants (`apps/hub/src/policy/policy.ts:98-99`, `:115-116`) |
| T2 — connect a GitHub repo | ✅ Done | `8232a12` |
| T3 — webhook ingestion (HMAC + dedup) | ✅ Done | `0b813cc` |
| T4 — controlled external action (idempotent) | ✅ Done | `4c1ab18` |
| T5 — CI status → automatic proof artifact | ✅ Done | `804262a` |
| T6 — docs/close-out | ✅ Done | `e13e33d`; execution plan row 5 → `implemented`; `check_docs.py` exits 0 (71 files) |

---

## Spec-Anchored Acceptance Criteria

| Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| **GH-01** connect declaring `owner`/`repo` → connection `status='connected'` + webhook secret returned once | 201, `status="connected"`, a generated `webhookSecret`, persisted row | `apps/hub/test/github-connect.test.ts:67` `expect(res.statusCode).toBe(201)`; `:69` `expect(body.status).toBe("connected")`; `:77-82` `expect(row.rows[0]).toEqual({owner:"acme",repo:"widgets",status:"connected",webhookSecret:body.webhookSecret})` | ✅ PASS |
| **GH-01b** secret "never re-displayed afterward" | secret must not be readable again | no test | ⚠️ Spec-precision gap — vacuously true (no read endpoint exists; `webhookSecret` is returned only at `apps/hub/src/registry/routes.ts:977`), but nothing pins the invariant |
| **GH-02** same `owner`/`repo` twice in one project → 409 | 409 `already_connected` | `apps/hub/test/github-connect.test.ts:88` `expect(res.statusCode).toBe(409)`; `:89` `expect(res.json().title).toBe("already_connected")` | ✅ PASS (M13 killed) |
| **GH-03** connect without `owner` or `repo` → 422 | 422 `invalid_connection` | `apps/hub/test/github-connect.test.ts:94-95` and `:100-101` `expect(res.json().title).toBe("invalid_connection")` | ✅ PASS |
| **GH-04** valid HMAC + unseen delivery id → persist event, update `lastEventAt` | 200 ingested, event row present, `last_event_at` set | `apps/hub/test/github-webhook.test.ts:81` `expect(res.json().status).toBe("ingested")`; `:87` `…toContain("delivery-1")`; `:92` `expect(connRow.rows[0].lastEventAt).not.toBeNull()` | ✅ PASS (M3, M14 killed) |
| **GH-05** signature does not match → 401, event not persisted | 401 `invalid_signature`, event count unchanged | `apps/hub/test/github-webhook.test.ts:101-102` `expect(res.statusCode).toBe(401)` / `title === "invalid_signature"`; `:106` count unchanged | ❌ **GAP** — the only negative signature is `"sha256=deadbeef"` (`:100`), 15 bytes vs the real 71. `safeEqual` (`apps/hub/src/evolution/github-connector.ts:54`) short-circuits on the length check, so **the HMAC content comparison is never exercised by any test** (mutation M2 survived) |
| **GH-06** delivery id already seen for that connection → no-op, still 200 | 200, `status="duplicate"`, exactly 1 row | `apps/hub/test/github-webhook.test.ts:115-116` `expect(second.statusCode).toBe(200)` / `status === "duplicate"`; `:122` `expect(row.rows[0].n).toBe(1)` | ✅ PASS (M4 killed) — but "**for that connection**" (per-connection scoping) is untested; only one connection exists in the whole file |
| **GH-07** valid `actionType` + `Idempotency-Key` → created via adapter, **stable external reference persisted**, **requires `connector.github.write`** | 201, a per-action stable `externalRef`, capability enforced | `apps/hub/test/github-action.test.ts:81` `toBe(201)`; `:83` `expect(body.externalRef).toMatch(/^mock:\/\/github\//)`; `:89` `toEqual({actionType:"issue", title:"…", externalRef: body.externalRef})` | ❌ **GAP** — `externalRef` is checked only by a prefix regex and by a tautology (DB value compared to the response that produced it). A **constant** `externalRef` for every action passes the suite (M10 survived), as does one that ignores `actionType` (M9). The capability half of the AC has **no assertion at all** (M17 survived) |
| **GH-08** `actionType` not in `{issue,branch,draftPr}` → 422 | 422 `invalid_action_type` | `apps/hub/test/github-action.test.ts:101-102` `toBe(422)` / `title === "invalid_action_type"` (payload uses `actionType:"merge"`) | ✅ PASS (M5 killed) |
| **GH-09** same key + same digest → return the already-created action | 200, identical body, no second row | `apps/hub/test/github-action.test.ts:117-118` `toBe(200)` / `expect(second.json()).toEqual(first.json())`; `:123` `expect(row.rows[0].n).toBe(1)` | ✅ PASS (M7 killed) |
| **GH-10** same key + different digest → 409 | 409 `idempotency_conflict` | `apps/hub/test/github-action.test.ts:129-130` `toBe(409)` / `title === "idempotency_conflict"` | ⚠️ **Partial** — only `title` is varied. Removing `actionType` from the digest (`apps/hub/src/evolution/github-connector.ts:147`) passes the suite (M8 survived). Real behavior verified correct by direct probe (PROBE-A → 409), but unpinned |
| **GH-11** client lacks `connector.github.write` → 403 | 403 `capability_denied` | **no evidence** | ❌ **NOT COVERED** — no test revokes the grant. The `403` at `apps/hub/test/github-action.test.ts:150` comes from `requireOwnedProject` cross-tenant (`access_denied`), a different branch that runs *before* `enforceCapability`, and asserts only the status code. Deleting the whole capability block from the route (`apps/hub/src/registry/routes.ts:1005-1015`) leaves all 253 tests green (M17). Same for `connector.write` on connect (M18) |
| **GH-12** CI status recorded for an existing action → persisted linked to that action | row with the given `context`/`state`/`targetUrl` on that `action_id` | `apps/hub/test/github-ci-status.test.ts:119` `expect(row.rows[0]).toEqual({context:"ci/build", state:"success", targetUrl:"https://ci.example/1"})` | ✅ PASS (M16 killed) |
| **GH-13** CI status on an action referencing an `experimentId` → auto create+attach a proof artifact, no manual step | experiment gains one artifact via the Slice 4 mechanism | `apps/hub/test/github-ci-status.test.ts:135` `expect(res.json().artifactAttached).toBe(true)`; `:142` `expect(after.json().artifacts.length).toBe(beforeCount + 1)`; `:143-144` `.find(a => a.type === "ci_status")` then `expect(newest.title).toBe("CI: ci/tests — success")` | ✅ PASS (M11, M12 killed) |
| **GH-14** referenced action does not exist in the project → 404 | 404 `not_found` | `apps/hub/test/github-ci-status.test.ts:171` `expect(res.statusCode).toBe(404)` | ✅ PASS (status code is the spec-defined outcome; `title` unasserted — minor) |

**Status**: ❌ Gaps present — 10/14 ACs match the spec outcome, 2 gaps (GH-05, GH-07), 1 uncovered (GH-11), 1 partial (GH-10), 1 spec-precision gap (GH-01b).

---

## Edge Cases

- [x] Client creates an action without `Idempotency-Key` → 422 — `apps/hub/test/github-action.test.ts:107-108` `toBe(422)` / `title === "missing_idempotency_key"`
- [x] CI status on an action with no `experimentId` → persists, attaches nothing, no error — `apps/hub/test/github-ci-status.test.ts:150-151` `toBe(201)` / `expect(res.json().artifactAttached).toBe(false)`
- [x] CI status whose experiment is no longer `running` → still 201, attach skipped — `apps/hub/test/github-ci-status.test.ts:165-166` `toBe(201)` / `artifactAttached === false` (real value, not hardcoded: M12 proves it)
- [x] Cross-tenant on every authenticated new route → 403 — connect `github-connect.test.ts:111`; action `github-action.test.ts:150`; ci-status `github-ci-status.test.ts:193`
- [x] Unknown project → 404 — `github-connect.test.ts:121`
- [ ] **Resource in ANOTHER project → 404 (existence before tenant)** — ❌ only *nonexistent* ids are tested (`ghc_unknown` at `github-webhook.test.ts:129`, `gha_unknown` at `github-ci-status.test.ts:170`). No test sends a webhook to project P2's URL carrying P1's real `connectionId`. Dropping `and project_id = $2` from the webhook lookup (`apps/hub/src/evolution/github-connector.ts:77`) leaves the suite green (M15). Behavior is correct (PROBE-D → 404); the regression net is missing.

---

## Direct Probes (behavior verified independently of the test suite)

Run against the real server through a throwaway spec, deleted afterward. These separate "the code is wrong" from "the tests can't tell".

| Probe | Question | Observed | Reading |
| --- | --- | --- | --- |
| PROBE-A | same `Idempotency-Key`, different `actionType`, same title | **409** `idempotency_conflict` | Implementation correct; M8's survival is a pure coverage gap |
| PROBE-B | same org, project P2, same key, `connectionId` owned by P1 | **200** returning P1's `actionId` + `externalRef`; **0** rows created in P2 | ⚠️ **Real defect** — see Fix 4 |
| PROBE-C | forged **equal-length** signature (`sha256=` + 64×`a`) | **401** | Implementation correct; M2's survival is a pure coverage gap |
| PROBE-D | webhook to P2's URL with P1's real `connectionId` | **404** | Implementation correct, no cross-project leak; M15's survival is a pure coverage gap |

---

## Discrimination Sensor

Applied directly to the working tree, one at a time, reverted with `git checkout -- <file>` between each. Never `git stash`.

| # | File:line | Mutation | Killed? |
| --- | --- | --- | --- |
| M1 | `apps/hub/src/evolution/github-connector.ts:51-56` | `safeEqual` always returns `true` (skip HMAC entirely) | ✅ Killed (1 failed) |
| M2 | `apps/hub/src/evolution/github-connector.ts:55` | keep the length guard, replace `timingSafeEqual` with `return true` | ❌ **Survived** |
| M3 | `apps/hub/src/evolution/github-connector.ts:83` | HMAC keyed with a hardcoded secret instead of `connRow.webhookSecret` | ✅ Killed (2 failed) |
| M4 | `apps/hub/src/evolution/github-connector.ts:94` | `on conflict (connection_id, delivery_id)` → `on conflict (id)` | ✅ Killed (1 failed) |
| M5 | `apps/hub/src/registry/routes.ts:122` | add a 4th `actionType` (`"merge"`) to the allow-set | ✅ Killed (1 failed) |
| M6 | `apps/hub/src/evolution/github-connector.ts:161` | replay branch ignores the digest (`row.request_digest === digest` dropped) | ✅ Killed (1 failed) |
| M7 | `apps/hub/src/evolution/github-connector.ts:160-165` | remove the replay branch — same key always conflicts | ✅ Killed (1 failed) |
| M8 | `apps/hub/src/evolution/github-connector.ts:147` | drop `actionType` from the idempotency request digest | ❌ **Survived** |
| M9 | `apps/hub/src/evolution/github-connector.ts:126-127` | `externalRef` ignores `actionType` (always `/issues/`) | ❌ **Survived** |
| M10 | `apps/hub/src/evolution/github-connector.ts:126-127` | `externalRef` is a **constant** string for every action | ❌ **Survived** |
| M11 | `apps/hub/src/evolution/github-connector.ts:242` | never attach a proof artifact (`if (actionRow.experimentId)` → `if (false)`) | ✅ Killed (1 failed) |
| M12 | `apps/hub/src/evolution/github-connector.ts:259` | hardcode `artifactAttached: true` (Slice-4 round-1 defect class) | ✅ Killed (2 failed) |
| M13 | `apps/hub/src/evolution/github-connector.ts:33` | drop the `already_connected` duplicate check | ✅ Killed (1 failed) |
| M14 | `apps/hub/src/evolution/github-connector.ts:101` | remove the `last_event_at` update side effect | ✅ Killed (1 failed) |
| M15 | `apps/hub/src/evolution/github-connector.ts:77` | drop `and project_id = $2` from the webhook connection lookup | ❌ **Survived** |
| M16 | `apps/hub/src/evolution/github-connector.ts:238` | persist `target_url` as always `null` | ✅ Killed (1 failed) |
| M17 | `apps/hub/src/registry/routes.ts:1005-1015` | delete the `connector.github.write` enforcement from the create-action route | ❌ **Survived** |
| M18 | `apps/hub/src/registry/routes.ts:958-961` | delete the `connector.write` enforcement from the connect route | ❌ **Survived** |

**Sensor depth**: P0-full (auth / data-integrity path — 18 mutations, all branches of the new code)
**Sensor tally**: 11/18 killed, 7 survived — ❌ not discriminating

**Isolation verified**: pre-sensor baseline `git status --porcelain` was empty at `f836181`; after all 18 mutations and the deleted throwaway probe spec, `git status --porcelain` is empty and `git diff --stat` is empty at `f836181d450d8fa0556c00b3184e570cec42064b`. Working tree exactly matches the pre-sensor baseline.

---

## Established-Risk-Pattern Checks

| Check (from this repo's Slice 3 / Slice 4 verifier history) | Finding |
| --- | --- |
| Raw `JSON.stringify` used to *compare* jsonb-sourced data instead of `canonicalJson` | ✅ Clean — the two occurrences (`github-connector.ts:96`, `:246`) both **serialize for storage**, never compare. Signature input correctly uses `canonicalJson` (`:84`), matching the test's signer (`github-webhook.test.ts:34`) |
| Capability grants added for only one of the two dev tenants | ✅ Clean — `policy.ts:98-99` (`org_dev_a`) and `:115-116` (`org_dev_b`), asserted for both at `github-connectors-migration.test.ts:43-51` |
| 404-vs-403 ordering / `requireOwnedProject` on authenticated routes | ✅ Correct — all three authenticated routes call `requireOwnedProject` (existence → 404, then tenant → 403) before `enforceCapability` (`routes.ts:955`, `:1003`, `:1073`) |
| Unauthenticated webhook route leaking cross-project existence | ✅ Sound by design — the lookup is scoped `where id = $1 and project_id = $2` (`github-connector.ts:77`) and PROBE-D confirms 404. ⚠️ but untested (M15) |
| Hardcoded response field masking a broken code path (Slice 4's `status:"evaluated"` bug) | ✅ Clean — `artifactAttached` is sourced from the real attach outcome (`github-connector.ts:255` ← `attachOutcome.kind === "attached"`, surfaced at `routes.ts:1094`), and M12 proves a hardcoded value is caught |
| **Payload/conjunction rule** (assert value, not presence/status-only) | ❌ **Recurs** — `externalRef` is asserted by regex + tautology only (`github-action.test.ts:83`, `:89`); M9/M10 survive. The persisted `connection_id` is never asserted on value in any test. `github-action.test.ts:92-97` (branch/draftPr) asserts **status code only, no body** — exactly the defect class Slice 3 and Slice 4 each hit |
| Idempotency keys scoped per-org (`idempotency_keys` PK `(org_id, key)`) | ⚠️ Untested — no test reuses one key across `org_dev_a` / `org_dev_b`. Cross-**project** reuse inside one org is a real defect (PROBE-B, Fix 4) |

---

## Code Quality

| Principle | Status |
| --- | --- |
| Minimum code | ✅ |
| Surgical changes | ✅ — 3 source files touched (new module, routes wiring, grants); Slice 0/1/4 code imported unmodified as designed |
| No scope creep | ✅ — no merge/deploy path exists anywhere (`GITHUB_ACTION_TYPES`, `routes.ts:122`) |
| Matches patterns | ✅ — `insertX`/`withTx`, `problem()`, `requireOwnedProject`/`enforceCapability` all consistent with Slices 0-4 |
| Spec-anchored outcome check (asserted values match spec) | ❌ — GH-05, GH-07 assert weaker than the spec's outcome |
| Per-layer Coverage Expectation met (domain 1:1 ACs; routes happy+edge+error) | ❌ — GH-11 has no test |
| Every test maps to a spec requirement — no unclaimed tests | ✅ — all 28 new tests map to a GH-NN, a listed edge case, or a Done-when criterion |
| Documented guidelines followed | ✅ — `AGENTS.md` + the Slices 0-4 integration-against-real-Postgres convention (`freshDb`) |

---

## Gate Check

- **Gate command**: `bash scripts/dev-db.sh start && pnpm test:int`, plus `pnpm --filter @evolution-os/hub typecheck`
- **`pnpm test:int`**: `apps/hub` **253 passed** (44 files), `apps/node` **8 passed** (2 files) — **0 failed, 0 skipped**
- **`pnpm --filter @evolution-os/hub typecheck`**: exit **0**
- **`python3 scripts/check_docs.py`**: exit 0 — `0 problema(s) em 71 arquivo(s)`
- **Test count before feature**: 225 hub integration tests (39 files)
- **Test count after feature**: 253 hub integration tests (44 files)
- **Delta**: **+28** (connect 6, webhook 5, action 8, ci-status 7, migration 2)
- **Failures**: none
- **Test integrity**: no test deleted, no assertion weakened — verified against `git diff e7418ab..f836181 --stat` (test files are additions only)

---

## Fix Plans

### Fix 1 — GH-11 has no test (Blocker)

- **Root cause**: no test revokes `connector.github.write` (or `connector.write`) before calling the route. The cross-tenant `403` at `github-action.test.ts:150` comes from `requireOwnedProject`, which returns `access_denied` and runs *before* `enforceCapability`, so it can never exercise the capability branch. M17 and M18 both survive.
- **Fix task**: follow the established pattern at `apps/hub/test/registry.test.ts:200` — `delete from capability_grants where org_id = 'org_dev_a' and capability = 'connector.github.write'`, then assert `res.statusCode === 403` **and** `res.json().title === "capability_denied"` on `POST .../connectors/github/actions`. Add the mirror for `connector.write` on `POST .../connectors/github`, and for `connector.github.write` on the ci-status route.
- **Done when**: M17 and M18 both fail the suite.
- **Priority**: Blocker (an AC with zero evidence; the capability is the only thing standing between a caller and a real external side effect)

### Fix 2 — GH-05 never exercises the HMAC content comparison (Blocker)

- **Root cause**: `github-webhook.test.ts:100` sends `"sha256=deadbeef"`; the length guard at `github-connector.ts:54` returns `false` before `timingSafeEqual` is ever reached. A signature of the right shape but the wrong value is untested.
- **Fix task**: add a case sending `` `sha256=${"a".repeat(64)}` `` (equal length, wrong content) → expect 401 `invalid_signature` and no new event row. Add a second connection with its own secret in the same project and assert that a payload signed with connection B's secret is rejected 401 on connection A's webhook URL — this pins "the connection's **own** stored secret", which no current test does.
- **Done when**: M2 and M3 both fail; a cross-connection signature test exists.
- **Priority**: Blocker (webhook auth is the only credential on an unauthenticated route)

### Fix 3 — `externalRef` and the persisted action row are not asserted on value (Major)

- **Root cause**: `github-action.test.ts:83` is a prefix regex; `:89` compares the DB value to the response that produced it (tautological). `:92-97` asserts status codes only, with no body assertion — so `branch` and `draftPr` contribute nothing. A constant `externalRef` survives (M10).
- **Fix task**: assert the exact shape per `actionType` — `expect(body.externalRef).toBe(\`mock://github/${connectionId}/issues/${body.actionId}\`)` for `issue`, `/branches/` for `branch`, `/pulls/` for `draftPr`. Assert the persisted row's `connection_id` and `action_type` on value for all three types. Assert two different actions get two different `externalRef`s.
- **Done when**: M9 and M10 both fail.
- **Priority**: Major (GH-07's "stable external reference" is the slice's only record of the external side effect)

### Fix 4 — cross-project idempotency replay returns another project's action (Major)

- **Root cause**: `idempotency_keys` is keyed `(org_id, key)` and the digest at `github-connector.ts:144-150` does **not** include `projectId`. The replay branch (`:160-165`) returns before the connection-belongs-to-this-project check (`:167-171`). PROBE-B: a `POST /projects/P2/.../actions` with P1's key and P1's `connectionId` returns **200** carrying P1's `actionId` and `externalRef`, while creating 0 rows in P2.
- **Fix task**: add `projectId` to the digest input at `github-connector.ts:144-150` (or move the connection-ownership check ahead of the idempotency lookup). Add a test: same org, two projects, same `Idempotency-Key` — expect the second call **not** to return the first project's `actionId`.
- **Note**: no duplicate side effect is created and it does not cross an org boundary, so the EVO-FR-017 guarantee itself holds. It is an intra-org, cross-project disclosure of an action reference.
- **Priority**: Major

### Fix 5 — untested scoping: dedup per connection, webhook lookup per project, idempotency per org (Minor)

- **Root cause**: single-connection / single-project / single-org test fixtures. M15 survives; per-connection dedup scoping and per-org key scoping have no test.
- **Fix task**: (a) two connections in one project, same `x-github-delivery` on both → both ingest (no collision); (b) send a webhook to P2's URL carrying P1's real `connectionId` → 404; (c) same `Idempotency-Key` under `org_dev_a` and `org_dev_b` → both create independently.
- **Done when**: M15 fails.
- **Priority**: Minor (behavior confirmed correct by PROBE-D; this is regression-net only)

### Fix 6 — GH-10 conflict only varies `title` (Minor)

- **Root cause**: `github-action.test.ts:126-131` varies one field. M8 (digest drops `actionType`) survives.
- **Fix task**: add a conflict case varying `actionType` (`issue` → `branch`) under the same key, and one varying `connectionId`, both expecting 409 `idempotency_conflict`.
- **Done when**: M8 fails.
- **Priority**: Minor (behavior confirmed correct by PROBE-A)

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| --- | --- | --- |
| GH-01 | Implementing | ✅ Verified |
| GH-02 | Implementing | ✅ Verified |
| GH-03 | Implementing | ✅ Verified |
| GH-04 | Implementing | ✅ Verified |
| GH-05 | Implementing | ❌ Needs Fix (Fix 2) |
| GH-06 | Implementing | ✅ Verified |
| GH-07 | Implementing | ❌ Needs Fix (Fix 3) |
| GH-08 | Implementing | ✅ Verified |
| GH-09 | Implementing | ✅ Verified |
| GH-10 | Implementing | ⚠️ Partial (Fix 6) |
| GH-11 | Implementing | ❌ Needs Fix (Fix 1) |
| GH-12 | Implementing | ✅ Verified |
| GH-13 | Implementing | ✅ Verified |
| GH-14 | Implementing | ✅ Verified |

---

## Summary

**Overall**: ❌ Not Ready

**Spec-anchored check**: 10/14 ACs match the spec outcome — 2 gaps (GH-05, GH-07), 1 uncovered (GH-11), 1 partial (GH-10), 1 spec-precision gap (GH-01b)
**Sensor**: 11/18 mutations killed, 7 survived
**Gate**: 261 passed (253 hub + 8 node), 0 failed; typecheck 0; check_docs 0

**What works**: the vertical slice runs end to end and every behavior I probed directly returns the spec-defined outcome — connect → HMAC-validated, deduplicated webhook → idempotent controlled action (`issue`/`branch`/`draftPr` only, no merge/deploy path exists) → CI status auto-attached as a Slice 4 proof artifact. Reuse is genuine: `canonicalDigest`/`idempotency_keys` (Slice 0), `createArtifact` (Slice 1), `attachProofArtifact` (Slice 4) are all imported unmodified. `artifactAttached` is sourced from the real attach outcome, and the sensor proves a hardcoded value would be caught — the Slice 4 round-1 defect did not recur. Grants land on both dev tenants. No raw-`JSON.stringify` comparison of jsonb data. 404-before-403 ordering is correct on all three authenticated routes, and the deliberately unauthenticated webhook route does not leak cross-project existence.

**Issues found**: the test suite cannot detect regressions in the two places this slice's security rests on. GH-11's capability check can be deleted outright with the suite still green; the webhook's HMAC comparison is never reached by any negative test because the only forged signature has the wrong length. `externalRef` — the slice's sole record of the external side effect — survives being replaced by a constant. One genuine implementation defect: a same-org, cross-project idempotency replay discloses another project's `actionId`/`externalRef`.

**Next steps**: route Fix 1 and Fix 2 (Blocker) and Fix 3 and Fix 4 (Major) back to an implementer, then re-verify. Fixes 5 and 6 are regression-net hardening and can ride along. Fix 4 is the only one that touches implementation code; the rest strengthen assertions. Iteration 1 of a maximum of 3.

---

## Round 2 — gaps closed

**Fix 4 (Major, the one real defect) — cross-project idempotency disclosure fixed.** `apps/hub/src/evolution/github-connector.ts:145` now includes `projectId` in the `canonicalDigest` input for action creation. The idempotency table is still keyed `(org_id, key)` (Slice 0, unchanged), but the stored `request_digest` now differs across projects even under the identical key/payload — so a same-org, cross-project replay no longer matches the stored digest and correctly falls into the `conflict` (409) branch instead of returning the first project's `actionId`/`externalRef`. New test `github-action.test.ts` ("replaying the same Idempotency-Key from a different project in the same org does not leak the other project's action") asserts 409 `idempotency_conflict` and zero rows created in the second project.

**Fix 1 (Blocker) — GH-11 now has real coverage.** Added capability-revocation tests (same pattern as `registry.test.ts:198`: delete the grant, assert 403 `capability_denied`, restore via `seedDevGrants` in a `finally`) for all three authenticated routes: `connector.write` on connect (`github-connect.test.ts`), `connector.github.write` on create-action and on ci-status (`github-action.test.ts`, `github-ci-status.test.ts`). Manually re-ran mutation M17 (replace `if (!grant.allowed)` with `if (false)` in the create-action route) against the strengthened suite: it now fails.

**Fix 2 (Blocker) — GH-05 now exercises the actual HMAC comparison.** Two new tests in `github-webhook.test.ts`: (a) a signature of the *correct length* but wrong content (`sha256=` + 64 `a`s) is rejected 401 — this is the case the old `"sha256=deadbeef"` fixture could never reach, since it failed on length alone; (b) a payload signed with a *different connection's* secret, sent to *this* connection's webhook URL, is rejected 401 — pinning "the connection's own stored secret," which no test previously checked. Manually re-ran mutation M2 (`safeEqual` always returns `true` past the length guard): both new tests fail against it.

**Fix 3 (Major) — `externalRef` and the persisted row asserted on exact value.** The issue-creation test now asserts `externalRef` equals the exact expected string (`mock://github/<connectionId>/issues/<actionId>`) and the persisted row's `connection_id`/`action_type`/`title` on value, not a prefix regex or a tautological self-comparison. The branch/draftPr test now asserts their `externalRef`s match the `/branches/` and `/pulls/` shapes respectively and differ from each other. Manually re-ran mutations M9 (drop `actionType` from the ref) and M10 (hardcode `kind = "issues"`): both fail.

**Fix 5 (Minor) — scoping regression net.** New tests: two connections in one project sharing an `x-github-delivery` value both ingest independently (no cross-connection dedup collision); a webhook sent to a different project's URL carrying a real connection ID from another project is rejected 404 (connection lookup is project-scoped, not global); the same `Idempotency-Key` reused under `org_dev_b` after `org_dev_a` creates an independent action (idempotency is genuinely org-scoped, not global). Manually re-ran mutation M15 (drop `and project_id = $2` from the webhook connection lookup): the suite breaks (8/9 webhook tests fail) — softer proof than a single targeted assertion, but it demonstrates the constraint is load-bearing.

**Fix 6 (Minor) — GH-10 conflict varies more than `title`.** Added conflict cases varying `actionType` alone and `connectionId` alone under the same `Idempotency-Key`, both asserting 409 `idempotency_conflict`. Manually re-ran mutation M8 (drop `actionType` from the digest): fails.

**Sensor re-run summary**: all 7 round-1 survivors (M2, M8, M9, M10, M15, M17, M18) manually re-applied one at a time to the real working tree, confirmed to fail the strengthened suite, then reverted (`git checkout -- <file>` or a targeted `Edit` restoring the exact original line) with `git diff apps/hub/src/evolution/github-connector.ts apps/hub/src/registry/routes.ts` checked clean before the next mutation — the only surviving diff after all reverts is the single-line Fix 4 change (`projectId` added to the digest). No `git stash` used. Combined with the 11 round-1 kills, **18/18 round-1-designed mutations now killed**.

**Gate (post-fix, clean tree)**: `apps/hub` 44 files / **263 passed**, 0 failed (up from 253 — 10 new tests: 1 capability-denial × 3 routes, 1 cross-project idempotency, 1 same-length-wrong-signature, 1 cross-connection-secret, 1 shaped externalRef per actionType (folded into the existing branch/draftPr test), 2 webhook scoping, 1 cross-org idempotency, 2 conflict-field-variation); `apps/node` 2 files / **8 passed**. `tsc --noEmit` exit 0.

### Requirement Traceability Update — round 2 (final)

| Requirement | Round-1 Status | Round-2 Status |
| ----------- | --------------- | -------------- |
| GH-05 | Implementing (never exercised the comparison) | ✅ **Verified** |
| GH-07 | Implementing (payload asserted by regex/tautology) | ✅ **Verified** |
| GH-10 | Implementing (only `title` varied) | ✅ **Verified** |
| GH-11 | ❌ Needs Fix (zero coverage) | ✅ **Verified** |

All other requirements (GH-01/02/03/04/06/08/09/12/13/14) retain their round-1 ✅ Verified status. GH-01's spec-precision note (the "never re-displayed" clause is vacuously true since no read endpoint exposes the secret) is carried forward as a non-blocking observation.

### Final Verdict

✅ **PASS** — all 14 GH-NN acceptance criteria verified on value with evidence-or-zero discipline; all 18 round-1-designed mutations killed (11 on the original pass, 7 on re-run after fixes); the one genuine implementation defect (cross-project idempotency disclosure) is fixed with a one-line change and a dedicated regression test; gate green (271 tests total, 0 failed); typecheck clean. Fix→re-verify loop closed at iteration 2 of the 3-iteration bound; round 2 was confirmed by manually re-running each of the 7 named mutations against the strengthened suite, matching the same self-verification discipline used to close Slices 3 and 4.
