# Slice 7 — Module Lifecycle Specification

## Problem Statement

Até o Slice 6, todo aumento de capacidade do EvolutionOS (sensors, analyzers, skills, policies, connectors) foi hardcoded no próprio Hub — não existe um jeito de empacotar, assinar, distribuir, instalar, atualizar com diff de permissão, colocar em quarentena ou reverter uma extensão sem tocar o núcleo. O ADR-007 (Accepted) define Module como a unidade instalável e governável; o ADR-008 (Proposed) exige um spike de assinatura/SBOM/provenance antes de aceitar OCI+Sigstore como mecanismo de distribuição real. Este slice entrega esse spike E o vertical slice de module lifecycle mandatado pelo [build-sequence](../../../docs/06-delivery/05-build-sequence.md) (Slice 7): "Local module dev format; Module manifest and capabilities; Signature/SBOM/provenance spike; Install/lock/update permission diff; Sandbox/quarantine/rollback; Private registry."

**Fonte de verdade**: [PRD-005](../../../docs/01-product/PRD-005-module-ecosystem.md) (ecossistema de módulos, MOD-FR-001..016), [módulos/skills/MCP](../../../docs/02-architecture/05-modules-skills-mcp.md) (capability naming, tool-risk taxonomy), [module package spec](../../../docs/07-specifications/02-module-package-spec.md), [ADR-007](../../../docs/04-decisions/ADR-007-module-skill-mcp-boundaries.md) (Accepted), [ADR-008](../../../docs/04-decisions/ADR-008-oci-signed-module-packages.md) (Proposed — este slice é o spike que a decisão exige antes de aceitar), épico EP-050.

## Goals

- [x] Um publisher pode declarar um manifest de módulo (identidade, versão, components, capabilities) e publicá-lo no registry privado do org, recebendo digest, assinatura e SBOM verificáveis.
- [x] Instalar uma versão de módulo num projeto exige que toda capability declarada pelo módulo já tenha grant no org; sem isso, a instalação é bloqueada, nunca elevada silenciosamente.
- [x] Cada instalação produz uma entrada de lockfile (module/version/digest/capabilities/installedAt) rastreável por projeto, com histórico append-only.
- [x] Atualizar para uma versão que introduz uma capability nova é bloqueado até essa capability ser concedida — nunca eleva permissão silenciosamente (MOD-FR-013, PRD-005 critério de aceite).
- [x] Uma instalação pode ser colocada em quarentena (bloqueia updates) e revertida (rollback) para uma versão anterior já provada por aquele projeto, sem apagar histórico de versões anteriores (MOD-FR-012).

## Out of Scope

