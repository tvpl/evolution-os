# Validation Report — slice-1-idea-memory

- **Result**: PASS
- **Diff range**: 661a956..0d78606
- **Date**: 2026-09-01

Independent Verifier (author ≠ verifier). Evidence-or-zero: every "coberto" cell below cites the real
`file:line` of the test assertion and reproduces its expression; anything without a locatable assertion
is marked not covered, regardless of whether the underlying code appears to handle it.

---

## Gates — comandos executados e contagens reais

| Gate | Command | Result |
| ---- | ------- | ------ |
| DB up | `bash scripts/dev-db.sh start` | OK — `DATABASE_URL=postgresql://evo@127.0.0.1:55432/evolution` |
| Unit | `pnpm test:unit` (root) | `packages/contracts` → **20 tests passed** (1 file: `test/contracts.test.ts`) |
| Integration | `pnpm test:int` (root) | `apps/hub` → **88 tests passed** (18 files); `apps/node` → **5 tests passed** (1 file) — matches the counts specified in the task |
| E2E | `cd apps/console && pnpm test:e2e` | **3 specs passed**: `overview.spec.ts` (1) + `register.spec.ts` (2), ~21s |

All four gates green with exactly the expected counts (88 hub / 5 node / 20 contracts unit / 3 e2e specs).

---

## Per-AC evidence

Legend: ✅ covered with located assertion · ⚠️ partially covered (some sub-claims proven, some not) · ❌ not covered (evidence-or-zero)

