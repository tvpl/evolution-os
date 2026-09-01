-- Slice 5: reversible external action (design: .specs/features/slice-5-reversible-external-action/design.md).
-- "Proposta vira trabalho real com controle": conectar repo (declarado) ->
-- webhook validado e deduplicado -> ação externa controlada (issue/branch/
-- draftPr, adapter determinístico, idempotente) -> status de CI vira proof
-- artifact automático quando ligado a um experimento (Slice 4).

create table github_connections (
  id text primary key,
  project_id text not null references projects (id),
  org_id text not null,
  workspace_id text not null,
  owner text not null,
  repo text not null,
  webhook_secret text not null,
  status text not null default 'connected',
  last_event_at timestamptz,
  created_at timestamptz not null default now(),
  unique (project_id, owner, repo)
);

create table github_webhook_events (
  id text primary key,
  connection_id text not null references github_connections (id),
  delivery_id text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  unique (connection_id, delivery_id)
);

create table github_actions (
  id text primary key,
  project_id text not null references projects (id),
  org_id text not null,
  workspace_id text not null,
  connection_id text not null references github_connections (id),
  action_type text not null,
  proposal_id text references proposals (id),
  experiment_id text references experiments (id),
  title text not null,
  external_ref text not null,
  created_at timestamptz not null default now()
);

create index github_actions_project_idx on github_actions (project_id, created_at desc);

create table github_action_ci_statuses (
  id text primary key,
  action_id text not null references github_actions (id),
  context text not null,
  state text not null,
  target_url text,
  created_at timestamptz not null default now()
);

create index github_action_ci_statuses_action_idx on github_action_ci_statuses (action_id, created_at desc);
