# ADR-013 — Providers plugáveis e qualificação por task

**Status:** Accepted  
**Data:** 2026-08-29

## Contexto

Modelos mudam rapidamente em qualidade, custo, tools, context e policy. Um harness otimizado para um modelo pode regredir em outro. Fallback não qualificado pode violar residência ou segurança.

## Decisão

Model Router usa provider adapters e eligibility por task/risk/data. Model/prompt/skill bundles passam por eval, shadow e canary antes de promoção. Fallback somente para variantes qualificadas. Toda run registra versões.

## Consequências

- Evita lock-in e permite otimização contextual.
- Exige normalized interfaces sem esconder provider features relevantes.
- Eval matrix e cost aumentam.
- Model upgrade é mudança controlada, não config instantânea em produção material.

## Rejeitado

- Um modelo universal fixo.
- Automatic latest model.
- Fallback para qualquer provider disponível.

## Review triggers

- Provider standardizes agent runtime suficientemente.
- Model behavior se torna determinístico para classes específicas.
- Cost de multi-provider supera valor; ainda preservar adapter boundary.

