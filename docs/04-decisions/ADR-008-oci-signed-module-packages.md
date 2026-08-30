# ADR-008 — OCI artifacts assinados para módulos

**Status:** Proposed  
**Data:** 2026-08-29

## Contexto

Precisamos distribuir modules, skill bundles, policies, WASM/container artifacts, schemas, SBOM e provenance por registries públicos/privados, com digest e assinatura.

## Decisão proposta

Empacotar módulo como OCI artifact, pinado por digest. Usar Sigstore/cosign ou enterprise equivalent para assinatura e attestations; SPDX para SBOM. Registry é substituível.

## Consequências positivas

- Ecossistema de registries existente.
- Content addressing e referrers.
- Suporte a private mirror/air-gap.
- Signatures, SBOMs e provenance associados.

## Consequências negativas e riscos

- Complexidade para autor casual.
- Variações de suporte entre registries.
- Pacote precisa de media types e conformance próprios.
- Runtime components multiplataforma exigem estratégia.

## Alternativas consideradas

- **Arquivo ZIP/TAR em object storage:** simples, mas sem distribuição, digest, referrers e tooling de registry equivalentes.
- **Pacotes npm como unidade universal:** boa experiência TypeScript, cobertura insuficiente para WASM, containers e artefatos multi-runtime.
- **Registry/protocolo proprietário:** maior controle e maior lock-in/custo de supply chain; rejeitar salvo requisito não coberto após o spike.

## Spike antes de aceitar

- Publicar módulo contendo skill + policy + WASM analyzer.
- Assinar, gerar SBOM, instalar, verificar, atualizar e rollback.
- Testar GHCR e registry privado.
- Testar offline bundle e permission diff.

## Review triggers

- Standard package system de Agent Skills se consolida com segurança equivalente.
- Registry support impede portabilidade.
- WASI component registries oferecem modelo superior compatível.
