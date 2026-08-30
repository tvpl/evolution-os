# ADR-015 — Código e dados sensíveis permanecem locais por default

**Status:** Accepted  
**Data:** 2026-08-29

## Contexto

Enviar repositórios, telemetry ou customer data ao Hub/model provider pode violar segurança, contrato ou regulação. Muitas análises precisam somente de metadata/derived facts.

## Decisão

Node processa código e restricted data localmente por padrão. Cada workspace define sync mode: metadata-only, derived-only, artifact-approved ou full-sync. Model routing respeita residency; local/approved models podem ser obrigatórios. Hub não presume acesso a raw content.

## Consequências

- Adoção enterprise e air-gap.
- Menos contexto central; análises divididas Hub/Node.
- Derived-data leakage precisa threat modeling.
- Debug/support requer customer-controlled artifacts.
- UX mostra claramente o que sai do ambiente.

## Rejeitado

- Full repo cloning como requisito.
- “Não armazenamos” como substituto de data boundary.
- Enviar snippets ao modelo sem classificação.

## Review triggers

- Confidential computing/secure enclaves comprovam boundary melhor.
- Usuários optam por full-sync em deployment controlado.
- Derived-only reduz qualidade abaixo do aceitável; oferecer escolha, não remover default seguro.

