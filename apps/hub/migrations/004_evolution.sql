-- Slice 3: evidence to decision (design: .specs/features/slice-3-evidence-to-decision/design.md).
-- Vertical slice do AGENTS.md: evidence -> claim -> signal -> proposal ->
-- Challenger -> inbox -> decision (reusa decisions do Slice 1).

create table evidence (
  id text primary key,
  project_id text not null references projects (id),
  org_id text not null,
  workspace_id text not null,
  type text not null,
  status text not null default 'quarantine',
  source_type text,
  source_reference text,
  source_authority text,
  content_digest text not null,
  content_excerpt text,
  classification text not null default 'internal',
  created_at timestamptz not null default now(),
  activated_at timestamptz
);

create index evidence_project_idx on evidence (project_id, created_at);

create table claims (
  id text primary key,
  project_id text not null references projects (id),
  org_id text not null,
  workspace_id text not null,
  statement text not null,
  epistemic_type text not null,
  created_at timestamptz not null default now()
);

create index claims_project_idx on claims (project_id, created_at);

create table claim_evidence (
  claim_id text not null references claims (id),
  evidence_id text not null references evidence (id),
  primary key (claim_id, evidence_id)
);

create table signals (
  id text primary key,
  project_id text not null references projects (id),
  org_id text not null,
  workspace_id text not null,
  claim_id text not null references claims (id),
  evidence_strength text not null,
  confidence text not null,
  created_at timestamptz not null default now(),
  unique (project_id, claim_id)
);

create table proposals (
  id text primary key,
  project_id text not null references projects (id),
  org_id text not null,
  workspace_id text not null,
  signal_id text references signals (id),
  title text not null,
  summary text not null,
  why_now text,
  cost_of_inaction text,
  proposal_type text not null,
  status text not null default 'draft',
  alternatives jsonb not null default '[]'::jsonb,
  recommended_alternative_id text,
  impact jsonb not null default '{}'::jsonb,
  challenger_findings jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  ready_at timestamptz
);

create index proposals_project_status_idx on proposals (project_id, status, created_at desc);
