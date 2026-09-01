# Validation Report — Slice 8 Portfolio Campaign

- **Result**: FAIL

**Verifier**: independent re-derivation from spec.md/design.md/tasks.md against the actual code and tests, with a discrimination-sensor (mutation) pass against an isolated scratch copy. No code was fixed; this report only verifies.

**Scope read in full**: `spec.md`, `design.md`, `tasks.md`, `apps/hub/migrations/009_portfolio.sql`, `apps/hub/src/evolution/portfolio.ts`, the portfolio routes in `apps/hub/src/registry/routes.ts` (lines 1533-1688), `apps/hub/src/policy/policy.ts` (grant seeding), and all seven `apps/hub/test/portfolio-*.test.ts` files.

Bottom line: the implementation itself is correct everywhere I checked (the wave gate genuinely checks ALL prior waves via `cw.seq < $2`, not just the immediately-preceding one; multi-wave target validation genuinely validates every wave via `flatMap`; the justification check genuinely rejects whitespace-only strings via `.trim()`). The **FAIL** is a test-coverage verdict: the discrimination sensor found that the test suite never exercises the scenarios that would distinguish the correct implementation from a plausible, more restrictive regression of it — most importantly the entire multi-wave (3+) canary gate, which is the stated "coração do slice." A future one-line regression to any of the four mutated spots below would ship green.

---

## 1. Per-requirement evidence (PORT-01..19)

