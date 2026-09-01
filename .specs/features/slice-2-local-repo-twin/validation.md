# Validation Report — slice-2-local-repo-twin

- **Result**: PASS
- **Diff range**: 38f1ab9..6cad25f
- **Date**: 2026-09-01

Verifier: independent re-derivation (author != verifier). Evidence-or-zero rule applied: every "covered" cell below cites a real `file:line` and reproduces the assertion expression. Spec re-read from disk at validation time (not from paraphrase) — the corrected AC1/P1 (`--project` explicit flag, no auto-matching) and the corrected Assumptions row were confirmed present in `spec.md` lines 39 and 55, and match the shipped `apps/node/src/cli.ts` (`--project <id>` required option, with an explicit `SPEC_DEVIATION` comment at lines 153-156).

---

## Gates — comandos executados e contagens reais

| Gate | Command | Result |
| --- | --- | --- |
| Typecheck | `pnpm typecheck` | PASS — 5/5 workspaces (console, contracts, telemetry, hub, node) `Done` |
| Unit | `pnpm test:unit` | PASS — `packages/contracts` 20 tests, `apps/node/test/unit` 7 tests → **27 total**, 2 files, 0 failed |
| Integration | `pnpm test:int` | PASS — `apps/hub` **108** tests / 22 files (incl. `twin-migration.test.ts` 2, `snapshots.test.ts` 7, `candidates.test.ts` 6, `diff.test.ts` 4); `apps/node/test/integration` **8** tests / 2 files (`cli.test.ts` 5, `snapshot-cli.test.ts` 3) |
| Docs | `python3 scripts/check_docs.py` | PASS — `check_docs: 0 problema(s) em 71 arquivo(s)` |

Pre: `bash scripts/dev-db.sh start` run successfully (`DATABASE_URL=postgresql://evo@127.0.0.1:55432/evolution`) before all gates above.

---

## Per-AC evidence

### P1 — Snapshot determinístico (TWIN-01..05)

| ID / AC | Evidence (file:line + assertion) | Spec outcome | Coberto? |
| --- | --- | --- | --- |
| TWIN-01 (AC1: `--project <id>` flag, collects branch/sha/manifests/languages, syncs) | `apps/node/test/integration/snapshot-cli.test.ts:103-112` — `const result = await evo(["snapshot", "--project", projectId, "--path", repo]); expect(result.code).toBe(0); expect(result.out).toMatch(/snapshot: snp_/); ... expect(row.rows[0]).toEqual({ branch: "main", sha: "c".repeat(40) })`; collector fields verified at `apps/node/test/unit/snapshot.test.ts:22-30` — `expect(result.snapshot.branch).toBe("main"); expect(result.snapshot.commitSha)...; expect(result.snapshot.manifests).toEqual([{ecosystem:"npm",location:".",name:"meu-pacote"}]); expect(result.snapshot.languages).toMatchObject({TypeScript:1,Markdown:1})` | CLI collects branch/sha/manifest/languages and syncs via explicit `--project` (matches corrected spec.md:39,55) | **Sim** |
| TWIN-02 (payload never contains file content) | `apps/node/test/unit/snapshot.test.ts:33-43` — `writeFileSync(...,{name:"pkg",secretField:"should-not-leak"}); writeFileSync("app.ts","const secret = 'sk-super-secret-token';"); const serialized = JSON.stringify(result); expect(serialized).not.toContain("should-not-leak"); expect(serialized).not.toContain("sk-super-secret-token")` — proves absence of secret/content, not just presence of manifest names | Payload metadata-only, no file content/secrets leak | **Sim** |
| TWIN-03 (persist as new version, `authority=observed`, `observedAt`, preserves prior) | `apps/hub/test/snapshots.test.ts:120-132` — concurrent sync test: `expect(r1.json().snapshotId).not.toBe(r2.json().snapshotId); ... expect(rows.rows[0].n).toBe(2)` (preserves both); `observedAt` exercised at `apps/hub/test/diff.test.ts:105-115` (`snapshotVersion` == `observed_at` from DB). Note: `snapshots` table (`apps/hub/migrations/003_twin.sql:5-17`) has no literal `authority` column — "observed" is the table's identity by design (same pattern as `artifacts`="declared" for TWIN-10), not an assertable field; see Spec-precision gaps. | Persist new version linked, preserving every prior snapshot | **Sim** (com nota de precisão — authority é implícita por tabela, não coluna testável) |
| TWIN-04 (fails outside Git repo, no sync) | `apps/node/test/unit/snapshot.test.ts:45-49` — `expect(result).toEqual({ok:false, error: expect.stringContaining("not a git repository")})`; end-to-end at `apps/node/test/integration/snapshot-cli.test.ts:127-139` — `expect(result.code).not.toBe(0); expect(result.out).toContain("not a git repository"); ... expect(after.rows[0].n).toBe(before.rows[0].n)` (snapshot count unchanged, proving no sync) | CLI fails clearly, nothing synced | **Sim** |
| TWIN-05 (list most-recent-first) | `apps/hub/test/snapshots.test.ts:134-146` — `const dates = snapshots.map(s=>s.observedAt); expect(dates).toEqual([...dates].sort().reverse())` | Ordered most-recent-first | **Sim** |

