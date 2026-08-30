# Contratos e integrações

## 1. Tipos de integração

### Source connector

Lê sistemas: SCM, docs, issue tracker, product feedback, observability, cloud, CI, artifact registry, security e web sources.

### Action connector

Executa side effect controlado: issue, branch, PR, comment, pipeline, experiment environment.

### Webhook/event source

Notifica mudança; nunca é aceita como conteúdo completo sem fetch autenticado e validação.

### MCP adapter

Expõe capacidades do connector a agentes.

### Export sink

Entrega reports, audit packages, notifications ou BI data.

## 2. Connector contract

Cada connector declara:

- ID/version/provider;
- resources/actions;
- auth mechanisms;
- scopes/capabilities;
- data classifications;
- pagination/cursors;
- rate limits;
- idempotency support;
- webhook schemas;
- freshness/consistency;
- error taxonomy;
- redaction behavior;
- health check;
- regional endpoints;
- test fixture/contract suite.

## 3. Autenticação

Prioridade:

1. workload identity/federation;
2. OAuth 2.1 com tokens short-lived e audience-bound;
3. app installation tokens;
4. secret reference em vault;
5. PAT somente quando provider exigir, com scope mínimo e rotation.

Tokens não são repassados entre MCPs ou upstreams. Cada resource server recebe token destinado a ele.

## 4. Webhook security

- Validar assinatura, timestamp e replay window.
- Persistir delivery ID para deduplicação.
- Enfileirar antes de processar.
- Buscar objeto atual via API quando integridade exigir.
- Não confiar em texto do webhook como instruction.
- Responder rapidamente; processar assíncrono.

## 5. Sync patterns

- Initial scan com checkpoint.
- Incremental cursor por source.
- Webhook-assisted sync.
- Periodic reconciliation.
- Backfill por time window.
- Tombstone/delete awareness.

Cada connector documenta sua consistência. “Webhook recebido” não implica “source synchronized”.

## 6. Normalized resource envelope

Campos conceituais:

- source ID/type/provider;
- external immutable/stable ID;
- resource type;
- observedAt/sourceUpdatedAt;
- version/etag/digest;
- classification;
- raw artifact reference;
- normalized fields;
- provenance;
- tenant/workspace scope.

## 7. Erros

Taxonomia mínima:

- `unauthenticated`;
- `unauthorized`;
- `not_found_or_hidden`;
- `rate_limited`;
- `transient_unavailable`;
- `invalid_contract`;
- `conflict`;
- `side_effect_unknown`;
- `quota_exceeded`;
- `policy_denied`;
- `source_deleted`.

Retry policy é definida pela classe, não por mensagem textual.

## 8. Integrações MVP

- Diretório Git local.
- GitHub como primeiro SCM remoto.
- Web/documentation source manual com URL e snapshot.
- OpenTelemetry/Prometheus via módulo posterior do MVP.
- Issue/PR action somente após vertical read-only.

GitLab, Bitbucket, Jira/Linear, Backstage, cloud providers e product tools entram por ordem de valor e demanda, sem alterar contracts.

## 9. Data boundary

Connector informa se processa:

- metadata;
- source content;
- PII;
- secrets candidates;
- production telemetry;
- customer feedback;
- regulated data.

Policy pode redigir, agregar, executar localmente ou negar. UI mostra o boundary antes de conectar.

## 10. Contract tests

Todo connector precisa provar:

- auth/rotation;
- pagination e cursor resume;
- duplicate/reordered webhook;
- rate limit;
- delete/tombstone;
- timeout em write;
- idempotency/reconciliation;
- secret redaction;
- classification;
- schema evolution;
- least privilege.

