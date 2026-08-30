# ADR-005 — Relacional como source of record e grafo como projeção

**Status:** Accepted  
**Data:** 2026-08-29

## Contexto

Impact analysis é naturalmente graph-shaped. Porém, tenancy, approvals, workflows, versioning e transactional consistency favorecem banco relacional. Embeddings não preservam semântica das relações.

## Decisão

PostgreSQL será source of record inicial. Relações fundamentais são armazenadas explicitamente. Graph/search/vector são projeções reconstruíveis. Um graph database dedicado só entra após benchmark de queries/escala.

## Consequências

- Operação e transações mais simples no MVP.
- Knowledge model não depende de vendor específico.
- Recursive queries podem limitar escala inicial.
- Projection lag precisa ser visível.
- Exige event/outbox para manter projeções.

## Rejeitado

- Neo4j/graph-only como source of truth inicial.
- Vector-only knowledge memory.
- JSON blobs sem relações tipadas.

## Review triggers

- Query p95/complexity não atende mesmo com indexes/materialization.
- Portfolio graphs excedem capacidade prática.
- Graph algorithms demonstram valor material impossível na projeção atual.