### P2 — Cartographer determinístico (TWIN-06..09)

| ID / AC | Evidence | Spec outcome | Coberto? |
| --- | --- | --- | --- |
| TWIN-06 (>1 manifest → 1 component + 1 contains per manifest, `authority=inferred`) | `apps/hub/test/snapshots.test.ts:86-104` — `expect(res.json().candidatesProposed).toBe(6); // 3 component + 3 contains ... for (row of rows) expect(row.status).toBe("pending")`; `apps/hub/test/candidates.test.ts:97-105` — `expect(candidates.length).toBe(4); // 2 manifests × (component+contains)` | 1 component + 1 contains per manifest | **Sim** |
| TWIN-07 (list candidates w/ entity/relation, snapshot origin, `pending`) | `apps/hub/test/candidates.test.ts:97-105` — `const {candidates}=res.json(); expect(candidates.length).toBe(4); for(c of candidates) expect(c.status).toBe("pending")`; `listCandidates` selects `snapshot_id as "snapshotId"` (`apps/hub/src/twin/candidates.ts:16-24`) returned in payload | List each with entity/relation, snapshot, status pending | **Sim** |
| TWIN-08 (single manifest matching declared type → no candidates) | `apps/hub/test/snapshots.test.ts:75-84` — `manifests:[manifestEntry(".")] ... expect(res.json()).toMatchObject({candidatesProposed:0})` | No candidate for 1 coherent manifest | **Sim** |
| TWIN-09 (no duplicate pending on resync) | `apps/hub/test/snapshots.test.ts:106-118` — `const second = await sync({manifests,languages:{}}); expect(second.json().candidatesProposed).toBe(0); ... expect(after.rows[0].n).toBe(before.rows[0].n)` | Resync same manifests, no duplicate pending | **Sim** |

### P2 — Confirmação humana (TWIN-10..13)

| ID / AC | Evidence | Spec outcome | Coberto? |
| --- | --- | --- | --- |
| TWIN-10 (confirm → `confirmed`, persists `declared` entity, preserves original inferred unchanged) | `apps/hub/test/candidates.test.ts:107-129` — `expect(confirmed.status).toBe("confirmed"); expect(confirmed.confirmedEntityId).toMatch(/^art_/); const artifact = await pool.query("select type from artifacts where id=$1",[...]); expect(artifact.rows[0]).toEqual({type:"component"})`. Weak spot: the "preserve inferred unchanged" half is checked only as `expect(row.rows[0]).toMatchObject({kind:"component"})` post-confirm — no pre/post diff of `payload`/`location` is captured to prove non-mutation; unchanged-ness is only guaranteed by code inspection (`apps/hub/src/twin/candidates.ts:69-74` UPDATE touches only `status`/`confirmed_entity_id`/`decided_at`), not by an assertion comparing before/after values. `artifacts` table has no `authority` column either (implicit "declared" by table identity, same pattern as snapshots/observed). | Confirm promotes to declared, preserves inferred record | **Parcial** — promoção/artifact provados; "preserva o inferred original" não tem asserção before/after direta (ver Spec-precision gaps) |
| TWIN-11 (reject → `rejected` + optional reason, never deleted) | `apps/hub/test/candidates.test.ts:131-148` — `expect(res.json().candidate).toMatchObject({status:"rejected",reason:"duplicado com outro pacote"}); const still = await pool.query(...); expect(still.rowCount).toBe(1); expect(still.rows[0].status).toBe("rejected")` | Reject preserves record with reason | **Sim** |
| TWIN-12 (confirm/reject non-pending → 409, no status change) | `apps/hub/test/candidates.test.ts:150-162` — confirm path only: `expect(res.statusCode).toBe(409); ... expect(after.rows[0].decided_at).toEqual(before.rows[0].decided_at)`. No test exercises `POST .../reject` against an already-decided candidate (`rejectCandidate`, `apps/hub/src/twin/candidates.ts:81-105`, has the identical `if (row.status !== "pending") return {kind:"not_pending"}` guard but it is never asserted via a dedicated test). | Both confirm and reject return 409 on non-pending | **Parcial** — só o caminho `confirm` tem asserção 409; caminho `reject` sobre candidate não-pending não tem teste dedicado |
| TWIN-13 (rejected reappears only with new evidence — different payload) | Searched all of `apps/hub/test/*.test.ts` for a reject→resync flow: **none found**. `candidates.test.ts` rejects a candidate but never resyncs afterward; `snapshots.test.ts` never rejects a candidate. The describe-block title in both files claims TWIN-13 coverage (`snapshots.test.ts:74`, mentions "TWIN-09/13" region), but no assertion proves either half of the AC (same payload → not reproposed; different payload → reproposed). Only code-level evidence exists: `apps/hub/src/twin/cartographer.ts:69-72` (`if (row.status==="rejected" && payloadEquals(...)) continue`). | Rejected candidate not recreated without new evidence; new evidence (different manifest name/ecosystem) does trigger re-proposal | **NÃO coberto** (gap) |

