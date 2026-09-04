# EvolutionOS — documentação fundadora

> Nome de trabalho. Versão documental: 1.0.0 — 29 de agosto de 2026.

EvolutionOS é um ecossistema agentic de **inteligência de evolução contínua** para ideias, produtos, sistemas de software e harnesses de IA. Ele mantém uma memória verificável do motivo pelo qual cada produto existe, como foi projetado, como foi implementado, como opera e o que mudou dentro e fora dele. A partir dessa memória, identifica riscos de obsolescência, oportunidades e inconsistências; propõe experimentos ou evoluções; e, quando autorizado, produz alterações verificáveis.

O objetivo não é perseguir toda novidade. É manter cada projeto **justificadamente atual, coerente, seguro e relevante para seu contexto**.

## O que este pacote contém

Este repositório documental foi preparado para iniciar construção com agentes de IA sem depender de conhecimento implícito. Ele inclui:

- visão, princípios, linguagem comum e limites do produto;
- PRDs do núcleo, registro de projetos, motor de evolução, nó local, marketplace e experiência;
- arquitetura para uso individual, equipes e portfólios enterprise;
- Control Plane central e Evolution Nodes autônomos por projeto;
- modelo de conhecimento e proveniência de evidências;
- catálogo de agentes, skills, MCPs, módulos e políticas;
- modelo de autonomia, aprovações, sandboxes, avaliações e observabilidade;
- ADRs das decisões estruturantes;
- diagramas Mermaid;
- especificações de manifests, módulos, propostas, evidências e eventos;
- roadmap, épicos, critérios de aceite, riscos e cenários de validação;
- pesquisa de mercado, padrões, papers, discussões, limitações e revisão crítica;
- exemplos YAML de projeto, módulo, proposta e política;
- um playbook para uma IA iniciar o desenvolvimento com segurança.

## Como navegar

1. Comece por [`docs/00-overview/00-index.md`](docs/00-overview/00-index.md).
2. Leia a [`visão executiva`](docs/00-overview/01-executive-vision.md) e os [`princípios`](docs/00-overview/02-product-principles.md).
3. Use o [`PRD da plataforma`](docs/01-product/PRD-001-core-platform.md) como contrato de produto.
4. Consulte a [`arquitetura do sistema`](docs/02-architecture/01-system-architecture.md) e o [`runtime agentic`](docs/02-architecture/04-agentic-runtime.md).
5. Antes de implementar, leia todos os [`ADRs`](docs/04-decisions/README.md).
6. Converta o [`roadmap`](docs/06-delivery/01-mvp-and-roadmap.md) em issues usando os [`épicos`](docs/06-delivery/02-implementation-epics.md); a ordem executável por feature está no [`plano de execução spec-driven`](docs/06-delivery/09-spec-driven-execution-plan.md).
7. Revise o [`landscape`](docs/08-research/01-landscape-and-sources.md) e a [`contestação crítica`](docs/08-research/03-critical-review.md) antes de ampliar o escopo.
8. Entregue o repositório a um coding agent junto com [`AGENTS.md`](AGENTS.md) e o [`playbook de bootstrap`](docs/06-delivery/07-ai-build-bootstrap.md).

## Forma do ecossistema

O produto possui quatro superfícies complementares:

1. **Evolution Hub** — Control Plane, dashboards, portfólio, políticas, conhecimento e coordenação.
2. **Evolution Node** — daemon/CLI/runner local que analisa e pilota um projeto, mesmo sem Hub.
3. **Evolution Modules** — sensores, análises, skills, políticas, conectores e executores instaláveis.
4. **Evolution Protocol** — manifests, APIs, eventos e artefatos portáveis que evitam lock-in.

## Perfis suportados

| Perfil | Exemplo | Forma mínima |
|---|---|---|
| Idea | Ideia sem código | Workspace, evidências, hipóteses, radar e challenger |
| Solo | Um repositório pessoal | Node local, SQLite opcional e relatório/PR local |
| Team | Produto com vários serviços | Hub, Postgres, workers, integrações e políticas compartilhadas |
| Enterprise | Centenas ou milhares de repositórios | Control Plane multi-tenant, Nodes privados, catálogo, campanhas e governança federada |

## Regra central

Toda recomendação deve responder:

1. **O que mudou?**
2. **Qual evidência comprova?**
3. **Por que isso é relevante para este projeto?**
4. **Quais decisões e artefatos são afetados?**
5. **Qual o benefício, custo, risco e urgência?**
6. **O que acontece se nada for feito?**
7. **Como experimentar ou reverter?**
8. **Quem deve aprovar?**
9. **Como saberemos se melhorou?**

Se alguma resposta essencial estiver ausente, o sistema deve observar ou pedir investigação — nunca inventar certeza.

## Como rodar o trust skeleton (Slice 0)

O primeiro vertical slice está implementado num monorepo pnpm (`apps/`, `packages/`). Pré-requisitos: Node 22+, pnpm 10+, binários do PostgreSQL 16.

```bash
pnpm install
bash scripts/dev-db.sh start        # cluster Postgres local (127.0.0.1:55432)
pnpm --filter @evolution-os/hub dev # Control Plane + workers (http://127.0.0.1:4010)
HUB_URL=http://127.0.0.1:4010 pnpm --filter @evolution-os/console dev # console (http://127.0.0.1:4011)
```

Entre com a identidade dev `dev-a@evolutionos.local`, registre um projeto e veja-o chegar pela projeção (UI → API → outbox → projection → UI). Evolution Node CLI:

```bash
cd apps/node
node --import tsx src/main.ts init --hub http://127.0.0.1:4010 --session <token>
node --import tsx src/main.ts enroll --name meu-node
node --import tsx src/main.ts sync --file ./artefato.txt
```

Testes e gates: `pnpm test` (unit + integração em Postgres real), `pnpm --filter @evolution-os/console test:e2e` (round-trip no browser), `python3 scripts/check_docs.py` (integridade das docs). A ordem executável das próximas features está no [`plano de execução spec-driven`](docs/06-delivery/09-spec-driven-execution-plan.md).

## Estado deste material

Este é um conjunto de documentos fundadores. Decisões marcadas como **Accepted** são a base inicial; decisões **Proposed** precisam ser validadas durante os spikes. O roadmap começa por inteligência read-only e só aumenta autonomia após avaliações e controles demonstrarem segurança.
