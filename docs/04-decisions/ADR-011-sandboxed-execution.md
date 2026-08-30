# ADR-011 — Execução agentic isolada e mediada por capabilities

**Status:** Accepted  
**Data:** 2026-08-29

## Contexto

Agentes e módulos processam conteúdo não confiável, executam scripts e podem acessar ferramentas de escrita. Executá-los no host com credentials ambientais amplos cria risco inaceitável.

## Decisão

Tasks de análise/execução rodam em workspace efêmero com filesystem, network, process, compute e time limits. Capability broker media tools e credentials. Sandboxing implementation varia por profile, mas contract é comum.

## Consequências

- Reduz supply-chain, injection e accidental damage.
- Aumenta setup, latency e resource cost.
- Lite profile pode usar OS sandbox com guarantees explícitos; enterprise usa containers/VM/WASM conforme risco.
- Scripts de skill herdam sandbox do módulo.

## Rejeitado

- Confiar apenas em model instruction.
- Dar shell irrestrito com secrets in env.
- Considerar container sozinho boundary suficiente sem config.

## Review triggers

- Novo sandbox runtime oferece melhor portability/security.
- Workloads exigem GPU/desktop e precisam profiles próprios.
- Performance cost inviabiliza low-risk pure analyzers; R0 pode usar isolation leve validado.

