-- Slice 1: idea memory (design: .specs/features/slice-1-idea-memory/design.md).
-- Entidades tipadas do knowledge model (ADR-005 rejeita JSON blobs sem relações
-- tipadas). org_id/workspace_id denormalizados como em projects_view (Slice 0).

create table hypotheses (
  id text primary key,
  project_id text not null references projects (id),
  org_id text not null,
  workspace_id text not null,
  statement text not null,
  type text,
  evidence_state text,
  metric text,
  threshold text,
  status text not null,
  authority text not null default 'declared',
  created_at timestamptz not null default now()
);

create index hypotheses_project_idx on hypotheses (project_id, created_at);

create table constraints_ (
  id text primary key,
  project_id text not null references projects (id),
  org_id text not null,
  workspace_id text not null,
  category text,
  statement text not null,
  severity text not null,
  authority text not null default 'declared',
  created_at timestamptz not null default now()
);

create index constraints_project_idx on constraints_ (project_id, created_at);

create table artifacts (
  id text primary key,
  project_id text not null references projects (id),
  org_id text not null,
  workspace_id text not null,
  type text not null,
  title text not null,
  current_version integer not null default 1,
  created_at timestamptz not null default now()
);

create table artifact_versions (
  artifact_id text not null references artifacts (id),
  version integer not null,
  reference text,
  content text,
  created_at timestamptz not null default now(),
  primary key (artifact_id, version)
);

create table decisions (
  id text primary key,
  project_id text not null references projects (id),
  org_id text not null,
  workspace_id text not null,
  decision text not null,
  actor text not null,
  rationale text not null,
  alternatives jsonb not null default '[]'::jsonb,
  subject_type text,
  subject_id text,
  review_trigger text,
  review_trigger_status text not null default 'none',
  decided_at timestamptz not null default now()
);

create index decisions_project_idx on decisions (project_id, decided_at desc);
create index decisions_subject_idx on decisions (project_id, subject_type, subject_id);