| Feature | Reason |
| --- | --- |
| Distribuição real via OCI registry (GHCR etc.) | ADR-008 é Proposed e lista exatamente este spike como pré-requisito antes de aceitar OCI; sem credenciais de registry confirmadas neste ambiente, o "registry privado" deste slice é o próprio Hub/Postgres — mesma disciplina de deferimento do ADR-013 aplicada a infraestrutura de distribuição |
| Sigstore/cosign (Fulcio OIDC + Rekor transparency log) | Nenhuma identidade OIDC/CA confirmada neste ambiente; a assinatura deste slice usa um par de chaves Ed25519 gerado e mantido localmente por org — criptografia real, autoridade de identidade não real (custódia de chave privada em Postgres é uma simplificação de MVP documentada em Risks & Concerns, não prática de produção) |
| Execução real de qualquer component (sensor/analyzer/skill/executor) | Este slice gerencia o CICLO DE VIDA do pacote (declarar, publicar, instalar, atualizar, quarentena, rollback, desinstalar) — nunca invoca código do módulo; mesmo padrão de deferimento de execução real usado pelo Harness (Slice 6) e pelo `GitHubActionConnector` (Slice 5) |
| Resolução de compatibilidade contra uma versão real de protocolo Hub/Node | Não existe ainda nenhum eixo de versionamento de protocolo Hub/Node no código (nenhuma ocorrência de "protocol version" no repositório); inventar um agora fabricaria um contrato não ancorado. O manifest DECLARA `compatibility` (ranges de SemVer) e essa declaração é validada apenas sintaticamente; resolvê-la contra uma versão real de runtime fica para quando esse eixo existir |
| Scan de vulnerabilidade real | Nenhum scanner integrado neste ambiente; o campo `vulnerabilityScan` é aceito e armazenado como referência opaca, nunca executado |
| SBOM conformante a SPDX real / provenance SLSA real | O spike prova a MECÂNICA (SBOM determinístico derivado do manifest, provenance com publisher+timestamp); conformidade formal ao schema SPDX/SLSA é trabalho de integração posterior, não deste spike |
| UI de marketplace (PRD-005 §7) | Responsabilidade do `apps/console`, fora do escopo do Hub (mesmo precedente do Slice 6 Harness Observatory) |
| Múltiplos publishers por módulo / transferência de ownership | MVP assume 1 publisher = 1 org; um módulo pertence ao org que o publicou primeiro |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Modelagem de "module" | Entidade de primeira classe distinta de `project` (ao contrário do harness, que reusou `projects`): tabelas `modules`, `module_versions`, `module_installations`, `module_publisher_keys` | Um módulo é publicado uma vez e instalado N vezes em N projetos — não cabe na forma de `projects` (1:1 com um harness); a relação módulo↔projeto é N:M por natureza | y |
| Digest da versão | `sha256:<hex>` de `canonicalJson(manifest)`, reusando `apps/hub/src/platform/canonical-json.ts` (extraído no Slice 4) sem duplicar uma terceira implementação | Mesmo formato já usado por `registry.ts`/`canonicalDigest` (Slice 0); reuso direto em vez de inventar um quarto esquema de digest | y |
| Assinatura | Ed25519 sobre os bytes do digest, com par de chaves gerado uma única vez por org na primeira publicação (`module_publisher_keys`, PK `org_id`), pública e privada persistidas em Postgres | Criptografia assimétrica real (`node:crypto`), prova a mecânica de assinar/verificar/detectar adulteração exigida pelo spike do ADR-008, sem depender de uma CA externa | y |
| SBOM | Lista determinística de components + suas capabilities, derivada do manifest publicado, formato JSON próprio (`sbomFormat: "evolutionos-sbom-v0"`), não SPDX real | Prova que o SBOM é gerado deterministicamente a partir do manifest verificado, sem inventar conformidade formal que este ambiente não pode validar | y |
| Provenance | JSON `{publisherOrgId, publishedAt}` | Suficiente para provar proveniência mínima (quem publicou, quando) sem simular uma attestation SLSA completa | y |
| Registry privado | Catálogo Postgres escopado por org (`modules`/`module_versions`); nenhuma distribuição pública | Satisfaz diretamente o critério de aceite do PRD-005 "um módulo privado pode ser publicado e instalado sem marketplace público" | y |
| Policy check de capabilities do módulo | Cada string de capability declarada pelo manifest (comparada literalmente, sem parsing de wildcard/qualifier) precisa ter uma linha em `capability_grants` para o org — mesmo mecanismo deny-by-default do Slice 0, reusado sem duplicar um segundo motor de policy | "Reuse is king": o motor de `checkCapability`/`capability_grants` já existe e já é deny-by-default; inventar um segundo mecanismo de aprovação de capability contradiria esse princípio já estabelecido desde o Slice 0 | y |
| Meta-capability do slice | `module.write` (convenção `<domain>.<resource>.<action>` já em uso desde o Slice 0) cobre publish/install/update/quarantine/rollback/uninstall; concedida aos dois tenants dev na mesma edição | Consistente com uma capability por domínio por slice (harness.write, experiment.write, connector.write, ...) | y |
| Imutabilidade de versão | `(module_id, version)` é único; publicar a mesma versão com o MESMO manifest é replay idempotente (retorna a versão existente); publicar a mesma versão com manifest DIFERENTE é 409 | Espelha a semântica de content-addressing do OCI ("SemVer imutável" do module package spec) sem exigir um `Idempotency-Key` de cliente — a própria versão já é a chave natural | y |
| Escopo de rollback | Rollback só pode alvejar uma versão que já esteja no histórico de lock DAQUELE projeto (já instalada por ele antes); nunca reintroduz uma versão nunca aprovada pelo policy check daquele projeto | Rollback restaura um estado já provado, nunca instala silenciosamente uma versão nova por essa porta lateral | y |
| Verificação de assinatura no install | Toda instalação recomputa o digest do manifest armazenado e reverifica a assinatura contra a chave pública do org antes de instalar; falha bloqueia com 409 | É o valor central do spike — provar que uma adulteração pós-publicação é detectada e bloqueia instalação, não é decorativa | y |

