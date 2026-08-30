-- Schema v0 do trust skeleton (design: .specs/features/slice-0-trust-skeleton/design.md).
-- Tudo tenant-scoped por org_id (+ workspace_id); escopo vem SEMPRE da sessão (ADR-014).

create table organizations (
  id text primary key,
  name text not null,
  created_at timestamptz not null default now()
);

create table workspaces (
  id text primary key,
  org_id text not null references organizations (id),
  name text not null,
  created_at timestamptz not null default now()
);

create table users (
  id text primary key,
  org_id text not null references organizations (id),
  email text not null,
  display_name text,
  created_at timestamptz not null default now()
);

create table node_agents (
  id text primary key,
  org_id text not null references organizations (id),
  workspace_id text not null references workspaces (id),
  name text not null,
  token_hash text not null,
  enrolled_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table node_artifacts (
  id text primary key,
  node_id text not null references node_agents (id),
  org_id text not null,
  workspace_id text not null,
  name text not null,
  digest text not null,
  received_at timestamptz not null default now()
);

create table projects (
  id text primary key,
  org_id text not null references organizations (id),
  workspace_id text not null references workspaces (id),
  type text not null,
  name text not null,
  manifest jsonb not null,
  version integer not null default 1,
  created_by text,
  created_at timestamptz not null default now()
);

create table capability_grants (
  id text primary key,
  org_id text not null,
  workspace_id text not null,
  principal text not null,
  capability text not null,
  created_at timestamptz not null default now(),
  unique (org_id, workspace_id, principal, capability)
);

create table idempotency_keys (
  org_id text not null,
  key text not null,
  request_digest text not null,
  response jsonb,
  created_at timestamptz not null default now(),
  primary key (org_id, key)
);

create table outbox (
  seq bigserial primary key,
  event_id text not null unique,
  type text not null,
  subject text,
  tenant_id text not null,
  workspace_id text not null,
  project_id text,
  correlation_id text not null,
  causation_id text,
  traceparent text,
  classification text not null,
  payload jsonb not null,
  occurred_at timestamptz not null default now(),
  dispatched_at timestamptz
);

create index outbox_pending_idx on outbox (seq) where dispatched_at is null;

create table inbox (
  consumer text not null,
  event_id text not null,
  processed_at timestamptz not null default now(),
  primary key (consumer, event_id)
);

create table projects_view (
  project_id text primary key,
  org_id text not null,
  workspace_id text not null,
  name text not null,
  type text not null,
  registered_at timestamptz not null
);

create table workflows (
  id text primary key,
  type text not null,
  status text not null default 'running',
  current_step integer not null default 0,
  checkpoint jsonb not null default '{}'::jsonb,
  org_id text,
  updated_at timestamptz not null default now()
);

create table workflow_steps (
  workflow_id text not null references workflows (id),
  step text not null,
  executed_at timestamptz not null default now(),
  primary key (workflow_id, step)
);

create table audit_log (
  id bigserial primary key,
  org_id text not null,
  actor text not null,
  action text not null,
  resource text not null,
  outcome text not null,
  reason text,
  correlation_id text,
  at timestamptz not null default now()
);
