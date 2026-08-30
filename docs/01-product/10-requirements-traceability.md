# Matriz de rastreabilidade inicial

| Capability | Requisitos primários | Arquitetura | ADRs | Validação |
|---|---|---|---|---|
| Project Registry | REG-FR-001…015 | Knowledge Model | 002, 005 | VS-01, VS-02, VS-03 |
| Evidence lineage | CORE-FR-012…015, EVO-FR-002…005 | Knowledge Model, Security | 009, 015 | VS-04, VS-09 |
| Evolution Engine | EVO-FR-001…018 | Agentic Runtime | 006, 009, 010 | VS-01…08 |
| Evolution Node | NODE-FR-001…018 | Control Plane/Node | 001, 011, 015 | VS-02, VS-07, VS-10 |
| Modules | MOD-FR-001…016 | Modules/Skills/MCP | 007, 008 | VS-08, VS-10 |
| Dashboards | UX-FR-001…012 | Next.js Experience | 003 | Usability + accessibility |
| Policy/autonomy | CORE-FR-032, 040…046 | Security, Runtime | 010, 014 | VS-06, VS-09 |
| Portfolio campaigns | CORE-FR-050…054 | System Architecture | 001, 006 | VS-03, VS-05 |
| Observability/evals | NFR-OBS, NFR-AI | Observability & Evals | 013 | VS-05, VS-07 |
| Portability | NFR-PORT | Contracts, deployment | 002, 006, 008 | Export/import tests |

O detalhamento em testes deve ligar `requirement_id` a scenario, automated test, eval case ou manual evidence. A matriz será expandida durante refinement; nenhum requisito crítico pode ficar sem método de verificação.