| Req | AC (short) | Implementation | Test | Verdict |
| --- | --- | --- | --- | --- |
| PORT-01 | Declare relation in closed set, listable both directions | `declareRelation` `apps/hub/src/evolution/portfolio.ts:25-59`; `listRelations:74-86`; route `apps/hub/src/registry/routes.ts:1533-1566` | `apps/hub/test/portfolio-relations.test.ts:88-105` — asserts exact outbound/inbound row shape via `toEqual` | OK |
| PORT-02 | Type outside closed set → 422 | `RELATION_TYPES` check, `portfolio.ts:6,31`; `routes.ts:1548-1549` | `portfolio-relations.test.ts:107-113` — asserts `422` + `title: "invalid_relation_type"` | OK |
| PORT-03 | Nonexistent/other-org target → 404 | `portfolio.ts:34-36`; `routes.ts:1552-1553` | `portfolio-relations.test.ts:115-126` (unknown target + other-org target, both 404) | OK |
| PORT-04 | Idempotent replay, no dup row | `on conflict … do nothing` `portfolio.ts:38-58` | `portfolio-relations.test.ts:135-148` — same `relationId` returned + `count(*) = 1` in DB | OK |
| PORT-05 | Dashboard exact counts per composition member | `getPortfolioDashboard` `portfolio.ts:100-130`; route `routes.ts:1568-1575` | `portfolio-dashboard.test.ts:119-139` — drives real proposal/decision/experiment lifecycle (including starting an experiment moving its proposal to `executing` so it correctly drops out of `openProposalsCount`) and asserts exact counts via `toEqual` | OK — genuinely exercises the "does starting an experiment move it out of the open count" question the task flagged |
| PORT-06 | Dashboard unknown project → 404 | `requireOwnedProject` 404-first, `routes.ts:1572` | `portfolio-dashboard.test.ts:148-151` | OK |
| PORT-07 | Empty composition list → `[]` not error | `portfolio.ts:106-108` | `portfolio-dashboard.test.ts:141-146` | OK |
| PORT-08 | Campaign creation persists waves+items pending, in order | `createCampaign` `portfolio.ts:147-189` | `portfolio-campaigns.test.ts:88-124` — exact `toEqual` of the full campaign incl. wave seq/item status | OK |
| PORT-09 | Invalid wave/target → 422/404, nothing persisted | Pre-tx validation `portfolio.ts:153-163`; all-or-nothing via `withTx` `portfolio.ts:165-188` | `portfolio-campaigns.test.ts:126-171` — **all four negative cases use a single wave** (empty wave is the 2nd of 2 waves, but the invalid-target cases are single-wave only) | **GAP** — see Sensor M10 below: target validation across wave 2+ is unverified |
| PORT-10 | Complete wave-1 item (no gate) | `completeItem` `portfolio.ts:307-336` | `portfolio-campaign-items.test.ts:98-107` | OK |
| PORT-11 | Wave N+1 blocked while wave N pending → 409 | `isPriorWaveResolved` `portfolio.ts:281-293` (checks `cw.seq < $2`, i.e. ALL prior waves) | `portfolio-campaign-items.test.ts:136-146` — **only ever a 2-wave campaign** | **GAP** — see Sensor M1 below: the "ALL prior waves" behavior vs. "just N-1" is unverified |
| PORT-12 | Wave N+1 unlocked once wave N resolved | `portfolio.ts:327` | `portfolio-campaign-items.test.ts:148-159` (2 waves) | OK for 2 waves; same M1 gap for N≥3 |
| PORT-13 | Exception w/ justification → `exempted`, persisted | `grantException` `portfolio.ts:350-375` | `portfolio-campaign-items.test.ts:172-184` — asserts response + DB row `exception_reason` | OK |
| PORT-14 | Exception w/o justification → 422 | `portfolio.ts:357-359` (`!justification \|\| .trim().length === 0`) | `portfolio-campaign-items.test.ts:161-170` — only tests **missing** justification (`{}`), never whitespace-only | **GAP** — see Sensor M9 below |
| PORT-15 | Mixed completed+exempted resolves wave | same gate, shared by both routes | `portfolio-campaign-items.test.ts:186-202` | OK |
| PORT-16 | Progress = exactly `{projectId, wave, status}`, no rank/score | `getCampaignProgress` `portfolio.ts:388-408`, hand-picks only those 3 columns | `portfolio-progress.test.ts:66-80` — `toEqual` (exact shape, not `toHaveProperty`) | OK — confirmed no rank/score field exists anywhere in the route handler or SQL |
| PORT-17 | Unknown/other-portfolio campaign progress → 404 | `portfolio.ts:393-397` | `portfolio-progress.test.ts:82-96` — includes **both** unknown-id AND same-org-wrong-portfolio cases | OK — this is the one route with full 404-scoping coverage |
| PORT-18 | Export: finding + waves/items + linked proposal's decisions | `exportCampaign` `portfolio.ts:452-476`; `getProposalDecisions` (`subject_type='proposal' and subject_id=$1`) `portfolio.ts:423-431` | `portfolio-export.test.ts:115-161` — exact `toEqual` incl. decision row | OK, but see Sensor M8a: the `subject_type='proposal'` half of the filter is untested in isolation (low severity, see below) |
| PORT-19 | Export of another-org campaign → 404 (spec text) / 403 (actual, via standard cross-tenant flow) | `routes.ts:1682` `requireOwnedProject` (403 for real cross-org access); `exportCampaign` returns `null`→404 only for same-org-wrong-portfolio/nonexistent | `portfolio-export.test.ts:179-190` asserts `403` for cross-tenant (consistent with spec.md's own Edge Cases: "any route cross-tenant → 403"); no dedicated same-org-wrong-portfolio 404 test for export/GET-campaign (progress has one, export/get-campaign don't) | **Minor spec-wording note**, not a functional gap — see below |

**Edge cases (spec.md "Edge Cases" section):**
- Cross-tenant 403 on every new route: tested per-route in every `*.test.ts` file ("is denied cross-tenant" cases) — OK, exhaustive.
- Already-terminal item re-`complete`/re-`exception` → 409: `portfolio-campaign-items.test.ts:204-218` — OK, tests both directions.
- Self-relation → 422: `portfolio-relations.test.ts:128-133` — OK.
- Zero-activity member shows 0s, not omitted: `portfolio-dashboard.test.ts:153-162` — OK.

---

## 2. Discrimination sensor (mutation testing)

**Scratch location**: `git worktree add --detach /tmp/verify-slice8-scratch HEAD` at commit `09291e2e67009ea41f69af451a088b9219488c6f` (detached worktree, `node_modules` symlinked from the real tree, no npm install). Postgres already running at `127.0.0.1:55432` (`scripts/dev-db.sh`). Baseline: all 39 tests across the 7 `portfolio-*.test.ts` files passed before any mutation. Each mutation was applied to `apps/hub/src/evolution/portfolio.ts` in the scratch copy only, the relevant test file(s) run via `vitest run`, then reverted via `cp` from a saved original before the next mutation. Worktree removed and scratch directory deleted at the end; real tree confirmed clean (`git status --porcelain` and `git diff` both empty post-cleanup).

