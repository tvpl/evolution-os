# LESSONS - auto-maintained by scripts/lessons.py

> Machine-owned. Do NOT hand-edit. Changes are overwritten on the next `lessons.py` write.
> Canonical state lives in `.specs/lessons.json`. Edit lessons only via the script.
> promote_threshold=2 distinct features · window_days=45 · quarantine_threshold=2

## Confirmed (load these at Specify/Design)

Corroborated across multiple features. Safe to apply as guidance.

_none_

## Candidates (under observation - do NOT load as guidance yet)

Seen once or not yet corroborated. Tracked, not trusted.

### L-001 - validate_spec.py nao varre ACs quando ha linha em branco apos '**Acceptance Criteria**:'; ate fix upstream, confirmar SHALL nos ACs por grep manual alem do exit 0
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `specs` · harmful: 0
- features: docs-planning-ecosystem
- evidence: .claude/skills/tlc-spec-driven/scripts/validate_spec.py:173 (specs)
- last seen: 2026-08-30T20:42:50Z

### L-002 - Todo edge case listado na spec precisa de asserção dedicada propria; guarda implementada sem teste vira gap no verifier (G1: sessao sem workspace scope)
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `hub/identity` · harmful: 0
- features: slice-0-trust-skeleton
- evidence: apps/hub/src/identity/session.ts:36 (hub/identity)
- last seen: 2026-08-31T01:51:25Z

### L-003 - Assert spec-named payload fields on their value (toBe/toEqual), never with toHaveProperty alone — presence-only checks let a hardcoded or blanked field pass the whole suite.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `apps/hub/test` · harmful: 0
- features: slice-3-evidence-to-decision
- evidence: M1/M2/M8 — apps/hub/src/evolution/evidence.ts:41,79 + proposals.ts:164 (apps/hub/test)
- last seen: 2026-09-01T11:43:29Z

### L-004 - When a design reduces an AC to an already-implemented generic mechanism, re-read the AC's trigger clause — reusing a prior slice's guard covers the AC only if the trigger matches, otherwise the AC ships untested.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `.specs` · harmful: 0
- features: slice-3-evidence-to-decision
- evidence: FLOW-18 (spec.md:125,127) (.specs)
- last seen: 2026-09-01T11:43:32Z

### L-005 - Ordering criteria in an AC must name the field they sort by; 'most-recent-first' leaves created_at vs ready_at undecided and makes the test unfalsifiable against intent.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `.specs` · harmful: 0
- features: slice-3-evidence-to-decision
- evidence: FLOW-16 (spec.md:123) (.specs)
- last seen: 2026-09-01T11:43:33Z

### L-006 - A filtered query's own filter needs a negative fixture: when a test sets up only rows that match the predicate, deleting the predicate changes nothing and the mutant survives — add a row that must be excluded.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `apps/hub/test` · harmful: 0
- features: slice-3-evidence-to-decision
- evidence: apps/hub/src/evolution/proposals.ts:106 (mutant N1) (apps/hub/test)
- last seen: 2026-09-01T11:55:24Z

### L-007 - When a value is derived through a canonicalization helper, assert the canonicalization property itself, not just that the derived value exists and is reproducible for identical inputs
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `hub-domain` · harmful: 0
- features: slice-4-experiment-loop
- evidence: M5 - apps/hub/src/evolution/experiments.ts:46 (hub-domain)
- last seen: 2026-09-01T12:33:43Z

### L-008 - For an acceptance criterion phrased as a bound (exactly N, any of N fields), test every direction of the bound, not one representative instance
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `routes` · harmful: 0
- features: slice-4-experiment-loop
- evidence: EXP-02 - apps/hub/test/experiments-start.test.ts:104 (routes)
- last seen: 2026-09-01T12:33:43Z

### L-009 - Assert every payload field a listing endpoint returns on its actual value, never identity alone
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `routes` · harmful: 0
- features: slice-4-experiment-loop
- evidence: M11 - apps/hub/src/evolution/experiments.ts:164 (routes)
- last seen: 2026-09-01T12:33:44Z

### L-010 - Every state-transition guard in the implementation needs a test for the wrong-state case it rejects, even when no acceptance criterion names that case
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `hub-domain` · harmful: 0
- features: slice-4-experiment-loop
- evidence: M10 - apps/hub/src/evolution/experiments.ts:143 (hub-domain)
- last seen: 2026-09-01T12:33:44Z

### L-011 - Assert a status transition against the persisted row, never against a response field the route hardcodes
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `routes` · harmful: 0
- features: slice-4-experiment-loop
- evidence: EXP-10 - apps/hub/test/experiments-evaluate.test.ts:118 (routes)
- last seen: 2026-09-01T12:33:44Z

## Quarantined (failed when applied - ignore)

A confirmed lesson that recurred alongside failure. Kept for the maintainer to review.

_none_