### P3 — Diff declarado vs. observado (TWIN-14..16)

| ID / AC | Evidence | Spec outcome | Coberto? |
| --- | --- | --- | --- |
| TWIN-14 (compare declared type/name vs latest snapshot manifests, report mismatches) | `apps/hub/test/diff.test.ts:74-88` — `expect(body.mismatches).toEqual([{field:"type",declared:"service",observed:"monorepo with 3 components"}])`. Implementation (`apps/hub/src/twin/diff.ts:21-38`) only compares `projects.type` against manifest **count** (`SINGLE_UNIT_TYPES` heuristic) — it never reads or compares a declared **name** field against any observed manifest `name`, despite the AC text "compare the manifest's declared `type`/`name`". No test exercises a name-mismatch scenario because the code path for it does not exist. | Compare declared type AND name against observed | **Parcial** — só `type` é comparado e testado; `name` não é implementado nem testado (ver Spec-precision gaps) |
| TWIN-15 (no mismatches → empty list, not error) | `apps/hub/test/diff.test.ts:90-96` — `expect(res.statusCode).toBe(200); expect(res.json().mismatches).toEqual([])` | Empty mismatch list, no error | **Sim** |
| TWIN-16 (response cites snapshot version) | `apps/hub/test/diff.test.ts:105-115` — `const row = await pool.query("select observed_at from snapshots where id=$1",[synced.json().snapshotId]); expect(new Date(res.json().observed.snapshotVersion).toISOString()).toBe(new Date(row.rows[0].observed_at).toISOString())` — proves the exact snapshot's `observed_at` is what's cited, not just presence of a field | Diff cites which snapshot version | **Sim** |

### Edge Cases

| Edge Case | Evidence | Coberto? |
| --- | --- | --- |
| No snapshot yet → diff reports no observed data, not error | `apps/hub/test/diff.test.ts:98-103` — `expect(res.statusCode).toBe(200); expect(res.json()).toEqual({observed:null,mismatches:[]})` | **Sim** |
| `evo snapshot` for non-enrolled node fails same way as `evo sync` (401-equivalent, no data sent) | `apps/node/test/integration/snapshot-cli.test.ts:114-125` — `expect(result.code).not.toBe(0); expect(result.out).toContain("not enrolled")`. This is a client-side pre-check (`apps/node/src/cli.ts:106-108`, same guard as `cmdSync` at `cli.ts:84-86`) that throws before any `fetch` call — symmetric with `evo sync`'s own behavior, so "same way evo sync does" is structurally true, but the test does not independently prove "no data sent" (no snapshot-count assertion in this specific test, unlike the no-git-repo edge case which does count). | **Sim** (com nota: "no data sent" não é contado explicitamente neste teste, apenas inferido da ordem do código) |
| Two concurrent snapshots stored as distinct versions, no data loss | `apps/hub/test/snapshots.test.ts:120-132` — `expect(r1.json().snapshotId).not.toBe(r2.json().snapshotId); expect(rows.rows[0].n).toBe(2)` | **Sim** |
| Candidate's snapshot superseded before confirmation — candidate stays confirmable, referencing its original snapshot | No test found: no test creates snapshot A → candidate → snapshot B (superseding) → then confirms/rejects the candidate from A and checks it still references A's `snapshotId` and is still actionable. `candidates.ts` code has no logic that would invalidate a candidate on a newer snapshot (nothing keys off "latest" during confirm/reject), so behavior is correct by omission, but not exercised by any assertion. | **NÃO coberto** (gap) |
| Repo with zero recognized manifests still syncs successfully, empty manifest list | Collector level: `apps/node/test/unit/snapshot.test.ts:51-58` — `expect(result.snapshot.manifests).toEqual([])` (proves the CLI-side collector succeeds). Hub-level (HTTP 201 for an empty-manifest snapshot) is not independently status-asserted: `apps/hub/test/snapshots.test.ts:135-136` sends `{manifests:[],languages:{}}` twice inside the "most-recent-first" test but never checks `res.statusCode` on those calls — a silent 422/500 would still let that test pass vacuously (0 snapshots, trivially sorted). | **Parcial** — coberto no Node; não comprovado com asserção de status explícita no Hub |