**Sensor tally**: 11 mutations attempted, 7 killed, 4 survived (1 of the 4 low-severity).

| # | Mutation | Location | Killed / Survived | Evidence |
| - | -------- | -------- | ------------------ | -------- |
| M1 | `isPriorWaveResolved`: `cw.seq < $2` → `cw.seq = $2 - 1` (checks only the immediately-preceding wave, not all prior waves) | `portfolio.ts:289` | **SURVIVED** | All of `portfolio-campaign-items.test.ts`, `portfolio-campaigns.test.ts`, `portfolio-progress.test.ts`, `portfolio-export.test.ts` (25 tests) passed unchanged. Confirmed exploitable: with 3 waves where wave 1 is still pending but wave 2 is already resolved, the mutant would incorrectly unlock wave 3 — no test constructs ≥3 waves anywhere in the suite. |
| M2 | Dashboard `rejectedDecisionsCount` query: `decision = 'reject'` → `decision = 'approve'` | `portfolio.ts:115-117` | Killed | `portfolio-dashboard.test.ts:133` fails (`rejectedDecisionsCount` off by 1) |
| M3 | Dashboard `openProposalsCount`: drop `status in ('draft','readyForReview')` filter | `portfolio.ts:112` | Killed | `portfolio-dashboard.test.ts:133` fails (counts the executing-status proposal too) |
| M4 | `completeItem` proposal check: drop `proposalRow.project_id !== item.targetProjectId` (only check existence) | `portfolio.ts:322` | Killed | `portfolio-campaign-items.test.ts:132` fails (expected 422, got 200) |
| M5 | `declareRelation`: remove self-relation check | `portfolio.ts:32` | Killed | `portfolio-relations.test.ts:131` fails (expected 422, got 201) |
| M6 | `getCampaign`: drop `portfolio_project_id = $2` filter | `portfolio.ts:218` | Killed | `portfolio-export.test.ts` (2 failures) and `portfolio-campaigns.test.ts` fail — though via a symptomatic 500 from an unrelated extra-param mismatch rather than the exact wrong-portfolio 404 assertion; see note below |
| M7 | `loadCampaignItemForUpdate`: drop `c.portfolio_project_id = $3` | `portfolio.ts:273` | Killed | `portfolio-campaign-items.test.ts` — 8/10 fail |
| M8a | `getProposalDecisions`: drop `subject_type = 'proposal'`, keep `subject_id = $1` | `portfolio.ts:426` | **SURVIVED (low severity)** | `portfolio-export.test.ts` — all 4 pass unchanged. Not practically exploitable: `subject_id` values across subject types (`hypothesis`/`artifact`/`proposal`) are independently-random UUIDs, so a real collision is not realistic — but it is a literal deviation from the query contract design.md specifies, and nothing proves the filter is doing anything. |
| M8b | `getProposalDecisions`: drop `subject_id = $1`, keep `subject_type = 'proposal'` (leaks all proposals' decisions) | `portfolio.ts:426` | Killed | `portfolio-export.test.ts:128` fails |
| M9 | `grantException`: `!input.justification \|\| input.justification.trim().length === 0` → `!input.justification` (allows whitespace-only) | `portfolio.ts:357` | **SURVIVED** | `portfolio-campaign-items.test.ts` — all 10 pass unchanged. No test ever POSTs `{ justification: "   " }`. |
| M10 | `createCampaign`: validate only `input.waves[0]` targets instead of `flatMap` over all waves | `portfolio.ts:158` | **SURVIVED** | `portfolio-campaigns.test.ts` — all 7 pass unchanged. Repro (ad hoc test, not committed): 2-wave campaign with a valid wave-1 target and a nonexistent wave-2 target returns **500** (`campaign_items_target_project_id_fkey` violation) instead of the spec-required 404 — nothing persists (rollback backstop via `withTx` still holds), but the response contract is wrong and undetected. |
| M11 | `completeItem`: reorder gate check before proposal-reference validation (no tx-boundary change) | `portfolio.ts:319-328` | Survived, not counted as a gap | Purely an error-precedence ambiguity when both conditions apply simultaneously; spec doesn't define precedence between `invalid_proposal_reference` and `wave_not_resolved`. Not pursued further — low value, not a real behavior-changing mutant relative to any spec-defined outcome. |

Note on M6/M7: both were killed, but via a 500 status code triggered by an unrelated side effect (the mutated SQL still receives an unused extra bind parameter, and in one case a downstream `undefined` property read) rather than by an assertion that specifically targets the "wrong portfolio, same org" 404 contract. Only `portfolio-progress.test.ts:88-96` has a purpose-built same-org-wrong-portfolio test; `portfolio-campaigns.test.ts` (GET `/campaigns/:id`) and `portfolio-export.test.ts` do not. This is a secondary, low-priority coverage note — the underlying SQL in `getCampaign`/`exportCampaign` is correctly scoped, and M6 does fail the suite regardless of the precise mechanism.

---

## 3. Diff range / scratch location

- Real tree: `/home/user/evolution-os`, commit `09291e2e67009ea41f69af451a088b9219488c6f`, branch `claude/docs-roadmap-ecosystem-fklxt7` — untouched (`git status --porcelain` and `git diff` empty both before and after this verification).
- Scratch: `git worktree add --detach /tmp/verify-slice8-scratch HEAD`, `node_modules` symlinked from the real tree (no reinstall), removed via `git worktree remove --force` + `rm -rf` at the end of the session.

---

## 4. Ranked gap list

1. **[HIGH] No test ever builds a 3+-wave campaign.** The wave gate (`isPriorWaveResolved`, `portfolio.ts:281-293`) is implemented correctly — it checks `cw.seq < $2`, i.e. every prior wave, not just the immediately-preceding one — but this is the one property the entire test suite cannot distinguish from a broken "only checks wave N-1" implementation (Sensor M1). Given this is literally the "coração do slice" (design.md line 87) and Success Criteria explicitly claims "Nenhuma wave avança enquanto a anterior tiver algum item pending" for the general N-wave case, this is the most severe gap. **Fix**: add a 3-wave test to `portfolio-campaign-items.test.ts` that resolves wave 1, leaves wave 2 pending, and asserts completing a wave-3 item still 409s with `wave_not_resolved` — then resolves wave 2 and asserts wave 3 unlocks.

2. **[MEDIUM] `createCampaign` target validation is only tested for single-wave invalid-target scenarios** (Sensor M10). A regression that validates only the first wave's targets survives undetected, and demonstrably degrades PORT-09's 404 contract to an unhandled 500 (data integrity is still preserved by the FK constraint + `withTx` rollback, but the API contract breaks silently). **Fix**: add a 2-wave case to `portfolio-campaigns.test.ts` where wave 1's target is valid and wave 2's target is invalid (unknown or other-org), asserting 404/422 and that nothing persists.

3. **[MEDIUM] Whitespace-only justification is untested** (Sensor M9). `grantException`'s `.trim().length === 0` guard is real and correct, but nothing proves it — a regression to a bare falsy check survives. **Fix**: add a case to `portfolio-campaign-items.test.ts` posting `{ justification: "   " }` and asserting 422 `justification_required`.

4. **[LOW] `getProposalDecisions`'s `subject_type = 'proposal'` filter has no isolated test** (Sensor M8a). Not practically exploitable given independent UUID namespaces per subject type, but it's an untested half of the documented query contract. **Fix (optional)**: low priority; could add a decision on an unrelated subject_type in the export test fixture to prove it's excluded, if the team wants full defense-in-depth coverage.

5. **[LOW / informational] `portfolio-campaigns.test.ts` (GET `/campaigns/:id`) and `portfolio-export.test.ts` lack a dedicated same-org-wrong-portfolio 404 test** (only `portfolio-progress.test.ts:88-96` has one). The underlying SQL is correctly scoped in all three read paths (confirmed by M6), so this is a coverage-symmetry note rather than a functional gap.

6. **[INFORMATIONAL] PORT-19's AC wording** ("campaign belonging to another org → 404") doesn't literally match the actual/tested behavior for true cross-org access (403, via the standard `requireOwnedProject` cross-tenant path that spec.md's own Edge Cases section mandates for every route in this slice). Not a functional defect — the two rules (Edge Cases 403 vs. the individual AC's 404 wording) are reconciled by treating "another org" loosely, the same way PORT-06/17's "unknown project" 404s are; flagged only because a literal reading of PORT-19 in isolation would suggest 404 is expected where 403 actually fires.
