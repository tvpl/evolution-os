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

## Quarantined (failed when applied - ignore)

A confirmed lesson that recurred alongside failure. Kept for the maintainer to review.

_none_
