# Architecture Decision Records

| ADR | Decisão | Status |
|---|---|---|
| [ADR-001](ADR-001-federated-control-plane-node.md) | Control Plane central + Evolution Nodes federados | Accepted |
| [ADR-002](ADR-002-open-contracts-local-first.md) | Contratos abertos e operação local-first | Accepted |
| [ADR-003](ADR-003-nextjs-console-bff.md) | Next.js como console/BFF, não runtime agentic | Accepted |
| [ADR-004](ADR-004-modular-monolith-first.md) | Modular monolith e workers antes de microservices | Accepted |
| [ADR-005](ADR-005-relational-source-graph-projection.md) | Relacional como SoR e grafo como projeção | Accepted |
| [ADR-006](ADR-006-events-and-durable-workflows.md) | CloudEvents + durable workflows + outbox | Accepted |
| [ADR-007](ADR-007-module-skill-mcp-boundaries.md) | Module é unidade instalável; Skill/MCP são componentes | Accepted |
| [ADR-008](ADR-008-oci-signed-module-packages.md) | OCI artifacts assinados para módulos | Proposed |
| [ADR-009](ADR-009-evidence-first-epistemic-model.md) | Evidence-first e estados epistêmicos explícitos | Accepted |
| [ADR-010](ADR-010-progressive-autonomy.md) | Autonomia progressiva e aprovação vinculada ao digest | Accepted |
| [ADR-011](ADR-011-sandboxed-execution.md) | Execução agentic isolada e capability-brokered | Accepted |
| [ADR-012](ADR-012-architecture-as-code-calm.md) | CALM como representação interoperável preferencial | Proposed |
| [ADR-013](ADR-013-model-provider-abstraction-eval-gates.md) | Modelos plugáveis, qualificados por task/evals | Accepted |
| [ADR-014](ADR-014-tenant-and-capability-security.md) | Tenancy + capability security server-side | Accepted |
| [ADR-015](ADR-015-source-code-locality.md) | Código permanece local por default | Accepted |

## Política de ADR

- Accepted é a base da implementação.
- Proposed exige spike/validação antes de dependência irreversível.
- Superseded nunca é apagado; aponta para novo ADR.
- Toda decisão inclui review triggers.
- Mudança material de contrato ou trust boundary exige ADR.

