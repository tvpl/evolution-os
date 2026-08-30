# ADR-002 — Contratos abertos e operação local-first

**Status:** Accepted  
**Data:** 2026-08-29

## Contexto

O ecossistema de agentes, MCPs, skills e providers muda rapidamente. Um formato proprietário rígido envelheceria junto com as ferramentas que pretende monitorar.

## Decisão

Definir manifests, evidence, proposals, policies e events em formatos versionados e documentados. O Node possui fluxos essenciais sem Hub. Adotar padrões existentes nas fronteiras quando adequados: Agent Skills, MCP, A2A, CloudEvents, OTel, OCI, SPDX e CALM.

## Consequências

- Export/import e self-hosting são possíveis.
- Providers podem ser substituídos.
- Exige schemas, migrations e conformance tests.
- Padrão externo não será usado quando não cobre trust/semantics; adapters isolam diferenças.

## Rejeitado

- Formatos internos não documentados para ganhar velocidade inicial.
- Usar MCP como protocolo universal.
- Depender de um model provider no domain model.

## Review triggers

- Padrão adotado perde governança/adoção ou introduz risco.
- Custo de conformance supera portabilidade comprovada.
- Novo padrão consolidado substitui uma boundary atual.

