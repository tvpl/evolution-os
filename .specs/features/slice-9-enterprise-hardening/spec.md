# Slice 9 — Enterprise Hardening Specification

## Problem Statement

Até o Slice 8, o EvolutionOS decide, executa e coordena mudanças através de um portfolio inteiro — mas nenhuma das operações administrativas que um cliente enterprise exige antes de confiar dados estratégicos ao produto existe ainda: não há como desligar um Node comprometido, provar que o audit trail não foi adulterado, exportar essa trilha para auditoria externa, aplicar uma janela de retenção sobre evidência sensível, ou desprovisionar um usuário que saiu da organização. Este é o último slice do roadmap de 10 slices ([build-sequence](../../../docs/06-delivery/05-build-sequence.md), Slice 9): "SSO/SCIM, KMS, residency, retention, audit export, Node fleet, self-hosted, performance and DR."

**Fonte de verdade**: [Segurança e threat model](../../../docs/02-architecture/08-security-threat-model.md) (§4 Identity/Secret management, §7 Multi-tenancy, §8 Evidence integrity, §10 STRIDE Repudiation, §12 Incident response — kill switch, revoke identities), [NFRs](../../../docs/01-product/09-non-functional-requirements.md) (NFR-SEC-001/006/010, NFR-RES-006, NFR-OBS-005), [ADR-001](../../../docs/04-decisions/ADR-001-federated-control-plane-node.md) (Hub/Node federado), [ADR-014](../../../docs/04-decisions/ADR-014-tenant-and-capability-security.md) (tenancy/capability server-side, Accepted), épicos EP-031, EP-053, EP-054.

## Goals

- [x] Um Node pode ser revogado (kill switch) por um admin do org; a partir daí toda tentativa de autenticação daquele Node é negada, reusando sem alteração a checagem de `revoked_at` que o Slice 2 já lê mas nunca escreve.
- [x] Todo novo `audit_log` entry encadeia um hash com o entry anterior do mesmo org (tamper-evident); uma verificação de cadeia detecta com precisão o ponto exato de uma adulteração direta no banco.
- [x] Um admin pode exportar a trilha de auditoria inteira do org, incluindo o veredito de integridade da cadeia, sem depender de uma ferramenta externa de auditoria.
- [x] Um org pode configurar uma janela de retenção para evidência e disparar uma varredura que redige (nunca deleta) o conteúdo bruto de evidência mais antiga que a janela, preservando decisões e claims que a referenciam.
- [x] Um usuário pode ser desprovisionado (desativado); a partir daí ele não consegue mais obter uma nova sessão, embora tokens já emitidos sigam a mesma semântica stateless já existente desde o Slice 0 (ver Assumptions).

## Out of Scope

