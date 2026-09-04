-- Slice 9: enterprise hardening (design: .specs/features/slice-9-enterprise-hardening/design.md).
-- Node fleet kill switch (escreve node_agents.revoked_at, já lido desde o
-- Slice 2) -> cadeia tamper-evident de audit_log (entry_hash/prev_hash) ->
-- export de auditoria do org -> política de retenção + sweep de redação de
-- evidência (nunca deleta) -> desprovisionamento de usuário (deactivated_at).

alter table audit_log add column entry_hash text;
alter table audit_log add column prev_hash text;

alter table evidence add column redacted_at timestamptz;

alter table users add column deactivated_at timestamptz;

create table org_retention_policies (
  org_id text primary key,
  evidence_retention_days int not null,
  updated_at timestamptz not null default now()
);