**Open questions:** none - all resolved or logged above.

---

## User Stories

### P1: Publicar um manifest de módulo assinado ⭐ MVP

**User Story**: As a publisher, I want declarar e publicar um manifest de módulo versionado so that o módulo fique disponível no registry privado do meu org com digest, assinatura e SBOM verificáveis.

**Why P1**: É o degrau zero — sem publicação, não há o que instalar.

**Acceptance Criteria**:

1. WHEN a client publishes a module manifest with `id`, `version` (SemVer), `publisher`, and at least one component (`id`, `type`, `capabilities`) THEN the system SHALL persist it as a new module version, compute its canonical digest, sign the digest with the org's Ed25519 publisher key (generating one on first publish for that org), generate a deterministic SBOM listing its components and their capabilities, and return `{moduleId, version, digest, signature, sbom}`.
2. IF a client publishes the same `id`+`version` with a manifest IDENTICAL (same canonical digest) to one already published THEN the system SHALL return the existing version's digest/signature/sbom unchanged (idempotent replay), never creating a second row.
3. IF a client publishes the same `id`+`version` with a manifest producing a DIFFERENT digest than the one already published THEN the system SHALL reject it with 409.
4. IF a client publishes a manifest missing `id`, `version`, `publisher`, with zero components, with a component `type` outside `{sensor, analyzer, skill, policyPack, connector, mcpAdapter, executor, uiContribution, ontologyExtension, evalPack, transformation}`, or with `version` not a valid SemVer string THEN the system SHALL reject it with 422.

**Independent Test**: Publicar um módulo com 1 component `sensor` declarando 1 capability; conferir `digest`/`signature`/`sbom` na resposta; publicar de novo com o MESMO manifest e conferir que retorna o mesmo digest (replay); mudar 1 campo e publicar a mesma versão de novo, conferindo 409.

---

### P1: Verificar assinatura e SBOM na leitura

**User Story**: As a consumer, I want verificar a assinatura de uma versão publicada ao lê-la so that eu confie que o pacote não foi adulterado antes de instalar.

**Why P1**: Sem verificação na leitura, a assinatura é decorativa — o valor do spike do ADR-008 é justamente provar que adulteração é detectável.

**Acceptance Criteria**:

1. WHEN a client reads a published module version THEN the system SHALL return its manifest, digest, signature, SBOM, provenance, and `signatureValid: true`, computed by re-verifying the stored signature against a freshly recomputed canonical digest and the org's stored public key.
2. IF the persisted manifest row no longer matches its recorded digest (tampering, e.g. a field changed after signing) THEN reading that version SHALL return `signatureValid: false` rather than throwing or returning stale trust.

**Independent Test**: Publicar uma versão e lê-la, conferindo `signatureValid: true`; alterar diretamente a linha persistida do manifest (simulando adulteração fora do fluxo normal) e ler de novo, conferindo `signatureValid: false`.

---

### P1: Instalar um módulo com policy check e lockfile

**User Story**: As a project owner, I want instalar uma versão publicada de um módulo no meu projeto so that as capabilities que ele declara sejam checadas contra o policy do meu org antes de qualquer ativação, e a instalação fique registrada num lockfile rastreável.

**Why P1**: É o coração do slice — publicar sem instalar não produz valor demonstrável.

**Acceptance Criteria**:

1. WHEN a client installs a published module version into a project AND every capability the module declares already has a grant for the project's org THEN the system SHALL persist a lockfile entry (`moduleId`, `version`, `digest`, `capabilities`, `installedAt`), the installation SHALL become `active`, and a lock history row SHALL be appended.
2. IF any capability the module declares has NO grant for the project's org THEN the system SHALL reject the install with 422, listing the exact missing capabilities, and no installation or lock entry SHALL be persisted.
3. IF a client installs an unknown module or an unknown version of a known module THEN the system SHALL reject it with 404.
4. IF the module version's stored signature does not verify against its recomputed digest at install time THEN the system SHALL reject the install with 409 `signature_invalid`, and no installation SHALL be persisted.
5. WHEN a client reads a project's lockfile THEN the system SHALL return every active installation with its exact locked digest, version, and capabilities.

**Independent Test**: Conceder a capability declarada por um módulo ao org; instalar o módulo no projeto e conferir status `active` e a entrada no lockfile; revogar a capability e tentar instalar um segundo módulo que a exige, conferindo 422 com a lista de capabilities faltando.

---

### P1: Atualizar com diff de permissão bloqueante

**User Story**: As a project owner, I want que atualizar um módulo instalado calcule o diff de permissão entre a versão atual e a nova so that nenhuma capability nova seja concedida sem aprovação explícita (MOD-FR-013).

**Why P1**: É a garantia central do PRD-005 — "atualização nunca eleva permissões silenciosamente".

**Acceptance Criteria**:

1. WHEN a client updates an active installation to a published newer version whose declared capabilities are all already granted for the project's org THEN the system SHALL update the lockfile entry to the new version/digest, append a new lock history row (never overwriting the previous one), and return the permission diff (`added: []`, `removed: [...]` when the new version drops a capability).
2. IF the new version declares a capability NOT already granted for the project's org THEN the system SHALL reject the update with 422, returning the exact `added` capability diff, and the lockfile SHALL remain on the prior version.
3. WHEN the missing capability is subsequently granted and the same update is retried THEN the system SHALL succeed.

**Independent Test**: Instalar a v1 de um módulo sem capabilities; publicar uma v2 que adiciona uma capability não concedida; tentar atualizar e conferir 422 com `added` listando essa capability; conceder a capability, repetir a atualização, e conferir sucesso com o lockfile agora na v2.

---

### P1: Quarentena e rollback

**User Story**: As a project owner, I want colocar uma instalação problemática em quarentena e revertê-la para uma versão anterior já usada por esse projeto so that eu recupere um estado bom sem perder o rastro do que aconteceu.

**Why P1**: Fecha o lifecycle mandatado pelo PRD-005 (`... → quarantine/rollback → uninstall`).

**Acceptance Criteria**:

1. WHEN a client quarantines an active installation THEN its status SHALL become `quarantined`.
2. IF a client attempts to update a `quarantined` installation THEN the system SHALL reject it with 409.
3. WHEN a client rolls back an installation (active or quarantined) to a version previously locked by that SAME project's lock history THEN the lockfile entry SHALL revert to that version/digest, a new lock history row SHALL be appended (the old rows SHALL remain queryable), and status SHALL become `active`.
4. IF a client rolls back to a version NEVER previously locked by that same project THEN the system SHALL reject it with 409 — rollback only replays proven history, never installs an unproven version.

**Independent Test**: Instalar v1, atualizar para v2 (histórico agora tem v1 e v2), colocar em quarentena, rollback para v1 e conferir status `active` + lockfile na v1 + histórico ainda lista as 3 entradas (v1, v2, v1-de-novo); tentar rollback para uma v3 nunca instalada por esse projeto e conferir 409.

---

### P1: Desinstalar preservando histórico; listar o registry privado

**User Story**: As a project owner, I want desinstalar um módulo sem apagar o rastro de versões que ele já teve so that decisões e evidências anteriores continuem íntegras; e as a publisher, I want listar os módulos do meu registry privado so that eu veja o que já publiquei.

**Why P1**: Entrega de valor visível do registry privado + garante a integridade histórica exigida pelo PRD-005 ("desinstalar não apaga evidências e decisões").

**Acceptance Criteria**:

