# ADR-009 — Evidence-first e estados epistêmicos explícitos

**Status:** Accepted  
**Data:** 2026-08-29

## Contexto

Uma plataforma que recomenda mudanças estratégicas pode produzir falsa autoridade. Fontes variam em qualidade; modelos inferem; dados entram em conflito; decisões precisam ser auditáveis.

## Decisão

Separar Observation, Evidence, Claim, Finding, Proposal e Decision. Rotular conteúdo como fact, inference, hypothesis, recommendation ou decision. Preservar provenance, contradiction e confidence decomposition. Nenhuma claim material se apoia no LLM como fonte.

## Consequências

- Lineage navegável e confiança explicável.
- Mais entities/storage/UI complexity.
- Permite contestação e reavaliação.
- Evita que summary destrua nuances essenciais.

## Rejeitado

- Texto de relatório como source of truth.
- Confidence única gerada pelo modelo.
- Tratar múltiplas cópias da mesma notícia como corroboration independente.

## Review triggers

- Modelo torna a UX impraticável; simplificar view, não semântica.
- Novos standards de AI/evidence provenance cobrem o domínio.
- Customer research mostra outra taxonomia mais compreensível sem perda de rigor.