---

## Discrimination sensor

Baseline `git status --porcelain` before starting: **empty** (clean tree).

| # | Mutation | File | Test run | Result | Árvore restaurada |
| --- | --- | --- | --- | --- | --- |
| a | Remove `status === 'pending'` dedup check in `insertCandidates` | `apps/hub/src/twin/cartographer.ts` | `pnpm vitest run test/snapshots.test.ts` | **Matou** — `resyncing the same manifests does not duplicate pending candidates` failed (`expected undefined to be +0`, unique-index violation surfaced as broken response) | Sim (`diff` vazio confirmado) |
| b | Remove `row.status !== 'pending'` guard in `confirmCandidate` | `apps/hub/src/twin/candidates.ts` | `pnpm vitest run test/candidates.test.ts` | **Matou** — `confirming an already-decided candidate returns 409 without changing it` failed (`expected 200 to be 409`) | Sim (diff vazio, confirmado por `diff` byte-a-byte) |
| c | Force `mismatches: []` always in `computeDiff` | `apps/hub/src/twin/diff.ts` | `pnpm vitest run test/diff.test.ts` | **Matou** — `a service project observed as a 3-component monorepo reports the mismatch` failed (`expected [] to deeply equal [...]`) | Sim |
| d | Remove `row.token_hash !== sha256(token)` check in `authenticateNode` | `apps/hub/src/nodes/auth.ts` | `pnpm vitest run test/snapshots.test.ts` | **Matou** — `sync without a valid node token is rejected 401` failed (`expected 201 to be 401`) | Sim |
| e | Remove `IGNORED_DIRS` check in `walk` (`collectSnapshot`) | `apps/node/src/snapshot.ts` | `pnpm vitest run test/unit/snapshot.test.ts` | **Matou** — `ignored directories (node_modules) are excluded from the walk` failed (`node_modules/some-dep` manifest leaked into result) | Sim |
| f | `order by observed_at desc` → `asc` in `listSnapshots` | `apps/hub/src/twin/snapshots.ts` | `pnpm vitest run test/snapshots.test.ts` | **Matou** — `listing snapshots returns most-recent-first` failed (dates in wrong order) | Sim |

All 6/6 mutants killed by the intended test file. All 6 files restored from `/tmp/claude-0/-home-user-evolution-os/870962f6-72b1-51be-8836-8841a794dc83/scratchpad/verifier-slice2/` and verified byte-identical via `diff` after each restore. Final `git status --porcelain` on the 6 touched files and `git diff -- apps/hub/src/twin/ apps/hub/src/nodes/auth.ts apps/node/src/snapshot.ts` are both **empty**.

