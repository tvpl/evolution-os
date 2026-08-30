# ADR-007 — Module é a unidade instalável

**Status:** Accepted  
**Data:** 2026-08-29

## Contexto

Skills carregam instruções; MCP expõe tools/resources. Nenhum descreve sozinho lifecycle, isolamento, SBOM, UI, policy, evals e compatibility de uma extensão completa.

## Decisão

Module é a unidade instalável e governável. Pode conter sensors, analyzers, skills, policies, connectors/MCP adapters, executors, UI contributions, schemas e evals. Skill nunca concede permission; MCP nunca substitui policy ou event bus.

## Consequências

- Marketplace e enterprise governance coerentes.
- Pacotes mais complexos que copiar `SKILL.md`.
- Permite módulos somente-skill leves.
- Capability mapping e sandbox tornam-se centrais.

## Review triggers

- Agent Skills standard evolui para package/security model completo.
- OCI module overhead inviabiliza community adoption; poderá existir dev format, mantendo production contract.
- MCP adiciona trustworthy package lifecycle sem conflitar com boundaries.