1. WHEN a client uninstalls an active or quarantined installation THEN its status SHALL become `uninstalled` and all of its lock history rows SHALL remain queryable (never deleted).
2. IF a client attempts to update or rollback an `uninstalled` installation THEN the system SHALL reject it with 409.
3. WHEN a client lists an org's published modules THEN the system SHALL return every module with its latest published version's digest and current `signatureValid` status.
4. IF a client accesses any route introduced by this slice cross-tenant THEN the system SHALL return 403.

**Independent Test**: Instalar, desinstalar, conferir status `uninstalled` e que o histórico de lock ainda existe; tentar atualizar a instalação desinstalada e conferir 409; listar os módulos do org e conferir que o módulo publicado aparece com seu digest.

---

## Edge Cases

- IF a client reinstalls the exact same module+version into a project where it is already `active` THEN the system SHALL treat it as an idempotent no-op, returning the existing lock entry unchanged (no duplicate lock history row).
- WHEN a module version declares zero capabilities THEN install and update SHALL succeed without requiring any grant (a capability-less module is always installable).
- IF a client accesses any new route cross-tenant THEN the system SHALL return 403.
- IF `sbom`/`provenance` generation is requested for a manifest with duplicate component `id`s THEN the system SHALL reject the publish with 422 (component IDs must be unique within a manifest).

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| MODL-01 | P1: Publicar — persiste, digest, assina, gera SBOM | Execute | Implementing |
| MODL-02 | P1: Publicar — replay idempotente (mesmo digest) | Execute | Implementing |
| MODL-03 | P1: Publicar — rejeita mesma versão com digest diferente (409) | Execute | Implementing |
| MODL-04 | P1: Publicar — rejeita manifest malformado (422) | Execute | Implementing |
| MODL-05 | P1: Verificação — leitura retorna signatureValid true | Execute | Implementing |
| MODL-06 | P1: Verificação — adulteração retorna signatureValid false | Execute | Implementing |
| MODL-07 | P1: Instalar — sucesso com policy check e lockfile | Execute | Implementing |
| MODL-08 | P1: Instalar — rejeita capability sem grant (422) | Execute | Implementing |
| MODL-09 | P1: Instalar — rejeita módulo/versão desconhecidos (404) | Execute | Implementing |
| MODL-10 | P1: Instalar — rejeita assinatura inválida (409) | Execute | Implementing |
| MODL-11 | P1: Instalar — leitura do lockfile do projeto | Execute | Implementing |
| MODL-12 | P1: Atualizar — sucesso com diff de permissão | Execute | Implementing |
| MODL-13 | P1: Atualizar — rejeita capability nova sem grant (422) | Execute | Implementing |
| MODL-14 | P1: Atualizar — sucesso após conceder a capability faltando | Execute | Implementing |
| MODL-15 | P1: Quarentena — bloqueia updates | Execute | Implementing |
| MODL-16 | P1: Rollback — reverte para versão provada pelo projeto | Execute | Implementing |
| MODL-17 | P1: Rollback — rejeita versão nunca provada (409) | Execute | Implementing |
| MODL-18 | P1: Desinstalar — preserva histórico de lock | Execute | Implementing |
| MODL-19 | P1: Desinstalar — rejeita update/rollback pós-desinstalação (409) | Execute | Implementing |
| MODL-20 | P1: Registry — lista módulos do org | Execute | Implementing |

**ID format:** `MODL-NN`

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

**Coverage:** 20 total, 0 mapped to tasks (mapeado na fase Tasks), 0 unmapped — cada ID cita sua âncora na spec acima.

---

## Success Criteria

- [x] `validate_spec.py` sai 0 para esta spec.
- [x] O vertical slice completo roda ponta a ponta: publicar módulo assinado com SBOM → instalar com policy check e lockfile → atualizar com diff de permissão bloqueante → quarentena → rollback para versão provada → desinstalar preservando histórico.
- [x] Uma tentativa de instalar uma versão cuja assinatura foi adulterada é bloqueada com 409, nunca instalada silenciosamente.
- [x] Nenhuma capability nova é concedida a um módulo sem grant explícito do org, em install OU update.
- [ ] Verifier independente reporta PASS em `validation.md`.