| Feature | Reason |
| --- | --- |
| SSO/OIDC real (login federado com um IdP externo) | Nenhuma credencial de identity provider confirmada neste ambiente (mesma razão do ADR-013 aplicada aqui pela primeira vez a identity); `dev-login` continua sendo o único mecanismo de login, e a desativação de usuário só passa a bloqueá-lo — nenhum fluxo OIDC/SAML é implementado |
| Revogação de sessão já emitida | Sessões são tokens HMAC stateless sem tabela de sessão desde o Slice 0 (`verifySession` é criptografia pura, sem lookup no banco) — desativar um usuário bloqueia NOVAS sessões, nunca invalida uma já emitida; adicionar um lookup por request a cada chamada autenticada seria uma mudança arquitetural de todo o pipeline de auth, fora do escopo de um slice de hardening |
| Capability grants por usuário individual | `capability_grants` é workspace-wide por design desde o Slice 0/ADR-014 (`principal='*'`); desprovisionar um usuário não revoga uma permissão individual porque nenhuma existe nesse nível — mudar esse modelo é uma decisão de projeto maior que uma mudança de hardening |
| KMS/customer-managed keys reais | Nenhuma credencial de cloud KMS confirmada neste ambiente; deferido pelo mesmo padrão ADR-013 |
| Data residency / enforcement multi-região | Este ambiente roda uma única instância Postgres; não há infraestrutura multi-região contra a qual aplicar/testar residency |
| Backup/restore/DR reais testados (NFR-RES-006) | Exigiria infraestrutura de backup real; nenhuma ferramenta de backup está disponível para testar dry-run/restore neste ambiente |
| Monitoramento de saúde/heartbeat automático de Node | Este slice entrega apenas a revogação disparada por admin (kill switch explícito); quarentena automática por telemetria de saúde exigiria um pipeline de telemetry não confirmado |
| Reativar um usuário desativado | Deprovisioning neste MVP é uma via de mão única (kill switch), consistente com o enquadramento de Incident Response (§12: revoke, nunca "unrevoke" automático); reativação fica para uma extensão futura |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Semântica de "desativar usuário" | Bloqueia SOMENTE a emissão de uma nova sessão via `dev-login`; uma sessão já emitida continua válida até expirar (sessões atuais não têm expiração — comportamento pré-existente desde o Slice 0, não alterado por este slice) | Ser honesto sobre o que a arquitetura atual realmente garante é melhor que fabricar uma revogação de sessão que o sistema não pode cumprir; deprovisioning real de diretório (bloquear login) é o núcleo do SCIM, revogação de token é uma preocupação de camada diferente | y |
| Hash da cadeia de auditoria | `entry_hash = sha256(canonicalJson({orgId, actor, action, resource, outcome, reason, correlationId, at, prevHash}))`, encadeado por org (`prevHash` do entry anterior do MESMO org); primeiro entry de um org usa `prevHash = "genesis"` | Reusa `canonicalJson` (Slice 4) sem duplicar; encadear por org (não globalmente) mantém a verificação O(entries do org), consistente com todo o resto do sistema sendo tenant-scoped (ADR-014) | y |
| Redação de evidência (retention sweep) | `content_excerpt = NULL` + `redacted_at = now()`; a linha NUNCA é deletada, `content_digest` permanece (prova de que algo existiu, sem o conteúdo sensível) | Mesmo padrão de "nunca apagar, sempre marcar" já usado por quarantine/rollback (Slices 6/7); decisions/claims que referenciam a evidência continuam íntegras (lineage preservada, NFR-SEC-006 + NFR-OBS-005 simultaneamente) | y |
| Escopo da política de retenção | Uma política por org (`evidenceRetentionDays`), aplicada a TODA evidência do org independente de projeto | MVP; nenhuma doc-fonte pede granularidade por projeto/classification neste slice | y |
| Meta-capability do slice | `admin.write` cobre revogar Node, desativar usuário, configurar/disparar retenção; concedida aos dois tenants dev na mesma edição | Consistente com uma capability por domínio por slice desde o Slice 0; estas são todas operações administrativas do mesmo domínio | y |
| Leitura de audit export/fleet/users | Sem capability própria, só sessão autenticada + escopo do org (mesmo padrão do registry de módulos do Slice 7, que também não exige capability para leitura) | Reduz fricção para leitura administrativa comum sem abrir mão de tenant isolation (o org sempre vem da sessão, nunca do payload) | y |

**Open questions:** none - all resolved or logged above.

---

## User Stories

### P1: Kill switch de Node (fleet) ⭐ MVP

**User Story**: As an org admin, I want revogar um Node comprometido e listar a frota so that ele pare de poder se autenticar imediatamente (threat model §12 Incident response).

**Why P1**: É o controle de incident response mais direto e o Slice 2 já lê `revoked_at` para negar autenticação — só falta o lado de escrita.

**Acceptance Criteria**:

