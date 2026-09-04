# Slice 5 — Reversible External Action Specification

## Problem Statement

Até o Slice 4, uma proposal pode ser provada por um experimento, mas nada do que o EvolutionOS decide sai do próprio sistema — não existe conector externo, nem ação real, nem prova de CI. O `AGENTS.md`/build-sequence exige que o Slice 5 feche o próximo elo: **conectar um repositório GitHub (leitura) → receber webhooks com dedup → criar uma ação externa controlada (issue/branch/draft PR, nunca merge/deploy) → registrar status de CI como prova → recuperar de side effect desconhecido sem duplicar**. Valor do slice ([sequência de construção](../../../docs/06-delivery/05-build-sequence.md), Slice 5): "proposta vira trabalho real com controle".

**Fonte de verdade**: [contratos e integrações](../../../docs/02-architecture/06-integration-contracts.md) (connector contract, webhook security, erros), [autonomia e aprovações](../../../docs/03-agents/03-autonomy-approvals.md) (A3 "Propose externally", approval ligado a digest), ADR-010 (autonomia progressiva), ADR-014 (tenancy e capability security), épicos EP-034, EP-051.

## Goals

- [x] Um projeto pode conectar um repositório GitHub declarando `owner`/`repo`, recebendo um webhook secret gerado uma única vez.
- [x] Webhooks chegam com assinatura HMAC-SHA256 validada contra o secret da conexão e deduplicados por delivery ID — replay não duplica.
- [x] Uma ação externa controlada (`issue`, `branch` ou `draftPr` — nunca merge/deploy) é criada via um conector determinístico, protegida por capability e por `Idempotency-Key` (mesmo padrão do Slice 0).
- [x] Um status de CI registrado para uma ação vinculada a um experimento vira automaticamente um proof artifact desse experimento (reuso do Slice 4), sem passo manual extra.
- [x] Repetir a criação da mesma ação com a mesma `Idempotency-Key` e o mesmo payload nunca duplica o side effect (EVO-FR-017); com payload diferente sob a mesma chave, é 409.

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Chamadas HTTP reais à API do GitHub (api.github.com) | Sem credenciais de GitHub App confirmadas neste ambiente para o produto (as credenciais desta sessão de coding são do Claude Code, não do Hub do EvolutionOS); este slice implementa a ação atrás de uma interface plugável (`GitHubActionConnector`) com um adapter determinístico — trocar por chamadas reais é extensão local quando a infra existir, mesmo padrão de deferimento do ADR-013 usado no Slice 3 |
| Fluxo real de OAuth/instalação de GitHub App | Conectar é um ato de metadado declarado (`owner`/`repo`) neste slice, não um handshake OAuth ao vivo; a autenticação real (ADR-014, `integration-contracts.md` §3) é infra de plataforma fora do alcance de um vertical slice spec-driven |
| Merge, deploy ou qualquer ação de nível A4/A5 (autonomy doc) | O build-sequence é explícito: "Create issue/branch/draft PR only" — este slice nunca aplica mudança, só propõe/rastreia |
| Motor completo de autonomy ceiling (interseção org/workspace/agent/tool/task) | Reusa o mesmo `capability_grants` deny-by-default provado desde o Slice 0; o motor ABAC/risk-class completo é EP-051, já deferido também no Slice 3 |
| Provedores de CI além do formato genérico usado aqui (context/state/targetUrl, moldado nos GitHub Checks) | Um único formato normalizado é suficiente para provar o loop; múltiplos provedores é extensão futura sem mudar o contrato |
| Rotação/gestão de webhook secret | O secret é gerado uma vez na conexão; rotação é feature de segurança operacional fora do MVP deste slice |
| Reconciliation periódica/polling ativo de estado externo | O mecanismo de recuperação de side effect desconhecido aqui é o `Idempotency-Key` (retry seguro), não um poller reconciliando estado contra o GitHub real — que exigiria as chamadas HTTP já excluídas acima |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | --------------- | --------- | ---------- |
| Adapter do conector de ação | Interface `GitHubActionConnector` com um único adapter determinístico (gera uma referência externa mock estável, ex. `mock://github/{owner}/{repo}/issues/{n}`) | Mesma decisão do `AnalysisProvider` (Slice 3): sem credenciais reais, a interface plugável cumpre o contrato de `integration-contracts.md` (Action connector) sem fingir uma chamada real | y |
| Recuperação de side effect desconhecido | `Idempotency-Key` obrigatório na criação de ação, mesmo padrão de `registerProject` (Slice 0): mesma chave + mesmo payload → retorna a ação existente; mesma chave + payload diferente → 409 | `autonomy-approvals.md` §6 exige "Unknown side effect: reconcile"; reusar um mecanismo já provado evita inventar um poller contra uma API que não existe neste ambiente | y |
| Validação de assinatura de webhook | HMAC-SHA256 sobre o JSON canônico do corpo já parseado (não sobre os bytes brutos — capturar bytes crus exigiria mudar o content-type parser do Fastify globalmente) usando o secret armazenado na conexão, comparação em tempo constante | `integration-contracts.md` §4 exige validar assinatura; a mecânica é real e testável com payloads sintéticos mesmo sem o GitHub real do outro lado; o formato exato de assinatura do GitHub real (sobre bytes crus) é uma extensão futura quando a integração ao vivo existir | y |
| Dedup de webhook | Delivery ID (header declarado pelo cliente, ex. `x-webhook-delivery`) armazenado; entrega repetida é no-op 200, não erro | `integration-contracts.md` §4: "Persistir delivery ID para deduplicação" | y |
| Vínculo ação↔experimento para proof automático | Campo opcional `experimentId` na criação da ação; um status de CI para essa ação cria+anexa um artifact ao experimento automaticamente via `createArtifact`/`attachProofArtifact` (Slice 4), inalterados | Constrói diretamente sobre o loop de prova do Slice 4 em vez de duplicar o conceito de "proof" — "CI status/proof" no build-sequence pede exatamente essa ligação | y |
| Capability nova | `connector.write` (conectar), `connector.github.write` (criar ação externa) — reusa o mesmo `capability_grants` deny-by-default | Consistente com o padrão de uma capability por operação material desde o Slice 0 | y |

