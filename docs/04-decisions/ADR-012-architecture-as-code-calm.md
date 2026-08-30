# ADR-012 — CALM como representação arquitetural interoperável preferencial

**Status:** Proposed  
**Data:** 2026-08-29

## Contexto

Precisamos ligar architecture intent, visualization, controls, code e AI agents. Diagramas de imagem não são suficientes. CALM é open source, machine-readable e orientado a governance, mas ainda incubating.

## Decisão proposta

Usar um internal architecture metamodel e fornecer CALM como primeiro formato de import/export e baseline-as-code. Suportar C4/Structurizr/LikeC4 por adapters. Não tornar todo Project Twin dependente de CALM.

## Consequências positivas

- Standardização, validation e CI.
- Adequado a ambientes regulados/financeiros.
- Human-readable e agent-consumable.
- Permite controls e drift checks.

## Consequências negativas e riscos

- Spec em evolução.
- Cobertura de runtime/product/harness pode exigir extensions.
- Migração de schema.

## Alternativas consideradas

- **CALM como metamodelo interno obrigatório:** maximiza alinhamento, mas acopla produto/harness a uma especificação arquitetural em evolução.
- **C4/Structurizr ou LikeC4 como formato principal:** excelente comunicação, menor cobertura de controls e governance machine-readable.
- **Modelo interno sem padrão de import/export:** flexível no início, cria lock-in e dificulta integração enterprise.

## Spike

- Modelar três cenários: app pequeno, payment system e agentic harness.
- Import/export round-trip.
- Comparar declared versus observed.
- Gerar diagram e fitness rule.

## Review triggers

- CALM não cobre relações essenciais ou perde momentum.
- Outro standard ganha interoperabilidade superior.
- Extensions proprietárias passam a dominar o modelo.