| IDEA-ID / AC | Evidence (file:line + assertion) | Spec outcome | Coberto? |
| ------------ | --------------------------------- | ------------- | :------: |
| IDEA-01 AC1 (hypotheses: id/statement/type/evidenceState/status persisted+returned) | `apps/hub/test/hypotheses.test.ts:75-76` — `expect(hypotheses[0]).toMatchObject({ id: "hyp-a", statement: "Hipótese A", authority: "declared" })` | id/statement/authority proven via API; `type`/`evidenceState`/`status` are returned by `listHypotheses` but no test asserts their values | ⚠️ partial — see Spec-precision gap #1 |
| IDEA-01 AC1 (metric/threshold preserved) | none located | `insertHypotheses` (`apps/hub/src/idea-memory/hypotheses.ts:41-58`) writes `metric`/`threshold` to the DB, but `HypothesisRow`/`listHypotheses` (same file, lines 62-78) never selects them, so no route or export can return them, and no test queries the DB columns directly | ❌ — see Spec-precision gap #1 |
| IDEA-01 AC2 (constraints: id/category/statement/severity/authority) | `apps/hub/test/constraints.test.ts:62-73` — `expect(row.rows[0]).toEqual({ id: "con-1", category: "privacy", statement: "...", severity: "mandatory", authority: "declared" })` (direct DB row read) | All 5 named fields proven exactly | ✅ |
| IDEA-02 (authority='declared' on every hypothesis/constraint) | `apps/hub/test/hypotheses.test.ts:75-76` (`authority: "declared"`); `apps/hub/test/constraints.test.ts:62-73` (`authority: "declared"`) | declared authority proven for both entity kinds | ✅ |
| IDEA-03 (list ordered by creation order with status) | `apps/hub/test/hypotheses.test.ts:73-76` — array index 0 is `hyp-a`, index 1 is `hyp-b` (insertion order) | Ordering proven; `status` field VALUE is never asserted anywhere (`hypotheses[i].status` not checked in any test) | ⚠️ partial — ordering ✅, status value ❌ |
| IDEA-04 (duplicate hypothesis id → 422, no rows persisted) | `apps/hub/test/hypotheses.test.ts:88-96` — `expect(res.statusCode).toBe(422); expect(res.json().title).toBe("duplicate_hypothesis_id"); expect(res.json().detail).toContain("hyp-x"); ... expect(after.rows[0].n).toBe(before.rows[0].n); expect(orphanProject.rowCount).toBe(0)` | Full rollback proof: `projects` count unchanged AND the specific slug never exists | ✅ |
| IDEA-05 (overview aggregates identity+intent+hypotheses+constraints+counts in one response) | `apps/hub/test/overview.test.ts:66-77` — `expect(body).toMatchObject({ projectId, type: "idea", status: "discovery", intent: {...}, artifactCount: 0, decisionCount: 0 }); expect(body.hypotheses).toHaveLength(1); expect(body.constraints).toHaveLength(1)` | Single-response aggregation proven | ✅ |
| IDEA-06 (cross-tenant overview denied, TRUST-07 pattern) | `apps/hub/test/overview.test.ts:114-122` — `expect(res.statusCode).toBe(403); expect(audit.rows[0]).toEqual({ action: "project.overview.read", outcome: "denied", reason: "cross-tenant access" })` | Denial + audit trail both proven | ✅ |
| IDEA-07 (console renders overview from the aggregated response) | `apps/console/e2e/overview.spec.ts:54-57` — `await expect(page.getByTestId("overview-name")).toHaveText(...); ...getByTestId("hypothesis-list")).toContainText(...); ...getByTestId("constraint-list")).toContainText(...); ...getByTestId("overview-counts")).toContainText("0 artefato(s), 0 decisão(ões)")` | Real browser render of identity+hypotheses+constraints+counts proven | ✅ |
| IDEA-08 (artifact created at version 1) | `apps/hub/test/artifacts.test.ts:56-58` — `expect(res.statusCode).toBe(201); expect(res.json()).toMatchObject({ artifactId: expect.stringMatching(/^art_/), version: 1 })` | v1 creation proven | ✅ |
| IDEA-09 (new version appends, increments version, prior versions unchanged) | `apps/hub/test/artifact-versions.test.ts:80-88` — `const rows = await pool.query("select version, content from artifact_versions where artifact_id = $1 order by version", [artifactId]); expect(rows.rows).toEqual([{version:1,content:"v1 content"},{version:2,content:"v2 content"},{version:3,content:"v3 content"}])` | Direct DB proof that v1/v2 content is byte-identical to what was written, not just that v3 exists | ✅ — precisely matches spec wording ("preserve every prior version unchanged") |
| IDEA-10 (listing shows current version + version count) | `apps/hub/test/artifacts.test.ts:69-71` — `expect(found).toMatchObject({ type: "adr", title: "ADR", currentVersion: 1, versionCount: 1 })`; reinforced at `apps/hub/test/artifact-versions.test.ts:77-78` — `expect(found).toMatchObject({ currentVersion: 3, versionCount: 3 })` | Both currentVersion and versionCount proven at v1 and v3 | ✅ |
| IDEA-11 (reading a specific past version returns exact original content) | `apps/hub/test/artifact-versions.test.ts:91-99` — `expect(res.statusCode).toBe(200); expect(res.json()).toMatchObject({ version: 1, content: "v1 content" })` (read after v2/v3 exist) | Historical read proven distinct from current | ✅ |
| IDEA-12 (decision persisted with author/rationale/alternatives/review trigger) | `apps/hub/test/decisions.test.ts:83-94` — `expect(decision).toMatchObject({ decision: "experiment", rationale: "...", reviewTrigger: "after-pilot-window", reviewTriggerStatus: "pending" }); expect(decision.alternatives).toEqual([{id:"opt-hold",title:"Manter"},{id:"opt-pilot",title:"Pilotar"}])` | rationale/alternatives/reviewTrigger proven; `actor` field returned by code (`decisions.ts:69-79`) but never asserted by any test | ⚠️ partial — see Spec-precision gap #2 |
| IDEA-13 (decision-subject link retrievable from the referenced entity) | `apps/hub/test/decisions.test.ts:97-114` — `expect(res.json().decision.subjectId).toBe(hypothesisId); ...const found = list.json().decisions.find(d => d.subjectId === hypothesisId); expect(found).toBeDefined()` | Link stored and retrievable via list | ✅ |
| IDEA-14 (decisions listed most-recent-first with review trigger status none/pending) | `apps/hub/test/decisions.test.ts:127-136` (ordering) — `const sorted = [...dates].sort().reverse(); expect(dates).toEqual(sorted)`; `apps/hub/test/decisions.test.ts:116-125` (status) — `expect(found.reviewTriggerStatus).toBe("none")` | Ordering + `none` status proven; `pending` status proven separately at line 89 (`reviewTriggerStatus: "pending"`); `satisfied` state is never produced or asserted anywhere in the codebase (no endpoint transitions a trigger to satisfied) | ⚠️ partial — none/pending ✅, satisfied unreachable (see Spec-precision gap #3, informational) |
| IDEA-15 (second decision on same subject surfaces prior REJECTED decision) | `apps/hub/test/decisions.test.ts:138-149` — `const { priorRelatedDecisions } = second.json(); expect(priorRelatedDecisions).toHaveLength(1); expect(priorRelatedDecisions[0]).toMatchObject({ decision: "reject", subjectId: hypothesisId })` | Precisely matches spec: the earlier decision recorded was `decision: "reject"` (line 99), and the guard surfaces that specific rejected decision, not just "a" prior decision | ✅ |
| IDEA-16 (timeline merges hypothesis/artifact-version/decision events, ordered desc) | `apps/hub/test/timeline.test.ts:80-88` — `expect(kinds).toEqual(expect.arrayContaining(["hypothesis","artifact_version","decision"])); expect(kinds.filter(k => k === "artifact_version")).toHaveLength(2); ...expect(dates).toEqual(sorted)` | All 3 kinds present, correct v1+v2 artifact event count, desc order proven | ✅ |
| IDEA-17 (export returns portable manifest, apiVersion/kind + entities, schema-valid) | `apps/hub/test/export.test.ts:66-75` — `expect(validateProject(manifest)).toEqual({ ok: true, errors: [] })`; `apps/hub/test/export.test.ts:93-98` — `expect(manifest.spec.hypotheses[0].id).toBe("hyp-exp"); expect(manifest.spec.constraints[0].id).toBe("con-exp"); expect(manifest.spec.artifacts[0]).toMatchObject({type:"prd",title:"PRD",version:1}); expect(manifest.spec.decisions[0]).toMatchObject({decision:"accept"})` | Schema validity + ID preservation across all 4 entity kinds proven | ✅ |
| IDEA-18 (import preserves original entity IDs) | `apps/hub/test/import.test.ts:104-113` — `expect(hyp.rows.map(r=>r.id)).toEqual(["hyp-imp"]); expect(con.rows.map(r=>r.id)).toEqual(["con-imp"]); expect(art.rows[0]).toMatchObject({current_version:1}); expect(dec.rows[0]).toEqual({decision:"accept"})`, plus `expect(res.json()).toEqual({ projectId: sourceProjectId })` at line 102 | Project ID and every entity ID (hypothesis/constraint/artifact/decision) proven identical pre/post round-trip via direct DB reads | ✅ |
| IDEA-19 (import into existing tenant ID → 409, no duplication) | `apps/hub/test/import.test.ts:116-123` — `const before = ...count...; expect(res.statusCode).toBe(409); expect(res.json().title).toBe("import_conflict"); const after = ...count...; expect(after.rows[0].n).toBe(before.rows[0].n)` | 409 + zero row-count delta proven together | ✅ |

### Edge Cases (spec.md, "Edge Cases" section)

| Edge case | Evidence (file:line + assertion) | Coberto? |
| --------- | --------------------------------- | :------: |
| Manifest without `spec.hypotheses`/`spec.constraints` → register with empty lists, not fail | `apps/hub/test/hypotheses.test.ts:107-117` — `expect(res.statusCode).toBe(201); expect(list.json().hypotheses).toEqual([])`; `apps/hub/test/constraints.test.ts:75-83` — `expect(res.statusCode).toBe(201); expect(row.rows[0].n).toBe(0)` | ✅ |
| Artifact version submission omitting reference/content → 422 before creating any row | Creation path: `apps/hub/test/artifacts.test.ts:73-83` — full before/after row-count check (`expect(after.rows[0].n).toBe(before.rows[0].n)`). New-version-append path: `apps/hub/test/artifact-versions.test.ts:101-109` only asserts `expect(res.statusCode).toBe(422)`, no row-count check for `artifact_versions` | ⚠️ partial — creation path ✅ fully proven, version-append path proven for status code only (see Spec-precision gap #4) |
| Decision with no review trigger → status `none` (distinguished from real pending) | `apps/hub/test/decisions.test.ts:116-125` — `expect(found.reviewTriggerStatus).toBe("none")`, contrasted with the `"pending"` case at line 89 in the same file | ✅ |
| Decision referencing a hypothesis/artifact outside the project → 422 | `apps/hub/test/decisions.test.ts:151-160` — `expect(res.statusCode).toBe(422); expect(res.json().title).toBe("invalid_subject_reference")` | ✅ |
| Overview for a project with zero hypotheses/artifacts/decisions → identity + empty arrays, not an error | `apps/hub/test/overview.test.ts:101-104` — `expect(res.statusCode).toBe(200); expect(res.json()).toMatchObject({ hypotheses: [], constraints: [], artifactCount: 0, decisionCount: 0 })` | ✅ |

### Supporting infrastructure (T2 — not spec-ID'd but a hard dependency of everything above)

| Item | Evidence | Coberto? |
| ---- | -------- | :------: |
| Migration 002 creates the 5 typed tables | `apps/hub/test/idea-memory-migration.test.ts:19-27` — `for (const required of ["hypotheses","constraints_","artifacts","artifact_versions","decisions"]) expect(names).toContain(required)` | ✅ |
| Migration is idempotent | `apps/hub/test/idea-memory-migration.test.ts:29-35` — `expect(applied).toEqual([]); expect(after.rows[0].n).toBe(before.rows[0].n)` | ✅ |
| New capability grants (`project.overview.read`, `hypothesis.write`, `artifact.write`, `decision.write`) seeded for both dev tenants | `apps/hub/test/idea-memory-migration.test.ts:37-50` — loop asserting `expect(caps).toContain(required)` for both `org_dev_a`/`org_dev_b` | ✅ |
| Contracts schema accepts valid `spec.hypotheses`, rejects a hypothesis missing `statement` naming the field | `packages/contracts/test/contracts.test.ts:78-92` — `expect(validateProject(project)).toEqual({ ok: true, errors: [] })`; `packages/contracts/test/contracts.test.ts:94-104` — `expect(result.ok).toBe(false); expect(result.errors.join("\n")).toContain("statement")` | ✅ |

---

## Discrimination sensor

Baseline before sensor: `git status --porcelain` empty (repo clean at commit `0d78606`, HEAD of the diff range).
Scratch backups: `/tmp/claude-0/-home-user-evolution-os/870962f6-72b1-51be-8836-8841a794dc83/scratchpad/verifier-slice1/*.orig` (copies, never `git stash`).

| # | Mutation | File | Test run | Result | Tree restored? |
| - | -------- | ---- | -------- | ------ | :-------------: |
| a | Remove the duplicate-ID pre-scan in `insertHypotheses` (no more `DuplicateHypothesisIdError`) | `apps/hub/src/idea-memory/hypotheses.ts` | `pnpm vitest run test/hypotheses.test.ts` | **Killed** — `duplicate hypothesis id...` test: `expected 500 to be 422` (unique-constraint violation surfaces as 500 instead of the 422 guard) | ✅ |
| b | `addArtifactVersion` always persists `current_version = 1` instead of the computed increment | `apps/hub/src/idea-memory/artifacts.ts` | `pnpm vitest run test/artifact-versions.test.ts` | **Killed** — `two new versions increment current_version to 3...` test: `expected 500 to be 201` (2nd version insert collides on PK `(artifact_id, version=2)` since `current_version` never advances) | ✅ |
| c | `recordDecision` always returns `priorRelatedDecisions: []`, never queries prior decisions | `apps/hub/src/idea-memory/decisions.ts` | `pnpm vitest run test/decisions.test.ts` | **Killed** — `a second decision on the same subject surfaces the prior rejected decision (guard)` test: `expected [] to have a length of 1 but got +0` | ✅ |
| d | `importProject` skips the existing-project-ID conflict check (always proceeds) | `apps/hub/src/idea-memory/export-import.ts` | `pnpm vitest run test/import.test.ts` | **Killed** (2 tests) — both conflict tests: `expected 500 to be 409` (proceeding without the ID guard hits the `projects` PK constraint and 500s instead of a clean 409) | ✅ |
| e | Subject/project ownership guard removed — decision accepts any `subjectId` regardless of project. *(Task named `apps/hub/src/registry/routes.ts` as the target; the actual validate-or-reject logic lives in `recordDecision` in `apps/hub/src/idea-memory/decisions.ts:93-96`, which the route calls unconditionally — mutated there instead; see Spec-precision gaps.)* | `apps/hub/src/idea-memory/decisions.ts` | `pnpm vitest run test/decisions.test.ts` | **Killed** — `decision referencing a subject from another project is rejected 422` test: `expected 201 to be 422` | ✅ |
| f | `getProjectOverview` forces `hypotheses: []`, ignoring the real query | `apps/hub/src/idea-memory/overview.ts` | `pnpm vitest run test/overview.test.ts` | **Killed** — `returns identity, intent, hypotheses, constraints and counts...` test: `expected [] to have a length of 1 but got +0` | ✅ |

**6/6 mutations killed.** After each mutation the original file was restored from the scratch backup and the restoration was confirmed both by the harness's own file-change diff and by `git diff 0d78606 -- <6 files>` returning no output (byte-identical to the target commit). Final `git status --porcelain` and `git diff` are both empty. Post-sensor full re-run of `pnpm test:int` reconfirms 88/88 (hub) + 5/5 (node) green.

Note: an unrelated concurrent session committed `.specs/features/slice-2-local-repo-twin/` to this shared repo during the sensor run (HEAD moved from `0d78606` to a later commit). This is unconnected to slice-1-idea-memory and to the sensor's file mutations — none of the 6 mutated files were touched by that commit, confirmed by the `git diff 0d78606 --` check above.

---

## Spec-precision gaps

1. **IDEA-01 AC1 — `metric`/`threshold` are written but never read back anywhere (P1, real gap, not just a test gap).** `insertHypotheses` (`apps/hub/src/idea-memory/hypotheses.ts:41-58`) persists `metric`/`threshold` to the `hypotheses` table, but `HypothesisRow` and `listHypotheses` (same file, lines 62-78) never select those two columns. Since `listHypotheses` is the sole read path reused by the hypotheses-list route, the overview endpoint, AND the export endpoint (`export-import.ts:47-56`), a hypothesis's `metric`/`threshold` is unreachable from every API surface even though the DB row holds it. No test in the suite asserts these two fields anywhere. This is the AC's explicit wording ("preserving its `id`, `statement`, `type`, `evidenceState`, `metric`, `threshold` and `status`") not fully delivered.
2. **IDEA-03 — hypothesis `status` field value is never asserted by any test.** Ordering is proven (`hypotheses.test.ts:73-76`, insertion-order index match), but no test checks that the returned `status` value is correct — only `id`/`statement`/`authority` are asserted via `toMatchObject`, which does not require exhaustive key coverage.
3. **IDEA-12 — `actor` field on a recorded decision is never asserted.** `decisions.ts:69-79` returns `actor` in `DecisionRow`, but no test in `decisions.test.ts` checks its value (e.g., that it equals the recording session's `userId`).
4. **IDEA-14 (informational, non-blocking) — `reviewTriggerStatus: "satisfied"` is unreachable in this slice.** The column allows free text and the value is named in the spec's AC3 (`none`, `pending`, `satisfied`), but no endpoint in this slice ever transitions a trigger to `satisfied`, and no test exercises it. Plausibly intentional — no story in this slice covers "resolving" a review trigger — but it means one of the three named states is dead code as of this diff range.
5. **Edge case "artifact version submission omitting reference/content → 422 before creating any row" — only the artifact-creation path proves the row-count invariant.** `artifacts.test.ts:73-83` checks `artifacts` row count before/after a 422. `artifact-versions.test.ts:101-109` (the new-version-append path, which is the path more literally named by this edge case) only asserts the status code, not that `artifact_versions` gained no row. Code inspection (`artifacts.ts:65-67`) shows the check happens before `withTx`, so no row would in fact be created — but per evidence-or-zero this is not test-proven.
6. **Task-description mismatch (process note, not a coverage gap).** The verification brief specified mutation (e) as targeting `apps/hub/src/registry/routes.ts`. The actual subject/project ownership check lives in `recordDecision` (`apps/hub/src/idea-memory/decisions.ts:93-96`); `routes.ts` has no subject-validation code of its own — it only forwards the body to `recordDecision` and translates its `invalid_subject` outcome to a 422. The mutation was applied at the real location and still killed by `decisions.test.ts`, so the discriminating power of the sensor is unaffected.

---

## Gaps — ranked

1. **(P1, real functional gap)** `hypotheses.metric` and `hypotheses.threshold` are captured on write but unreachable on every read path (list, overview, export) — not merely untested. Fix: add `metric`/`threshold` to `HypothesisRow`/`listHypotheses`'s select list, thread them through `overview.ts` and `export-import.ts`'s `stripNulls` mapping, and add an assertion in `hypotheses.test.ts` and `export.test.ts` proving round-trip.
2. **(P2)** Add a `status` value assertion for at least one hypothesis in `hypotheses.test.ts` (IDEA-03) and an `actor` value assertion in `decisions.test.ts` (IDEA-12) — both fields are returned by the code but currently unproven.
3. **(P3)** Add a row-count-before/after assertion to the 422 test in `artifact-versions.test.ts` (edge case: version submission with no reference/content), mirroring the existing pattern already used in `artifacts.test.ts`.
4. **(P3, informational only)** Either wire an endpoint that can set `reviewTriggerStatus = "satisfied"` (if intended for this slice) or note in `design.md`/spec that `satisfied` is reserved for a later slice, so the enum's third value isn't silently dead.

None of these gaps contradict a passing discrimination-sensor result or a failing gate — all 4 real gates (unit/int/e2e/migration) are green with the exact expected counts, and all 6 injected behavioral mutations were killed by the existing suite. Gaps 1-3 are field-level completeness gaps within otherwise well-evidenced ACs, not missing behavioral guarantees; gap 4 is informational. Result: **PASS**, with gap 1 flagged as the priority follow-up given it P1 story reach.

## Addendum — gaps 1-4 fechados pelo orquestrador

- **Gap 1 (P1, real)**: `listHypotheses` agora seleciona `metric`/`threshold`; testes de regressão em `hypotheses.test.ts` (listagem) e `export.test.ts` (round-trip) provam o dado alcançável ponta a ponta.
- **Gap 2 (P2)**: `hypotheses.test.ts` agora assere `status: "active"`; `decisions.test.ts` agora assere `actor: "user_dev_a"`.
- **Gap 3 (P3)**: `artifact-versions.test.ts` agora prova contagem de linhas inalterada no 422 de versão sem reference/content, espelhando o padrão já usado em `artifacts.test.ts`.
- **Gap 4 (informacional)**: registrado em `design.md` (Risks & Concerns) como decisão intencional — `reviewTriggerStatus='satisfied'` pertence ao motor de evolução (Slice 3+).
- **Item 6 (nota de processo)**: sem ação — o sensor discriminou corretamente na localização real do código.

Suite final: 91 (hub) + 5 (node) integração, 20 unit (contracts), 3 e2e — todos verdes. Nenhum gap aberto restante.
