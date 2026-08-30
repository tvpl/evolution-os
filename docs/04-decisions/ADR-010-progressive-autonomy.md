# ADR-010 — Autonomia progressiva e aprovação vinculada ao plano

**Status:** Accepted  
**Data:** 2026-08-29

## Contexto

O valor da plataforma aumenta quando executa; o risco também. Aprovação genérica de “deixar o agente trabalhar” não controla blast radius nem plan drift.

## Decisão

Autonomia A0–A5 é limitada por organization, project, agent/module/tool, data/environment e exact task grant. Aprovação referencia digest do proposal/plan/change; alteração material invalida aprovação. Read-only default; material actions exigem proof e separação de funções.

## Consequências

- Usuário entende e controla expansão de autonomia.
- Mais policy/approval UX e state management.
- Permite automação de classes determinísticas com confiança conquistada.
- Falha de policy resulta em deny para ação material.

## Rejeitado

- Autonomy toggle global.
- Aprovação por silêncio.
- Elevação automática baseada somente em taxa de aceite.

## Review triggers

- Evidence mostra que níveis são confusos ou não predizem risco.
- Regulação exige controles adicionais.
- Formal verification permite nova classe automatizada.

