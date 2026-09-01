-- Slice 2: local repo twin (design: .specs/features/slice-2-local-repo-twin/design.md).
-- snapshots = fatos observed do Node; candidates = propostas inferred do
-- Cartographer determinístico, aguardando confirmação humana (declared).

create table snapshots (
  id text primary key,
  project_id text not null references projects (id),
  org_id text not null,
  workspace_id text not null,
  node_id text not null references node_agents (id),
  branch text,
  commit_sha text,
  manifests jsonb not null default '[]'::jsonb,
  languages jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index snapshots_project_idx on snapshots (project_id, created_at desc);

create table candidates (
  id text primary key,
  project_id text not null references projects (id),
  org_id text not null,
  workspace_id text not null,
  snapshot_id text not null references snapshots (id),
  kind text not null,
  location text not null,
  payload jsonb not null,
  status text not null default 'pending',
  reason text,
  confirmed_entity_id text,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create index candidates_project_idx on candidates (project_id, created_at);
create unique index candidates_pending_location_idx on candidates (project_id, location)
  where status = 'pending';
