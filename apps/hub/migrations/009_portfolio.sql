-- Slice 8: portfolio campaign (design: .specs/features/slice-8-portfolio-campaign/design.md).
-- Implementa spec.relations (CORE-FR-002) pela primeira vez -> dashboard
-- agregado do portfolio -> campaign nascida de um finding comum, organizada
-- em waves sequenciais (gate canary: uma wave só libera a próxima quando
-- inteiramente resolvida) -> exceções locais justificadas -> progresso sem
-- ranking -> export de auditoria reusando `decisions` do Slice 1.

create table project_relations (
  id text primary key,
  org_id text not null,
  workspace_id text not null,
  source_project_id text not null references projects (id),
  target_project_id text not null references projects (id),
  type text not null,
  created_at timestamptz not null default now(),
  unique (source_project_id, target_project_id, type)
);

create index project_relations_source_idx on project_relations (source_project_id, type);
create index project_relations_target_idx on project_relations (target_project_id, type);

create table campaigns (
  id text primary key,
  org_id text not null,
  workspace_id text not null,
  portfolio_project_id text not null references projects (id),
  finding text not null,
  created_at timestamptz not null default now()
);

create index campaigns_portfolio_idx on campaigns (portfolio_project_id, created_at desc);

create table campaign_waves (
  id text primary key,
  campaign_id text not null references campaigns (id),
  seq int not null,
  name text,
  created_at timestamptz not null default now(),
  unique (campaign_id, seq)
);

create table campaign_items (
  id text primary key,
  campaign_id text not null references campaigns (id),
  wave_id text not null references campaign_waves (id),
  target_project_id text not null references projects (id),
  status text not null default 'pending',
  proposal_id text references proposals (id),
  exception_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index campaign_items_campaign_idx on campaign_items (campaign_id, wave_id);
