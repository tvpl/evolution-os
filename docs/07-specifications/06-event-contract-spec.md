# Especificação — Eventos e idempotência

## 1. Envelope

Eventos conformam ao CloudEvents. O payload `data` possui schema URI/version. Extensions sensíveis usam IDs e não human labels quando necessário.

## 2. Required extensions

- `tenantid`.
- `workspaceid`.
- `correlationid`.
- `causationid` when caused by event/command.
- `classification`.
- `schemaversion`.
- `traceparent` when available.

`projectid` é requerido para event project-scoped.

## 3. Semantics

- Event representa fato ocorrido.
- Source owns meaning and schema.
- Consumers cannot infer authorization from event delivery.
- Sensitive details fetched via authorized API/Node.
- Event time and observation/source time are distinct in data.

## 4. Idempotency

### Commands

Client supplies idempotency key scoped to tenant/action. Server stores request digest and result. Reuse with different digest conflicts.

### Consumers

Inbox records event ID before/atomically with effect when possible. Duplicate returns prior result/no-op.

### External writes

Connector maps internal idempotency to provider primitive, marker or reconciliation query. Unknown outcome never treated as failed automatically.

## 5. Ordering

- Aggregate events include aggregate ID/version.
- Consumer applies next valid version or queues gap.
- Some observations are time-series and can arrive out of order.
- No cross-aggregate total order.

## 6. Evolution

- Additive optional fields compatible.
- Required/semantic change creates event v2.
- Consumers ignore unknown fields and preserve extensions when forwarding is allowed.
- Producers dual-publish during migration if needed.
- Historical events remain original.

## 7. Failure handling

- Transient retry with backoff/jitter.
- Permanent contract/policy failure to quarantine.
- Poison message does not block partition indefinitely.
- Replay is explicit, authorized and audited.
- Replay cannot repeat external side effect without idempotency/reconciliation.

## 8. Example event

```json
{
  "specversion": "1.0",
  "id": "evt_01J...",
  "source": "urn:evolutionos:node:node_123",
  "type": "io.evolutionos.project.snapshot.observed.v1",
  "subject": "projects/prj_123/snapshots/snp_456",
  "time": "2026-08-29T12:00:00Z",
  "datacontenttype": "application/json",
  "dataschema": "https://schemas.evolutionos.io/events/project-snapshot-observed/v1.json",
  "tenantid": "ten_123",
  "workspaceid": "wrk_123",
  "projectid": "prj_123",
  "correlationid": "run_123",
  "causationid": "task_123",
  "classification": "internal",
  "schemaversion": "1",
  "data": {
    "snapshotId": "snp_456",
    "observedAt": "2026-08-29T11:59:30Z",
    "syncMode": "metadata-only",
    "digest": "sha256:..."
  }
}
```

