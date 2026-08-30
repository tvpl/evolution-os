# API e modelo de eventos

## 1. Estilo

- REST/JSON inicial para resource/command APIs.
- Streaming SSE/WebSocket para progresso, sem usar conexão como durability.
- Events CloudEvents-compatible para integração e projections.
- Webhooks assinados para consumers externos.
- GraphQL não é necessário no MVP; pode ser avaliado para graph exploration após medir necessidade.

## 2. Resource APIs conceituais

- `/organizations`, `/workspaces`, `/projects`.
- `/projects/{id}/twin`, `/snapshots`, `/artifacts`, `/relations`.
- `/evidence`, `/claims`, `/signals`, `/findings`.
- `/proposals`, `/decisions`, `/experiments`, `/changes`.
- `/runs`, `/tasks`, `/proofs`.
- `/modules`, `/installations`, `/connectors`.
- `/policies`, `/capabilities`, `/approvals`, `/exceptions`.
- `/campaigns`, `/cohorts`.

Commands materiais usam endpoint ou action resource explícito, não update genérico:

- `POST /proposals/{id}/decisions`;
- `POST /experiments`;
- `POST /runs/{id}/cancel`;
- `POST /module-installation-requests`.

## 3. API rules

- IDs opacos e não enumeráveis.
- Pagination cursor-based.
- ETags/version preconditions em artifacts/decisions.
- Idempotency-Key para commands.
- Problem Details-compatible errors.
- Correlation-ID propagado.
- Authorization server-side por resource/action.
- Field-level redaction/omission por classification.
- API version e schema evolution policy.

## 4. Event envelope

CloudEvents fields:

- `specversion`;
- `id`;
- `source`;
- `type`;
- `subject`;
- `time`;
- `datacontenttype`;
- `dataschema`;
- `data`.

Extensions EvolutionOS:

- `tenantid`;
- `workspaceid`;
- `projectid` quando aplicável;
- `correlationid`;
- `causationid`;
- `traceparent`;
- `classification`;
- `schemaversion`;
- `idempotencykey` quando aplicável.

## 5. Event taxonomy

Padrão: `io.evolutionos.<context>.<entity>.<past-tense-event>.v1`.

Exemplos:

- `io.evolutionos.project.project.registered.v1`
- `io.evolutionos.project.snapshot.observed.v1`
- `io.evolutionos.evidence.evidence.ingested.v1`
- `io.evolutionos.intelligence.finding.created.v1`
- `io.evolutionos.evolution.proposal.created.v1`
- `io.evolutionos.evolution.decision.recorded.v1`
- `io.evolutionos.agent.run.started.v1`
- `io.evolutionos.agent.task.dispatched.v1`
- `io.evolutionos.verification.outcome.recorded.v1`
- `io.evolutionos.module.installation.quarantined.v1`
- `io.evolutionos.node.node.heartbeat-received.v1`

Eventos são fatos passados; commands não usam event topic indistinguível.

## 6. Delivery semantics

- At-least-once delivery.
- Consumers deduplicam `event.id` e domain idempotency key.
- Ordering somente por aggregate/partition key quando necessário.
- Out-of-order esperado em integrações.
- Poison event vai para quarantine com replay controlado.
- Schema incompatible bloqueia consumer, não descarta silenciosamente.

## 7. Event content

Eventos carregam IDs e facts suficientes para reação, não artifacts sensíveis completos. Consumer autorizado busca details pela API ou local Node. Isso limita vazamento e payload growth.

## 8. Outbox/inbox

Authoritative transaction grava state + outbox. Publisher envia e marca. Consumer usa inbox/dedup antes de side effect. Para task dispatch, lease e state machine complementam eventos.

## 9. Webhooks externos

Subscribers escolhem event types, projects e endpoint. Delivery assinado inclui replay ID. Secrets rotacionáveis. Payload respeita classification e pode conter link expiring em vez de content.

## 10. Versioning

- Adições opcionais compatíveis permanecem v1.
- Mudança semântica/breaking cria v2.
- Producer pode emitir duas versões durante migração.
- Schema registry documenta compatibility.
- Event original não é reescrito após evolução de schema.