**Unrelated observation (not part of this sensor, not touched, read-only respected)**: during this verification run, an untracked directory `.specs/features/slice-3-evidence-to-decision/` (with `spec.md` and later `design.md`) appeared in the working tree at ~11:04-11:05. This was not created by this Verifier — it surfaced from a concurrent, unrelated process in the shared container (apparently another slice's spec-driven work in progress) and lies entirely outside `slice-2-local-repo-twin`'s scope. It was left untouched per the read-only mandate. `git status --porcelain` is therefore not fully empty at the very end of the session, but the non-emptiness is confined to that unrelated directory, not to anything this Verifier mutated or is responsible for restoring.

Final gate re-run after all mutations restored: `pnpm typecheck` PASS (5/5); `apps/hub` `test/snapshots.test.ts` + `test/candidates.test.ts` + `test/diff.test.ts` → 17/17 passed.

---

## Spec-precision gaps

1. **TWIN-13 (P2) has no test evidence at all** — neither half of the AC (rejected-not-reproposed-without-change; reproposed-with-new-evidence) is exercised by any assertion in `apps/hub/test/*.test.ts`, despite the code implementing the guard (`apps/hub/src/twin/cartographer.ts:69-72`) and the describe-block title in `snapshots.test.ts` claiming to cover it. Confirmed by the mutation sensor design itself, which had no dedicated mutant/test pairing for TWIN-13's "new evidence" branch (`payloadEquals` false-path) either.
2. **TWIN-12 (P2)** — only the `confirm` 409-on-non-pending path is tested; the `reject` 409-on-non-pending path (`apps/hub/src/twin/candidates.ts:94`) has no dedicated test, though the code is symmetric.
3. **TWIN-14 (P3)** — the AC's literal text ("compare the manifest's declared `type`/`name`") is only half-implemented: `computeDiff` (`apps/hub/src/twin/diff.ts:21-38`) compares `type` only; there is no `name` comparison in code or tests.
4. **TWIN-10 (P2)** — "preserve the original inferred record unchanged" is asserted only loosely (`toMatchObject({kind:"component"})` post-confirm, no pre/post value diff); correctness relies on code inspection rather than a direct assertion.
5. **TWIN-03 / TWIN-10 "authority" fields** — neither `snapshots` nor `artifacts` tables carry a literal `authority` column; `observed`/`declared` are conveyed by table identity (a defensible, documented design choice per `design.md:98`), but this means the AC text "marcados `authority='observed'`" / "`authority='declared'`" is not literally testable as written.
6. **Edge case — candidate confirmable across a superseding snapshot** — no test exercises snapshot A → candidate from A → snapshot B (supersedes) → confirm/reject candidate from A still works and still cites snapshot A.
7. **Edge case — zero-manifest snapshot syncs successfully (Hub HTTP layer)** — proven at the Node collector unit level, but no Hub integration test explicitly asserts `201` for a `manifests: []` payload (the closest test doesn't check `statusCode` on those calls).

None of the above are P1; TWIN-01 through TWIN-05 (P1/MVP) are all solidly covered with precise, spec-matching assertions, so the overall verdict is not brought down by these gaps.

---

## Gaps — ranqueados

1. **[P2 — real coverage hole] TWIN-13 untested.** Add a test in `apps/hub/test/candidates.test.ts` or `snapshots.test.ts`: reject a `component` candidate, resync the identical manifest (same payload) and assert no new pending candidate at that location; then resync with a changed `name`/`ecosystem` at the same location and assert a new pending candidate IS created.
2. **[P2 — real coverage hole] TWIN-12 reject-path 409 untested.** Add: reject a candidate, then attempt to reject (or confirm) it again and assert 409 without status change.
3. **[P3 — implementation/spec mismatch] TWIN-14 `name` comparison missing.** Either implement a declared-vs-observed `name` comparison in `computeDiff`, or narrow the spec's AC1 wording to `type`-only to match what was actually built (currently the code silently doesn't do what the AC literally promises).
4. **[P2 — weak assertion] TWIN-10 "preserve inferred unchanged" not proven by before/after diff.** Strengthen the existing confirm test to snapshot the candidate's `payload`/`location` before confirming and assert equality after.
5. **[Edge case — untested] Candidate confirmable/rejectable after its origin snapshot is superseded.** Add an integration test for this scenario; currently only inferable from the absence of any "latest snapshot" check in the confirm/reject code path.
6. **[Edge case — weak assertion] Zero-manifest snapshot Hub-level success (201) not directly asserted.** Add an explicit `expect(res.statusCode).toBe(201)` for a `manifests: []` sync in `apps/hub/test/snapshots.test.ts`.

## Addendum — gaps fechados pelo orquestrador

- **TWIN-14**: `diff.ts` agora compara também `name` (não só `type`) quando o snapshot tem 1 manifest; teste dedicado adicionado.
- **Bug real encontrado ao corrigir TWIN-13**: `payloadEquals` comparava `JSON.stringify` bruto; `jsonb` do Postgres não preserva ordem de chaves no round-trip, então um payload IGUAL podia ser julgado diferente e reproposto indevidamente. Corrigido com stringify canônico (chaves ordenadas).
- **Gap adicional encontrado no mesmo teste**: candidates `confirmed` não tinham guard de dedup nenhum (só pending/rejected eram checados) — resincronizar após confirmar duplicava um pending. Corrigido: `confirmed` agora também suprime nova proposta na mesma location+kind.
- **TWIN-10**: asserção fortalecida para comparação completa de linha antes/depois (era `toMatchObject` parcial).
- **TWIN-12**: adicionado o caso simétrico de reject sobre candidate não-pending (409).
- **Edge cases**: snapshot sem manifests (201 na camada HTTP) e candidate confirmável após seu snapshot ser superado por um novo.

Suite final: 114 (hub) + 8 (node) integração — todos verdes. Nenhum gap aberto restante.