**Open questions:** none - all resolved or logged above.

---

## User Stories

### P1: Conectar um repositório GitHub ⭐ MVP

**User Story**: As a responsável pelo projeto, I want conectar um repositório GitHub declarando owner/repo so that o projeto tenha um destino real para ações externas controladas.

**Why P1**: É o degrau zero — sem conexão, não há webhook nem ação externa.

**Acceptance Criteria**:

1. WHEN a client connects a GitHub repo declaring `owner` and `repo` THEN the system SHALL create the connection with `status='connected'` and return a webhook secret generated at that moment (never re-displayed afterward).
2. IF a client connects the same `owner`/`repo` pair twice for the same project THEN the system SHALL reject it with 409.
3. IF a client connects without `owner` or `repo` THEN the system SHALL reject it with 422.

**Independent Test**: Conectar `owner=acme, repo=widgets`; conferir `status=connected` e um `webhookSecret` na resposta; conectar de novo com o mesmo par e conferir 409.

---

### P1: Ingestão de webhook com dedup e assinatura

**User Story**: As a operador do conector, I want que webhooks cheguem validados e deduplicados so that um evento repetido ou forjado nunca seja processado como se fosse novo ou autêntico.

**Why P1**: `integration-contracts.md` §4 é explícito: nunca confiar em webhook sem assinatura, sempre deduplicar por delivery ID.

**Acceptance Criteria**:

1. WHEN a webhook arrives with a valid HMAC-SHA256 signature (computed from the connection's stored secret) and a delivery ID not seen before for that connection THEN the system SHALL persist the event and update the connection's `lastEventAt`.
2. IF the signature does not match THEN the system SHALL reject it with 401 without persisting the event.
3. WHEN a webhook arrives with a delivery ID already seen for that connection THEN the system SHALL treat it as a no-op — no new event row, still 200.

**Independent Test**: Enviar um webhook com assinatura válida e delivery ID novo; conferir o evento persistido; reenviar o mesmo delivery ID e conferir que a contagem de eventos não muda; enviar um com assinatura inválida e conferir 401.

---

### P1: Criar ação externa controlada (issue/branch/draftPr)

**User Story**: As a responsável pelo projeto, I want criar uma issue, branch ou draft PR a partir de uma proposal aprovada so that a decisão vire trabalho real sem eu correr o risco de duplicar o side effect numa falha de rede.

**Why P1**: É o coração de "proposta vira trabalho real com controle" — sem isso o slice não entrega valor algum.

**Acceptance Criteria**:

1. WHEN a client creates an action with `actionType` in `{issue, branch, draftPr}` and an `Idempotency-Key` header THEN the system SHALL create it via the deterministic connector adapter, persist a stable external reference, and require the `connector.github.write` capability.
2. IF `actionType` is not one of `issue`, `branch`, or `draftPr` THEN the system SHALL reject it with 422.
3. IF the same `Idempotency-Key` is replayed with the same request digest THEN the system SHALL return the already-created action instead of creating a duplicate.
4. IF the same `Idempotency-Key` is replayed with a different request digest THEN the system SHALL reject it with 409.
5. IF the client lacks the `connector.github.write` capability THEN the system SHALL reject it with 403.

**Independent Test**: Criar uma ação `issue` com uma `Idempotency-Key`; repetir a mesma requisição exata e conferir que retorna a mesma ação (sem duplicar); repetir com o mesmo header mas payload diferente e conferir 409.

---

### P1: Status de CI como proof artifact automático

**User Story**: As a responsável pelo projeto, I want que o status de CI de uma ação vinculada a um experimento vire prova automaticamente so that eu não precise anexar manualmente o que o próprio sistema já sabe.

**Why P1**: Fecha o loop com o Slice 4 — "CI status/proof" no build-sequence.

**Acceptance Criteria**:

1. WHEN a CI status update (`context`, `state`, `targetUrl`) is recorded for an existing action THEN the system SHALL persist it linked to that action.
2. WHEN a CI status update is recorded for an action that references an `experimentId` THEN the system SHALL automatically create and attach a proof artifact to that experiment via the existing Slice 4 mechanism, without any separate manual step.
3. IF the referenced action does not exist in the project THEN the system SHALL reject it with 404.

**Independent Test**: Criar uma ação com `experimentId` de um experimento `running`; registrar um status de CI para ela; conferir que o experimento passou a ter um proof artifact a mais sem chamada adicional a `POST .../artifacts`.

---

## Edge Cases

- IF a client requests a connection, action, or CI status for a resource in another project THEN the system SHALL return 404 (existence before tenant, same pattern since Slice 1).
- IF a client accesses any new route cross-tenant THEN the system SHALL return 403.
- IF a CI status update is recorded for an action with no `experimentId` THEN the system SHALL persist the status without attempting to attach any proof artifact (no error).
- IF a client creates an action without an `Idempotency-Key` header THEN the system SHALL reject it with 422.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| GH-01 | P1: Conectar — criação com webhook secret | Verified | Verified |
| GH-02 | P1: Conectar — rejeita owner/repo duplicado | Verified | Verified |
| GH-03 | P1: Conectar — rejeita sem owner/repo | Verified | Verified |
| GH-04 | P1: Webhook — assinatura válida + delivery novo persiste | Verified | Verified |
| GH-05 | P1: Webhook — assinatura inválida rejeitada | Verified | Verified |
| GH-06 | P1: Webhook — delivery repetido é no-op | Verified | Verified |
| GH-07 | P1: Ação — criação via adapter determinístico | Verified | Verified |
| GH-08 | P1: Ação — rejeita actionType inválido | Verified | Verified |
| GH-09 | P1: Ação — replay com mesmo digest retorna a existente | Verified | Verified |
| GH-10 | P1: Ação — replay com digest diferente é 409 | Verified | Verified |
| GH-11 | P1: Ação — rejeita sem capability | Verified | Verified |
| GH-12 | P1: CI status — persiste vinculado à ação | Verified | Verified |
| GH-13 | P1: CI status — vira proof artifact automático quando há experimento | Verified | Verified |
| GH-14 | P1: CI status — rejeita ação inexistente | Verified | Verified |

**ID format:** `GH-NN`

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

**Coverage:** 14 total, 0 mapped to tasks (mapeado na fase Tasks), 0 unmapped — cada ID cita sua âncora na spec acima.

---

## Success Criteria

- [x] `validate_spec.py` sai 0 para esta spec.
- [x] O vertical slice completo roda ponta a ponta: conectar repo → webhook validado e deduplicado → ação externa controlada criada com idempotência → status de CI vira proof artifact automático no experimento vinculado.
- [x] Repetir a criação da mesma ação com a mesma `Idempotency-Key` e o mesmo payload nunca cria uma segunda linha (EVO-FR-017 provado ponta a ponta).
- [x] Nenhuma ação de merge/deploy é possível através de nenhum endpoint deste slice.
- [x] Verifier independente reporta PASS em `validation.md`.
