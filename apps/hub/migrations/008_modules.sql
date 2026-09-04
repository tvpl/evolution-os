-- Slice 7: module lifecycle (design: .specs/features/slice-7-module-lifecycle/design.md).
-- Spike do ADR-008: publicar um manifest assinado (Ed25519, chave local por
-- org) com SBOM determinístico -> instalar num projeto com policy check
-- (capability_grants reusado sem alteração) e lockfile -> atualizar com
-- diff de permissão bloqueante -> quarentena/rollback/desinstalação sobre
-- um histórico append-only, nunca apagado.

create table modules (
  id text primary key,
  org_id text not null,
  name text not null,
  created_at timestamptz not null default now()
);

create table module_publisher_keys (
  org_id text primary key,
  public_key text not null,
  private_key text not null,
  created_at timestamptz not null default now()
);

create table module_versions (
  id text primary key,
  module_id text not null references modules (id),
  org_id text not null,
  version text not null,
  manifest jsonb not null,
  digest text not null,
  signature text not null,
  sbom jsonb not null,
  provenance jsonb not null,
  created_at timestamptz not null default now(),
  unique (module_id, version)
);

create index module_versions_module_idx on module_versions (module_id, created_at desc);

create table module_installations (
  id text primary key,
  project_id text not null references projects (id),
  org_id text not null,
  workspace_id text not null,
  module_id text not null references modules (id),
  seq int not null,
  version text not null,
  digest text not null,
  capabilities jsonb not null,
  status text not null,
  action text not null,
  created_at timestamptz not null default now(),
  unique (project_id, module_id, seq)
);

create index module_installations_current_idx on module_installations (project_id, module_id, seq desc);
