# ADR-014 — Tenancy e capability security server-side

**Status:** Accepted  
**Data:** 2026-08-29

## Contexto

EvolutionOS contém estratégia, código e ações materiais de várias organizações. RBAC simples não expressa project, environment, classification, duration e tool action. Agents não são principals soberanos.

## Decisão

Identity estabelece tenant/workspace membership; server derives scope. RBAC cobre papéis; ABAC/capability policies cobrem resource/action/context. Agents atuam usando delegated grants temporários ligados a user/workload/run. Enforcement ocorre em API, connector gateway e Node.

## Consequências

- Least privilege granular e auditável.
- Policy design/testing complexos.
- UI deve explicar denial/approval route.
- Cache/index/background task também precisa tenant enforcement.

## Rejeitado

- Tenant ID confiado do client payload.
- Agent role como service account global.
- UI hiding como autorização.
- Credentials diretas no prompt.

## Review triggers

- Policy engine escolhido não escala ou não é explicável.
- Fine-grained authorization standard adotado oferece melhor interoperability.
- Customer isolation requirements exigem physical tenancy tiers.

