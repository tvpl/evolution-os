# ADR-006 — CloudEvents, outbox e durable workflows

**Status:** Accepted  
**Data:** 2026-08-29

## Contexto

Runs agentic duram além de requests, têm waits humanos e partial failures. Hub/Node e connectors geram eventos. Precisamos de portabilidade sem tentar obter exactly-once delivery impossível em todas as fronteiras.

## Decisão

- Envelope CloudEvents-compatible.
- At-least-once delivery e idempotent consumers.
- Transactional outbox/inbox.
- Durable workflow engine para orchestration, leases, timers e interventions.
- API síncrona apenas para commands curtos e queries.

## Consequências

- Resiliência e auditabilidade de runs.
- Requer idempotency, schema registry e reconciliation.
- Broker/workflow technology permanece adapter.
- Ordem global não é assumida.

## Rejeitado

- Synchronous agent chain dentro de HTTP request.
- Kafka/event broker como workflow engine improvisado.
- Exactly-once claim sem idempotent side effects.

## Review triggers

- Lite profile precisa de engine menor; interface será mantida.
- Workflow provider limita portability.
- Event volume/latency exige revisão de broker/topology.

