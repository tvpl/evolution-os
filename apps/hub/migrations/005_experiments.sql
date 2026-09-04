-- Slice 4: experiment loop (design: .specs/features/slice-4-experiment-loop/design.md).
-- "O sistema prova antes de recomendar adoção": readyForReview proposal ->
-- start experiment (2 variants + verification plan + digest) -> proof
-- artifacts (reuses Slice 1) -> deterministic evaluation -> close (reuses
-- decisions from Slice 1/3).

create table experiments (
  id text primary key,
  project_id text not null references projects (id),
  org_id text not null,
  workspace_id text not null,
  proposal_id text not null references proposals (id),
  proposal_digest text not null,
  variants jsonb not null,
  verification_plan jsonb not null,
  environment jsonb not null default '{}'::jsonb,
  status text not null default 'running',
  observed_value jsonb,
  verdict text,
  verdict_rationale text,
  created_at timestamptz not null default now(),
  evaluated_at timestamptz,
  closed_at timestamptz
);

create index experiments_project_status_idx on experiments (project_id, status, created_at desc);
create index experiments_proposal_idx on experiments (proposal_id);

create table experiment_artifacts (
  experiment_id text not null references experiments (id),
  artifact_id text not null references artifacts (id),
  primary key (experiment_id, artifact_id)
);