1. WHEN an admin revokes a Node THEN the system SHALL set its `revoked_at` and, from that point on, that Node's authentication SHALL be denied (reusing the existing unchanged check).
2. WHEN an admin lists the org's Node fleet THEN the system SHALL return every Node with its exact revoked status.
3. IF an admin revokes an unknown Node or a Node from another org THEN the system SHALL reject it with 404.
4. WHEN an admin revokes an already-revoked Node THEN the system SHALL treat it as an idempotent no-op (no error, `revoked_at` unchanged).
5. IF a client attempts to revoke a Node without the `admin.write` capability in their own org THEN the system SHALL return 403 (the fleet list route requires no capability and derives its org exclusively from the session, so it has no cross-tenant path to redirect to another org's data — see Assumptions).

**Independent Test**: Enrolar um Node (Slice 2), confirmar que ele autentica; revogá-lo; confirmar que a mesma autenticação agora falha; listar a frota e conferir o status revogado.

---

### P1: Cadeia de auditoria tamper-evident

**User Story**: As a compliance reviewer, I want que cada entrada de audit log encadeie com a anterior so that uma adulteração direta no banco seja detectável, não apenas assumida como impossível (NFR-SEC-010, STRIDE Repudiation).

**Why P1**: Sem isso, "audit trail" é só uma tabela — qualquer um com acesso ao banco poderia editar uma linha sem deixar rastro.

**Acceptance Criteria**:

1. WHEN a new audit entry is recorded THEN the system SHALL compute its hash chained to the immediately preceding entry of the SAME org, or to a fixed genesis value for that org's first entry.
2. WHEN the chain is verified for an org whose entries were never altered outside `recordAudit` THEN the system SHALL report the chain as valid.
3. IF an audit entry is altered directly (bypassing `recordAudit`) THEN verifying the chain SHALL report it invalid, identifying the exact entry where the chain breaks.

**Independent Test**: Gerar 3 audit entries num org (via qualquer ação já auditada, ex. uma negação de capability); verificar a cadeia (`valid: true`); alterar diretamente a `rationale`/`reason` de uma entrada no meio; verificar de novo e conferir `valid: false` com o id exato da quebra.

---

### P1: Exportar auditoria do org

**User Story**: As a compliance reviewer, I want exportar toda a trilha de auditoria do meu org com o veredito de integridade da cadeia so that eu tenha uma prova auditável sem depender de acesso direto ao banco (NFR-OBS-005, "audit export" do build-sequence).

**Why P1**: É a entrega de valor visível da cadeia tamper-evident — sem exportação, a garantia de integridade fica presa dentro do banco.

**Acceptance Criteria**:

1. WHEN an admin exports the org's audit trail THEN the system SHALL return every entry in order, together with the chain's overall validity verdict (reusing the same verification as the standalone check, unchanged).
2. WHILE an org has zero audit entries THE system SHALL return an empty list with a valid (vacuously true) chain, not an error.
3. IF a client requests another org's audit export THEN the system SHALL never include entries from an org other than the one derived from their own session.

**Independent Test**: Gerar audit entries em dois orgs diferentes (dev-a e dev-b); exportar como dev-a e conferir que só as entradas de dev-a aparecem, nunca as de dev-b.

---

### P1: Política de retenção e varredura de evidência

**User Story**: As an org admin, I want configurar uma janela de retenção para evidência e disparar uma varredura que redige o conteúdo antigo so that dados sensíveis não fiquem retidos além do necessário, sem quebrar a proveniência de decisões já tomadas (NFR-SEC-006).

**Why P1**: É o requisito de retenção configurável explícito do NFR-SEC-006, e o único jeito de cumprir "direito ao esquecimento" sem invalidar decisões históricas.

**Acceptance Criteria**:

1. WHEN an admin sets a positive integer retention window (in days) for the org THEN the system SHALL persist it.
2. IF an admin sets a retention window that is not a positive integer THEN the system SHALL reject it with 422.
3. IF an admin triggers a sweep before any retention window is configured for the org THEN the system SHALL reject it with 422.
4. WHEN a sweep runs with a retention window configured THEN the system SHALL redact (`content_excerpt = NULL`, `redacted_at` set) every evidence row of that org older than the window, WITHOUT deleting the row, and SHALL return the exact count redacted.
5. WHEN a sweep runs THEN evidence within the retention window SHALL remain completely untouched.
6. WHEN evidence is redacted THEN any decision or claim referencing it SHALL remain fully intact (lineage preserved) — only the evidence row's own excerpt is cleared.

**Independent Test**: Criar duas evidências num projeto, uma com `created_at` manualmente ajustado para além da janela e outra dentro dela; configurar a retenção; disparar a varredura; conferir que só a mais antiga foi redigida (excerpt nulo, digest preservado) e que uma decision/claim que referencia a evidência antiga continua legível.

---

### P1: Desprovisionar um usuário

**User Story**: As an org admin, I want desativar um usuário que saiu da organização so that ele não consiga mais obter uma nova sessão, com a lista de usuários mostrando quem está ativo (NFR-SEC-001, threat model §12 "revoke identities").

**Why P1**: É a metade determinística e implementável do requisito SCIM deste ambiente — bloquear login é o núcleo do deprovisioning.

**Acceptance Criteria**:

1. WHEN an admin deactivates a user THEN the system SHALL set that user's `deactivated_at`.
2. WHEN a deactivated user attempts `dev-login` THEN the system SHALL reject it with 401, distinguishing this from an unknown identity.
3. IF an admin deactivates an unknown user or a user from another org THEN the system SHALL reject it with 404.
4. WHEN an admin deactivates an already-deactivated user THEN the system SHALL treat it as an idempotent no-op.
5. WHEN an admin lists the org's users THEN the system SHALL return every user with their exact active/deactivated status.

**Independent Test**: Fazer login com um dev user; desativá-lo; tentar login de novo com o mesmo email e conferir 401 (distinto do erro de "usuário desconhecido"); listar usuários e conferir o status desativado.

---

## Edge Cases

- IF a client accesses any route introduced by this slice cross-tenant THEN the system SHALL return 403.
- WHEN the audit chain check runs for an org with exactly one entry THEN the system SHALL treat it as valid by construction (its `prevHash` is the genesis value, nothing to compare against).
- IF a sweep finds zero evidence rows older than the window THEN the system SHALL return a count of `0`, not an error.
- WHEN a Node is revoked and later the SAME Node id attempts to re-enroll THEN the system SHALL follow whatever the existing Slice 2 enrollment rule already defines for a duplicate id (no new behavior introduced by this slice).

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| HARD-01 | P1: Node fleet — revoga e nega autenticação subsequente | Execute | Verified |
| HARD-02 | P1: Node fleet — lista com status exato | Execute | Verified |
| HARD-03 | P1: Node fleet — rejeita Node inexistente/outro org (404) | Execute | Verified |
| HARD-04 | P1: Node fleet — idempotência ao revogar já-revogado | Execute | Verified |
| HARD-05 | P1: Node fleet — revoke sem capability é 403 | Execute | Verified |
| HARD-06 | P1: Auditoria — novo entry encadeia hash | Execute | Verified |
| HARD-07 | P1: Auditoria — cadeia íntegra reporta válida | Execute | Verified |
| HARD-08 | P1: Auditoria — adulteração direta é detectada com o ponto exato | Execute | Verified |
| HARD-09 | P1: Auditoria — primeiro entry usa genesis | Execute | Verified |
| HARD-10 | P1: Export — retorna trilha completa + veredito de integridade | Execute | Verified |
| HARD-11 | P1: Export — nunca vaza entradas de outro org | Execute | Verified |
| HARD-12 | P1: Retenção — configura janela positiva | Execute | Verified |
| HARD-13 | P1: Retenção — rejeita janela inválida (422) | Execute | Verified |
| HARD-14 | P1: Retenção — rejeita sweep sem política configurada (422) | Execute | Verified |
| HARD-15 | P1: Retenção — sweep redige evidência antiga, conta exata | Execute | Verified |
| HARD-16 | P1: Retenção — evidência dentro da janela intocada | Execute | Verified |
| HARD-17 | P1: Retenção — lineage de decision/claim preservada | Execute | Verified |
| HARD-18 | P1: Usuários — desativa usuário | Execute | Verified |
| HARD-19 | P1: Usuários — dev-login de usuário desativado é 401 | Execute | Verified |
| HARD-20 | P1: Usuários — rejeita usuário inexistente/outro org (404) | Execute | Verified |
| HARD-21 | P1: Usuários — idempotência ao desativar já-desativado | Execute | Verified |
| HARD-22 | P1: Usuários — lista com status exato | Execute | Verified |

**ID format:** `HARD-NN`

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

**Coverage:** 22 total, 22 verified (Verifier PASS após 2 rounds — round 1 achou 1 gap major de cobertura de teste + 1 gap menor de precisão de spec, ambos corrigidos e reconfirmados do zero na round 2), 0 unmapped — cada ID cita sua âncora na spec acima. Relatório completo em `validation.md`.

---

## Success Criteria

- [x] `validate_spec.py` sai 0 para esta spec.
- [x] O vertical slice completo roda ponta a ponta: revogar um Node → sua autenticação subsequente falha; gerar audit entries → cadeia válida; adulterar uma entrada → cadeia inválida com o ponto exato; exportar a auditoria do org; configurar retenção → sweep redige evidência antiga preservando lineage; desativar um usuário → login subsequente falha.
- [x] Nenhuma linha de evidência é deletada pela varredura de retenção — apenas redigida.
- [x] Nenhuma rota deste slice vaza dado de outro org, nem por leitura nem por escrita.
- [x] Verifier independente reporta PASS em `validation.md`.
