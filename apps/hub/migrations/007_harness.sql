-- Slice 6: harness vertical (design: .specs/features/slice-6-harness-vertical/design.md).
-- "Diferenciação explícita do produto": inventário versionado (skills/MCPs/
-- modelos) -> dataset de eval determinístico -> score alimenta a avaliação
-- de um experimento do Slice 4 (mesmo gate genérico de promoção, sem
-- mecanismo paralelo) -> Harness Observatory agrega tudo.

create table harness_inventories (
  id text primary key,
  project_id text not null references projects (id),
  org_id text not null,
  workspace_id text not null,
  version int not null,
  skills jsonb not null default '[]'::jsonb,
  mcps jsonb not null default '[]'::jsonb,
  models jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (project_id, version)
);

create index harness_inventories_project_idx on harness_inventories (project_id, version desc);

create table harness_eval_cases (
  id text primary key,
  project_id text not null references projects (id),
  org_id text not null,
  workspace_id text not null,
  name text not null,
  invariant_type text not null,
  params jsonb not null,
  created_at timestamptz not null default now()
);

create index harness_eval_cases_project_idx on harness_eval_cases (project_id, created_at);

create table harness_eval_runs (
  id text primary key,
  project_id text not null references projects (id),
  org_id text not null,
  workspace_id text not null,
  inventory_version int not null,
  score_passed int not null,
  score_total int not null,
  results jsonb not null,
  created_at timestamptz not null default now()
);

create index harness_eval_runs_project_idx on harness_eval_runs (project_id, created_at desc);
