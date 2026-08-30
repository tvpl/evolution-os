# ADR-004 — Modular monolith e workers antes de microservices

**Status:** Accepted  
**Data:** 2026-08-29

## Contexto

O domínio ainda está sendo descoberto. Microservices antecipados cristalizariam fronteiras erradas e aumentariam custo operacional. Jobs agentic e connectors, porém, precisam de processos isoláveis e escala própria.

## Decisão

Implementar Control Plane como modular monolith com bounded contexts explícitos, banco transacional e internal domain events. Workers/runners podem ser processos/deployments separados desde o início. Extrair serviços somente por sinais medidos.

## Consequências

- Transações e mudanças de schema mais simples.
- Menor custo de MVP.
- Boundary tests e package/module rules são obrigatórios.
- Workers protegem web/API de jobs longos.
- Futuras extrações usam outbox/events e APIs já estabelecidas.

## Sinais de extração

- SLO, escala, segurança/residência, ownership ou cadence independentes.
- Repeated contention/failure isolation need.

## Review triggers

- Um context domina recursos ou deployment cadence.
- Enterprise isolation exige boundary física.
- Team ownership amadurece e contract está estável.

