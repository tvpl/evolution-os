# Validation Report — Slice 8 Portfolio Campaign

- **Result**: FAIL

**Round 2 (final)** — supersedes round 1 entirely. **What changed since round 1**: all 4 round-1 gaps (3-wave gate coverage, multi-wave target validation, whitespace-only justification, `subject_type` filter isolation) were fixed in commit `a9aaa98` and are independently re-confirmed closed below (each mutation re-applied in an isolated scratch copy and shown to now fail the suite). A fresh round-2 discrimination pass found **one new HIGH-severity gap** the round-1 sensor never probed — `getPortfolioDashboard` aggregates by ALL relation types, not just `composition`, and no test ever declares a non-`composition` relation to prove it's excluded — plus one LOW/informational ordering-robustness note. Net result stays **FAIL** on a different, narrower gap than round 1.

**Verifier**: independent re-derivation from `spec.md`/`design.md`/`tasks.md` against the current code and tests, with a real test run (not trusting round 1's reported count) and two discrimination-sensor passes — one re-applying round 1's exact 4 mutations to confirm the fixes, one running fresh round-2 mutations against branches round 1 never targeted. No code was fixed; this report only verifies.

**Scope read in full**: `spec.md`, `design.md`, `tasks.md`, `apps/hub/src/evolution/portfolio.ts` (current, post-fix), the portfolio routes in `apps/hub/src/registry/routes.ts` (lines 1533-1688), and all seven `apps/hub/test/portfolio-*.test.ts` files (current, post-fix, all read in full).

**Test run**: `pnpm --filter @evolution-os/hub test:int` — **65 test files, 412 tests, all passed** (54.1s). Matches the round-1-reported baseline count.

---

## 1. Per-requirement evidence (PORT-01..19)

| Req | AC (short) | Implementation | Test | Verdict |
| --- | --- | --- | --- | --- |
| PORT-01 | Declare relation in closed set, listable both directions | `declareRelation` `portfolio.ts:25-59`; `listRelations:74-86`; route `routes.ts:1533-1557` | `portfolio-relations.test.ts:88-105` — exact outbound/inbound row via `toEqual` | OK |
| PORT-02 | Type outside closed set → 422 | `RELATION_TYPES` check `portfolio.ts:6,31`; `routes.ts:1548-1549` | `portfolio-relations.test.ts:107-113` — 422 + `invalid_relation_type` | OK (re-checked fresh this round) |
| PORT-03 | Nonexistent/other-org target → 404 | `portfolio.ts:34-36`; `routes.ts:1552-1553` | `portfolio-relations.test.ts:115-126` | OK |
| PORT-04 | Idempotent replay, no dup row | `on conflict … do nothing` `portfolio.ts:38-58` | `portfolio-relations.test.ts:135-148` — same `relationId` + `count(*)=1` | OK (re-checked fresh this round) |
| PORT-05 | Dashboard exact counts per `composition` member | `getPortfolioDashboard` `portfolio.ts:100-130`; route `routes.ts:1568-1575` | `portfolio-dashboard.test.ts:119-139` | **PARTIAL — see Sensor N1**: implementation correctly filters `type = 'composition'` (`portfolio.ts:103`), but no test ever proves a non-`composition` relation (`dependency`/`ownership`/etc.) is *excluded* — a regression that aggregates all relation types survives undetected |
| PORT-06 | Dashboard unknown project → 404 | `requireOwnedProject` `routes.ts:1572` | `portfolio-dashboard.test.ts:148-151` | OK |
| PORT-07 | Empty composition list → `[]` | `portfolio.ts:106-108` | `portfolio-dashboard.test.ts:141-146` | OK (re-checked fresh this round) |
| PORT-08 | Campaign creation persists waves+items pending, in order | `createCampaign` `portfolio.ts:147-189` | `portfolio-campaigns.test.ts:88-124` — exact `toEqual` incl. wave seq/item status | OK |
| PORT-09 | Invalid wave/target → 422/404, nothing persisted | Pre-tx validation `portfolio.ts:153-163` (multi-wave `flatMap` at 158); all-or-nothing via `withTx` | `portfolio-campaigns.test.ts:126-176` — now includes a dedicated later-wave (wave 2) bad-target case (lines 163-176) | OK — round-1 gap confirmed fixed (Sensor M10 below) |
| PORT-10 | Complete wave-1 item (no gate) | `completeItem` `portfolio.ts:307-336` | `portfolio-campaign-items.test.ts:98-107` | OK |
| PORT-11 | Wave N+1 blocked while wave N pending → 409 | `isPriorWaveResolved` `portfolio.ts:281-293` (`cw.seq < $2`, ALL prior waves) | `portfolio-campaign-items.test.ts:161-184` — 3-wave test forces wave-2-resolved/wave-1-pending via direct SQL and confirms wave 3 still blocked | OK — round-1 gap confirmed fixed (Sensor M1 below) |
| PORT-12 | Wave N+1 unlocked once wave N resolved | `portfolio.ts:327` | `portfolio-campaign-items.test.ts:148-159`, `222-238` | OK |
| PORT-13 | Exception w/ justification → `exempted`, persisted | `grantException` `portfolio.ts:350-375` | `portfolio-campaign-items.test.ts:208-220` — response + DB row `exception_reason` | OK (re-checked fresh this round) |
| PORT-14 | Exception w/o justification → 422 | `portfolio.ts:357-359` (`!justification \|\| .trim().length === 0`) | `portfolio-campaign-items.test.ts:186-206` — both missing (`{}`) AND whitespace-only (`"   "`) cases | OK — round-1 gap confirmed fixed (Sensor M9 below) |
| PORT-15 | Mixed completed+exempted resolves wave | Same gate, shared by both routes | `portfolio-campaign-items.test.ts:222-238` | OK (re-checked fresh this round) |
| PORT-16 | Progress = exactly `{projectId, wave, status}`, no rank/score | `getCampaignProgress` `portfolio.ts:388-408` | `portfolio-progress.test.ts:66-80` — `toEqual`, exact shape | OK; ordering primacy (`cw.seq` before `ci.created_at`) is real but only provably load-bearing under an adversarial timestamp state no test constructs — see Sensor N2 (LOW/informational) |
| PORT-17 | Unknown/other-portfolio progress → 404 | `portfolio.ts:393-397` | `portfolio-progress.test.ts:82-96` | OK |
| PORT-18 | Export: finding + waves/items + linked proposal's decisions | `exportCampaign` `portfolio.ts:452-476`; `getProposalDecisions` (`subject_type='proposal' and subject_id=$1`) `portfolio.ts:423-431` | `portfolio-export.test.ts:115-196` — exact `toEqual` incl. decisions, plus dedicated same-`subject_id`/different-`subject_type` exclusion test (173-196) | OK — round-1 gap confirmed fixed (Sensor M8a below) |
| PORT-19 | Export of another-org campaign → 404 (spec text) / 403 (actual) | `routes.ts:1682` `requireOwnedProject` — unknown project 404, cross-org project 403 (`routes.ts:97-115`); `exportCampaign` returns `null`→404 only for same-org-wrong-portfolio/nonexistent | `portfolio-export.test.ts:204-225` — same-org-wrong-portfolio 404 (204-212) AND cross-tenant 403 (214-225), both covered | **Informational only** (re-confirmed, not a functional defect) — see note below |

**Edge cases (spec.md "Edge Cases")**: cross-tenant 403 on every route (all seven test files, "is denied cross-tenant" cases) — OK; terminal-item re-transition → 409 (`portfolio-campaign-items.test.ts:240-254`) — OK; self-relation → 422 (`portfolio-relations.test.ts:128-133`) — OK; zero-activity member shows 0s (`portfolio-dashboard.test.ts:153-162`) — OK.

**PORT-19 wording note (re-confirmed from round 1, unchanged)**: spec text says "another org → 404"; actual/tested behavior is 403 via the standard cross-tenant `requireOwnedProject` path (`routes.ts:101-115`), consistent with spec.md's own Edge Cases section ("any route cross-tenant → 403"). Not a functional defect — informational only.

---

## 2. Discrimination sensor (mutation testing)

**Scratch method**: `cp -r /home/user/evolution-os /tmp/verify-slice8-round2-scratch` (plain directory copy, `node_modules` included, no reinstall). Postgres already running at `127.0.0.1:55432` (`scripts/dev-db.sh start`). Each mutation applied to `apps/hub/src/evolution/portfolio.ts` in the scratch copy only via `sed`, the relevant test file(s) run via `pnpm vitest run`, then reverted from a saved original (`diff`-verified identical) before the next mutation. Scratch directory deleted at the end; real tree confirmed clean (`git status --porcelain` and `git diff --stat` both empty, verified in this session after cleanup).

### 2a. Round-1 gap re-confirmation (the 4 fixed mutations, re-applied)

| # | Mutation | Location | Result | Evidence |
| - | -------- | -------- | ------ | -------- |
| M1 | `isPriorWaveResolved`: `cw.seq < $2` → `cw.seq = $2 - 1` (only immediately-preceding wave) | `portfolio.ts:289` | **Now KILLED** | `portfolio-campaign-items.test.ts` "blocks wave 3 while wave 1 is still pending…" fails: `expected 200 to be 409` |
| M9 | `grantException`: `!input.justification \|\| .trim().length === 0` → `!input.justification` | `portfolio.ts:357` | **Now KILLED** | `portfolio-campaign-items.test.ts` "rejects an exception with a whitespace-only justification…" fails: `expected 200 to be 422` |
| M10 | `createCampaign`: validate only `input.waves[0]` targets instead of `flatMap` over all waves | `portfolio.ts:158` | **Now KILLED** | `portfolio-campaigns.test.ts` "rejects creation with an invalid target in a LATER wave…" fails: `expected 500 to be 404` |
| M8a | `getProposalDecisions`: drop `subject_type = 'proposal'`, keep only `subject_id = $1` | `portfolio.ts:426` | **Now KILLED** | `portfolio-export.test.ts` "never includes a decision recorded under the same subject_id but a different subject_type" fails: expected length 1, got 2 |

**All 4 round-1 gaps are genuinely closed.** Each mutation now produces a concrete, correctly-targeted test failure.

### 2b. Round-2 fresh mutations (new sensors, not run in round 1)

**Sensor tally**: 6 mutations/checks attempted, 3 killed, 1 survived (new gap), 1 survived-but-low-severity (only killed by an adversarial constructed test, not the existing suite), 1 inconclusive.

| # | Mutation/check | Location | Result | Evidence |
| - | --------------- | -------- | ------ | -------- |
| N1 | `getPortfolioDashboard`: drop `and type = 'composition'` from the members query (aggregate ALL relation types, not just `composition`) | `portfolio.ts:103` | **SURVIVED — new gap** | All 5 `portfolio-dashboard.test.ts` tests passed unchanged. Built an ad hoc repro: declare a plain `dependency` relation (not `composition`) from a portfolio to a target project, call the dashboard — baseline correctly returns `members: []`; the mutant returns the `dependency` target as a full dashboard member (with its counts). Fully reachable via the ordinary public API, no bypass needed. |
| N2 | `getCampaignProgress`: `order by cw.seq, ci.created_at` → `order by ci.created_at` (drop wave-seq primacy) | `portfolio.ts:404` | **SURVIVED against the real suite; LOW severity** | `portfolio-progress.test.ts` (4 tests) passed unchanged, because normal campaign creation always inserts wave-1 items before wave-2 items, so `created_at` order coincides with wave order in every reachable state. Built an adversarial ad hoc test that directly SQL-updates a wave-1 item's `created_at` to be 1 hour later than a wave-2 item's (a state the API cannot itself produce): baseline still returns wave order `[1, 2]` (proving `cw.seq` primacy really is load-bearing); the mutant returns `[2, 1]`. Not exploitable through the API alone — informational, same tier as round 1's M8a. |
| N3 | `getPortfolioDashboard`'s `runningExperimentsCount` filter: `status = 'running'` → `status = 'completed'` | `portfolio.ts:118` | Killed | `portfolio-dashboard.test.ts` aggregate-counts test fails: `runningExperimentsCount` expected 1, got 0 |
| N4 | `completeItem`'s row lock: drop `for update` from `loadCampaignItemForUpdate`'s query | `portfolio.ts:274` | **Inconclusive — not a confirmed gap** | Built a concurrency test firing two simultaneous `complete` requests at the same item via `Promise.all`, expecting exactly one 200 + one 409. It passed identically with and without `for update` across 5 runs each way — Node's event-loop scheduling in this harness (via `app.inject`, in-process, no real network hop) appears to serialize the two transactions' first queries closely enough that the race window this lock exists to close never actually opens at the HTTP-inject level. Code inspection confirms `for update` is present (`portfolio.ts:274`) — the correct pattern — but I could not construct a test in this pass that reliably discriminates its removal without deeper instrumentation (e.g. two raw `pg` clients with an injected mid-transaction pause). Not counted as a gap; flagged as a residual verification limitation for a future round if the team wants a true concurrency guarantee tested. |
| N5 | `declareRelation`'s final `relationId` (return the freshly-generated `id` instead of re-selecting the persisted row) | `portfolio.ts:57` | Not a useful discriminator (equivalent mutant for the reachable path) | The pre-insert `existingRow` check (`portfolio.ts:43-44`) already short-circuits every *sequential* replay before this line is ever reached on a second call, so no sequential idempotency test can touch this line. Only a true concurrent double-declare race would exercise it, and constructing that race reliably has the same scheduling problem as N4. Not pursued further; low value relative to effort. |
| N6 (spot check, not a mutation) | `getCampaign`'s items-by-wave grouping for a wave with zero items | `portfolio.ts:234-251` | **Confirmed correct** | Directly inserted a wave row via SQL with no items (an edge case the API itself cannot produce — every wave must be non-empty at creation). `GET .../campaigns/:id` returned the wave with `items: []`, never omitted it and never crashed. No code change needed; matches `?? []` fallback at `portfolio.ts:250`. |

---

## 3. Scratch location / cleanup

- Real tree: `/home/user/evolution-os`, branch `claude/docs-roadmap-ecosystem-fklxt7` — untouched throughout. `git status --porcelain` and `git diff --stat` both confirmed empty in this session, after scratch deletion and before writing this report.
- Scratch: `/tmp/verify-slice8-round2-scratch` (plain `cp -r`, not a git worktree this round), deleted via `rm -rf` at the end.

---

## 4. Ranked gap list

1. **[HIGH] `getPortfolioDashboard` aggregates by relation existence, not specifically `type = 'composition'` — but nothing proves it.** The implementation is correct (`portfolio.ts:103` does filter `and type = 'composition'`), but Sensor N1 shows the entire test suite cannot distinguish it from a regression that aggregates every relation type (`dependency`, `implementation`, `ownership`, `influence`) into the dashboard. This directly violates PORT-05's AC ("every project linked to it by a `composition` relation") and, unlike round 1's HIGH finding, is reachable through the ordinary public API with **no bypass or contrived state required** — just declaring one non-`composition` relation. A regression here would leak a non-member project's open-proposals/rejected-decisions/running-experiments counts into a portfolio owner's dashboard. **Fix**: add a case to `portfolio-dashboard.test.ts` that declares a `dependency` (or any non-`composition`) relation from the portfolio to a project with real activity (an open proposal, say) and asserts the dashboard's `members` array is `[]` / does not include that project.

2. **[LOW / informational] `getCampaignProgress`'s `order by cw.seq, ci.created_at` has no test proving `cw.seq` is the primary sort key** (Sensor N2). Not exploitable through the API alone (normal campaign creation always keeps `created_at` order aligned with wave order), but a regression that drops `cw.seq` from the `ORDER BY` would survive undetected and could show wave-inverted progress under clock skew or future creation-path changes. **Fix (optional)**: low priority; could add a test that manipulates `created_at` directly to prove wave-seq primacy, if the team wants defense-in-depth here.

3. **[INFORMATIONAL, unchanged from round 1] PORT-19's AC wording** ("campaign belonging to another org → 404") doesn't literally match tested behavior for true cross-org access (403, via the standard cross-tenant `requireOwnedProject` path mandated by spec.md's own Edge Cases section). Not a functional defect.

4. **[INFORMATIONAL] `completeItem`'s `FOR UPDATE` row lock (Sensor N4) could not be conclusively discriminated in this pass.** The code has the correct lock in place; the verification method (concurrent `app.inject` calls) was not able to reliably force the race window open in this in-process test harness. This is a verification-method limitation, not an established defect — flagged for a future round with true multi-connection instrumentation if the team wants a proven concurrency guarantee rather than a correct-by-inspection one.
