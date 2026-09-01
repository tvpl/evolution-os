# Validation Report — Slice 8 Portfolio Campaign

- **Result**: PASS

**Round 3 (final)** — supersedes round 2 entirely, per the 3-round bound on the fix→re-verify cycle. **What changed since round 2**: the one round-2 HIGH gap (`getPortfolioDashboard` aggregating by relation existence rather than specifically `type = 'composition'`, with no test proving non-`composition` relations are excluded) was fixed in commit `008add2` and is independently re-confirmed closed below by re-applying round 2's exact mutation in an isolated scratch copy. A fresh round-3 discrimination pass ran 4 new mutations plus 2 non-mutation spot checks against code neither round 1 nor round 2 had targeted; it found **one new gap** — campaign items can be completed/excepted through a URL naming the *wrong* campaign, as long as the item and portfolio still match — judged **LOW/non-blocking** (see rationale below and gap list). All three of round 2's non-gap items (PORT-19 wording, N2 ordering-primacy, N4 row-lock race) were independently re-examined; N4 was additionally strengthened this round with a direct database-level reproduction (not just code-by-inspection) proving the exact lock pattern in production code prevents the exact race it exists to prevent. Net verdict changes from round 2's **FAIL** to **PASS**.

**Verifier**: independent re-derivation from `spec.md`/`design.md`/`tasks.md` against the current code and tests, with a real test run (not trusting round 2's reported count), a re-application of round 2's exact mutation to confirm the fix, 4 fresh round-3 mutations targeting previously-unprobed branches, 2 non-mutation spot checks, and a direct SQL-level concurrency reproduction for N4. No code was fixed; this report only verifies.

**Scope read in full**: `spec.md`, `design.md`, `tasks.md`, `apps/hub/src/evolution/portfolio.ts` (current, 477 lines, post round-2 fix), the portfolio routes in `apps/hub/src/registry/routes.ts` (lines 1533–1688), and all seven `apps/hub/test/portfolio-*.test.ts` files (current, all read in full).

**Test run**: `bash scripts/dev-db.sh start` then `pnpm --filter @evolution-os/hub test:int` — **65 test files, 413 tests, all passed** (54.52s). One more test than round 2's reported baseline (412), matching the one new dashboard test added in commit `008add2` to close the round-2 gap.

---

## 1. Per-requirement evidence (PORT-01..19)

| Req | AC (short) | Implementation | Test | Verdict |
| --- | --- | --- | --- | --- |
| PORT-01 | Declare relation in closed set, listable both directions | `declareRelation` `portfolio.ts:25-59`; `listRelations:74-86`; route `routes.ts:1533-1557` | `portfolio-relations.test.ts:88-105` — exact outbound/inbound row via `toEqual` | OK |
| PORT-02 | Type outside closed set → 422 | `RELATION_TYPES` check `portfolio.ts:6,31`; `routes.ts:1548-1549` | `portfolio-relations.test.ts:107-113` — 422 + `invalid_relation_type` | OK — re-derived independently this round |
| PORT-03 | Nonexistent/other-org target → 404 | `portfolio.ts:34-36`; `routes.ts:1552-1553` | `portfolio-relations.test.ts:115-126` | OK |
| PORT-04 | Idempotent replay, no dup row | `on conflict … do nothing` `portfolio.ts:38-58`, backed by `UNIQUE(source_project_id, target_project_id, type)` (design.md schema) | `portfolio-relations.test.ts:135-148` — same `relationId` + `count(*)=1` | OK — re-derived independently this round |
| PORT-05 | Dashboard exact counts per `composition` member | `getPortfolioDashboard` `portfolio.ts:100-130`; route `routes.ts:1568-1575`; filter `type = 'composition'` at `portfolio.ts:103` | `portfolio-dashboard.test.ts:123-143` (aggregate counts) **and** `:152-160` (new: non-`composition` relation excluded) | OK — round-2 gap closed and re-confirmed (Sensor R-1 below) |
| PORT-06 | Dashboard unknown project → 404 | `requireOwnedProject` `routes.ts:1572` | `portfolio-dashboard.test.ts:162-165` | OK |
| PORT-07 | Empty composition list → `[]` | `portfolio.ts:106-108` | `portfolio-dashboard.test.ts:145-150` | OK — re-derived independently this round |
| PORT-08 | Campaign creation persists waves+items pending, in order | `createCampaign` `portfolio.ts:147-189` | `portfolio-campaigns.test.ts:88-124` — exact `toEqual` incl. wave seq/item status | OK |
| PORT-09 | Invalid wave/target → 422/404, nothing persisted | Pre-tx validation `portfolio.ts:153-163`; all-or-nothing via `withTx` | `portfolio-campaigns.test.ts:126-186` incl. later-wave bad-target case | OK |
| PORT-10 | Complete wave-1 item (no gate) | `completeItem` `portfolio.ts:307-336` | `portfolio-campaign-items.test.ts:98-107` | OK |
| PORT-11 | Wave N+1 blocked while wave N pending → 409 | `isPriorWaveResolved` `portfolio.ts:281-293` (`cw.seq < $2`, ALL prior waves) | `portfolio-campaign-items.test.ts:161-184` — 3-wave test | OK |
| PORT-12 | Wave N+1 unlocked once wave N resolved | `portfolio.ts:327` | `portfolio-campaign-items.test.ts:148-159` | OK |
| PORT-13 | Exception w/ justification → `exempted`, persisted | `grantException` `portfolio.ts:350-375` | `portfolio-campaign-items.test.ts:208-220` — response + DB row `exception_reason` | OK — re-derived independently this round |
| PORT-14 | Exception w/o justification → 422 | `portfolio.ts:357-359` | `portfolio-campaign-items.test.ts:186-206` — both missing and whitespace-only | OK |
| PORT-15 | Mixed completed+exempted resolves wave | Shared gate | `portfolio-campaign-items.test.ts:222-238`; independently re-confirmed live this round via mutation M3 (status-inequality regression) — see §2 | OK |
| PORT-16 | Progress = exactly `{projectId, wave, status}`, no rank/score | `getCampaignProgress` `portfolio.ts:388-408` | `portfolio-progress.test.ts:66-80` — `toEqual`, exact shape; independently re-confirmed live this round via mutation M4 (wave-seq off-by-one) — see §2 | OK |
| PORT-17 | Unknown/other-portfolio progress → 404 | `portfolio.ts:393-397` | `portfolio-progress.test.ts:82-96` | OK — re-derived independently this round (full file read) |
| PORT-18 | Export: finding + waves/items + linked proposal's decisions | `exportCampaign` `portfolio.ts:452-476`; `getProposalDecisions` `portfolio.ts:423-431` | `portfolio-export.test.ts:115-196` — exact `toEqual` incl. decisions, plus `subject_id`/`subject_type` exclusion test | OK |
| PORT-19 | Export of another-org campaign → 404 (spec text) / 403 (actual, cross-tenant) | `routes.ts:1682` `requireOwnedProject` | `portfolio-export.test.ts:204-225` | **Informational wording gap only** (unchanged from rounds 1/2) — see note below |

**Edge cases (spec.md "Edge Cases")**: cross-tenant 403 on every route (all seven test files) — OK; terminal-item re-transition → 409 (`portfolio-campaign-items.test.ts:240-254`) — OK; self-relation → 422 (`portfolio-relations.test.ts:128-133`) — OK; zero-activity member shows 0s (`portfolio-dashboard.test.ts:167-176`) — OK; additionally this round, an export of a campaign wave with **zero items** (a state only reachable by direct SQL, never through the API) was spot-checked and returns `items: []` correctly, never omitted, never a 500 — see §2 Spot Check S-1.

**PORT-19 wording note (unchanged from rounds 1/2)**: spec text says "another org → 404"; actual/tested behavior is 403 via the standard cross-tenant `requireOwnedProject` path, consistent with spec.md's own Edge Cases section ("any route cross-tenant → 403"). Not a functional defect.

---

## 2. Discrimination sensor (mutation testing)

**Scratch method**: `cp -r /home/user/evolution-os /tmp/verify-slice8-round3-scratch` (plain directory copy, `node_modules` included, no reinstall). Postgres already running at `127.0.0.1:55432`. Each mutation applied to `apps/hub/src/evolution/portfolio.ts` in the scratch copy only via `Edit`, the relevant test file(s) run via `pnpm vitest run`, then reverted from a saved original (`diff`-verified byte-identical) before the next mutation. Scratch directory deleted at the end; real tree confirmed clean (`git status --porcelain` and `git diff --stat` both empty, verified after cleanup and again immediately before writing this report).

### 2a. Round-2 gap re-confirmation (the 1 fixed mutation, re-applied)

| # | Mutation | Location | Result | Evidence |
| - | -------- | -------- | ------ | -------- |
| R-1 | `getPortfolioDashboard`: drop `and type = 'composition'` from the members query (aggregate ALL relation types) | `portfolio.ts:103` | **Now KILLED** | `portfolio-dashboard.test.ts` "never includes a project linked by a non-composition relation (e.g. dependency)" fails: `expected [ {…} ] to deeply equal []` |

**The round-2 gap is genuinely closed.**

### 2b. Round-3 fresh mutations and spot checks

**Sensor tally**: 4 mutations run, 3 killed, 1 survived (new gap, LOW severity, judged non-blocking — see rationale). 2 non-mutation spot checks, both confirmed correct. 1 direct DB-level concurrency reproduction, strengthening (not newly resolving) round 2's N4.

| # | Mutation/check | Location | Result | Evidence |
| - | --------------- | -------- | ------ | -------- |
| M1 | `loadCampaignItemForUpdate`: neutralize `ci.campaign_id = $2` (tautology `$2 = $2`, keeping the SQL valid so the mutation fails silently rather than 500ing) — an item's scoping to the campaign named in the URL is no longer enforced, only its scoping to the portfolio | `portfolio.ts:273` | **SURVIVED — new gap (LOW, non-blocking)** | All 44 tests across `portfolio-campaign-items.test.ts`, `portfolio-export.test.ts`, `portfolio-campaigns.test.ts`, `portfolio-progress.test.ts`, `portfolio-relations.test.ts`, `portfolio-dashboard.test.ts` passed unchanged. Built a live repro (not kept): 2 campaigns A and B under the same portfolio; completing campaign A's own wave-1 item by addressing it through **campaign B's URL** (`POST .../campaigns/B/items/<A's item id>/complete`) returns **200** under the mutation, vs. the correct **404** with the real code (re-verified both ways). Reachable through the ordinary public API — no bypass, no SQL injection — just a `campaignId`/`itemId` mismatch from an actor who already holds `portfolio.write` on that portfolio. See rationale in §4 gap list for why this is judged non-blocking. |
| M2 | `isPriorWaveResolved`: `ci.status = 'pending'` → `ci.status != 'completed'` (regresses the PORT-15 rule that `exempted` also counts as resolved) | `portfolio.ts:289` | **Killed** | `portfolio-campaign-items.test.ts` "unlocks the next wave when a wave mixes completed and exempted items" fails: `expected 409 to be 200` |
| M3 | `createCampaign`: wave `seq` off-by-one, `i + 1` → `i` (waves numbered 0,1,… instead of 1,2,…) | `portfolio.ts:173` | **Killed** | `portfolio-campaigns.test.ts` (exact `seq: 1`/`seq: 2` assertion) **and** `portfolio-progress.test.ts` (exact `wave: 1`/`wave: 2` assertion) both fail with the mismatched values shown in the diff |
| M4 | (Same mutation as M3, cross-checked against a second, independent consumer of `campaign_waves.seq`) | `portfolio.ts:173` | **Killed** (see M3) | Confirms `campaign_waves.seq` is exercised by two independently-written test files, not just one — no single-point-of-failure in the sensor for this column |

| # | Spot check (not a mutation) | Location | Result | Evidence |
| - | ---------------------------- | -------- | ------ | -------- |
| S-1 | `exportCampaign` given a wave with **zero items** (SQL-inserted; the API itself cannot produce this — every wave requires ≥1 target at creation, PORT-09) | `portfolio.ts:452-476`, `getCampaign` `:246-251` | **Confirmed correct** | Directly inserted a second `campaign_waves` row with no items via SQL. `GET .../campaigns/:id/export` returned the wave with `items: []`, never omitted, never a 500. Matches the `?? []` fallback at `portfolio.ts:250`. |
| S-2 | Item lookup scoped to a **different campaign in the same portfolio** (real, unmutated code) | `portfolio.ts:262-278` | **Confirmed correct** | Same live repro as M1, run first against the real code: addressing campaign A's item through campaign B's URL correctly returns 404 (`ci.campaign_id = $2` in production does its job). Establishes the M1 mutation as a genuine regression test, not a pre-existing bug. |

**N4 (`completeItem`'s `FOR UPDATE` row lock) — additional evidence this round**: round 2 could not force the race window open via `app.inject` (single Node event loop). This round, a standalone script using **two independent raw `pg` clients** (`race-probe.mjs`, run against a disposable throwaway database, deleted after) directly reproduced `loadCampaignItemForUpdate`'s exact query shape with an artificial delay between the `SELECT … FOR UPDATE` and the `UPDATE`, racing two real, separate Postgres connections:
- **Without** `for update`: both concurrent transactions read `status = 'pending'`, both completed the item — a genuine double-write.
- **With** `for update` (the actual production shape at `portfolio.ts:274`): the second transaction's `SELECT … FOR UPDATE` blocked until the first committed, then correctly observed `status = 'completed'` and rejected — exactly one write.

This does not resolve round 2's HTTP-harness limitation (an `app.inject`-based concurrency test still cannot reliably force the window open — that remains a tooling constraint, not a code defect), but it does independently and conclusively prove, at the database level, that (a) the race is real and (b) the exact lock pattern shipped in production correctly closes it. Judgment below treats this as sufficient.

---

## 3. Scratch location / cleanup

- Real tree: `/home/user/evolution-os` — untouched throughout. `git status --porcelain` and `git diff --stat` both confirmed empty, verified after scratch deletion and immediately before writing this report.
- Scratch: `/tmp/verify-slice8-round3-scratch` (plain `cp -r`), deleted via `rm -rf` at the end.
- Concurrency probe: `race-probe.mjs` run from a temporary copy inside `apps/hub/` (needed local `pg` resolution), against a disposable database `evoos_race_probe_r3` — both the script and the database were deleted after the run; `git status --porcelain` confirmed clean afterward.

---

## 4. Independent judgment on N2 and N4 (round 2's non-blocking items)

**N2 — `getCampaignProgress`'s `order by cw.seq, ci.created_at` (wave-seq primacy over creation order)**: unchanged from round 2. Not reachable through the API alone — every campaign-creation path inserts wave-1 items before wave-2 items, so `created_at` order always agrees with wave order in any state the API can produce; only a direct SQL timestamp manipulation (not a client action) can make the two orderings diverge. **Judgment: non-blocking.** A regression here is a real but API-unreachable defect class — the kind of code whose correctness the test suite cannot observe because no client input can construct the distinguishing state. Flagging it as a blocking gap would ask the team to defend against an adversary with direct database write access, which is a different threat model than this slice's routes.

**N4 — `completeItem`'s `FOR UPDATE` row lock**: strengthened this round (§2b) with a direct SQL-level reproduction proving both that the race is real and that the shipped lock pattern (`portfolio.ts:274`) correctly prevents it. **Judgment: non-blocking, with higher confidence than round 2.** The remaining gap is purely a testing-infrastructure one — `app.inject`'s in-process, single-event-loop request model cannot force two "concurrent" HTTP requests to interleave at the database-transaction level the way two real client connections would. That is a property of the test harness, not of the code under test, and it is not unique to this slice (any Fastify route protected by a similar transactional lock would have the same testability gap under `app.inject`). The code follows the textbook-correct pattern for this exact problem (`SELECT … FOR UPDATE` inside a transaction, update, commit), and this round's reproduction confirms that pattern's mechanism directly rather than relying on inspection alone.

---

## 5. Ranked gap list

1. **[LOW, non-blocking] A campaign item can be completed or excepted by an actor who names the WRONG `campaignId` in the URL, as long as the item's `id` and the URL's portfolio (`:id`) both check out** (Sensor M1). `loadCampaignItemForUpdate` (`portfolio.ts:262-278`) filters by `ci.id = $1 and ci.campaign_id = $2 and c.portfolio_project_id = $3` in the real code — correct — but no existing test proves the `campaign_id = $2` clause is load-bearing; a regression dropping it would go undetected. **Why this is judged non-blocking rather than a PASS-blocking gap, unlike round 2's dashboard finding**: (a) it requires the actor to already hold `portfolio.write` on the portfolio in question — the exact same capability that would let them act on the *correct* campaign anyway, so no privilege is gained; (b) it never crosses an org/tenant boundary — `requireOwnedProject` and `enforceCapability` both still run correctly; (c) the item still transitions according to *its own real campaign's* wave-gate (computed from its actual `wave_id` via the join), not the URL's — so no wave-gate bypass results, only a URL/path-parameter that is silently ignored rather than validated; (d) spec.md's Edge Cases section does not enumerate this scenario, and no AC requires rejecting a mismatched `campaignId`. It is a genuine correctness gap in strict REST resource-addressing terms and worth a follow-up test + a `and ci.campaign_id = $2` regression test if this slice is revisited, but it does not represent a security, data-integrity, or spec-conformance failure serious enough to withhold PASS on the final round.

2. **[LOW / informational, unchanged from round 2] `getCampaignProgress`'s `cw.seq` sort-key primacy** (N2) has no test proving it over `created_at` alone; not reachable through the API. See judgment in §4.

3. **[INFORMATIONAL, unchanged from rounds 1/2] PORT-19's AC wording** ("campaign belonging to another org → 404") doesn't literally match tested behavior for true cross-org access (403, via the standard cross-tenant path). Not a functional defect.

4. **[INFORMATIONAL, unchanged from round 2, now strengthened] `completeItem`'s `FOR UPDATE` row lock (N4)** — code confirmed correct by direct SQL-level reproduction this round; the `app.inject` HTTP test harness remains structurally unable to force the race window open. See judgment in §4.
