# Control Plane e Evolution Node

## 1. Por que federar

Centralizar todo código e dado simplifica demos, mas inviabiliza soberania, latência, air-gap e adoção enterprise. Executar tudo localmente inviabiliza portfolio intelligence e aprendizagem compartilhada. A federação combina os dois.

## 2. Autoridade

| Dado/ação | Hub | Node | Regra |
|---|---:|---:|---|
| Tenant/users/policies org | Autoridade | Cache | Hub authoritative quando managed |
| Manifest versionado no repo | Projection | Autoridade local | Conflito exige reconciliação |
| Código e secrets | Sem posse por padrão | Autoridade | Nunca sincronizar implicitamente |
| Evidence externa pública | Autoridade compartilhada | Cache | Deduplicável por digest |
| Snapshot técnico | Metadata/projection | Autoridade observada | Sync conforme classificação |
| Proposal/decision | Autoridade | Cache/participant | Strong version checks |
| Execution/proof local | Metadata | Autoridade inicial | Artifacts aprovados podem subir |
| Module policy | Catálogo/allowlist | Enforcement | Node sempre revalida |

## 3. Registro do Node

1. Admin cria enrollment token de uso único ou workload federation.
2. Node gera/obtém key pair e apresenta attestation.
3. Hub associa tenant, workspace, projects e capability ceiling.
4. Node recebe trust bundle e policies iniciais.
5. Heartbeat anuncia version, health, modules e capabilities.
6. Rotação de identidade ocorre sem reinstalação.

Node comprometido pode ser revogado; tasks futuras são negadas; resultados posteriores à revogação são quarentenados.

## 4. Task dispatch

Task contém:

- immutable task ID;
- tenant/project/node binding;
- intent e plan reference;
- capabilities máximas;
- input references e classifications;
- module/model constraints;
- deadline/lease;
- idempotency token;
- expected proof;
- signature.

Node valida assinatura, binding, expiry, policy local e disponibilidade antes de aceitar. O Node pode reduzir capabilities ou recusar, nunca ampliá-las.

## 5. Data minimization modes

### `metadata-only`

Envia versões, counts, hashes, estados e findings sem trechos de código.

### `derived-only`

Permite entidades/relations e summaries redigidos, com política de transformação testada.

### `artifact-approved`

Cada artifact requer classificação/approval ou regra explícita.

### `full-sync`

Permitido apenas em deployment controlado e explicitamente configurado.

Cada campo sincronizado carrega policy decision e Node attestation.

## 6. Offline e conflito

Node usa local sequence e spool. Ao reconectar:

- eventos duplicados são ignorados por ID;
- decisões obsoletas falham por version guard;
- snapshots coexistem por observedAt;
- artifact edits conflitantes criam reconciliation item;
- task lease expirada não é retomada sem renew;
- side effect incerto passa a `unknown_requires_reconciliation`.

## 7. Compatibilidade

Hub publica protocol ranges. Node anuncia supported ranges. Uma task só é enviada se houver interseção. Features novas usam capability negotiation. Breaking protocol exige janela de coexistência e upgrade campaign.

## 8. Standalone-to-managed

Um projeto local pode se registrar posteriormente:

1. exporta inventory de IDs e digests;
2. Hub busca conflitos/duplicates;
3. usuário escolhe workspace e classification;
4. decisions e evidence são importadas preservando autoria;
5. Node passa a managed sem trocar project ID.

## 9. Threat boundaries

- Hub não confia em conteúdo do Node apenas por estar registrado.
- Node não confia em task apenas por vir de rede corporativa.
- Module não confia em host data além do capability contract.
- External source não pode influenciar instruction channel.
- Coding agent não recebe credential material.

## 10. SLOs conceituais

- Enrollment success > 99,9% excluindo identity provider.
- Heartbeat freshness configurável; padrão Team 5 min.
- Dispatch at-least-once com execução exactly-once-effect via idempotência.
- Sync retomável após interrupção.
- Revogação efetiva antes de aceitar nova task.

