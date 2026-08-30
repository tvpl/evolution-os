# Método, limitações e ledger de fontes

## 1. Escopo pesquisado

- modernização contínua, refatoração e remediation em escala;
- observabilidade e drift de arquitetura;
- arquitetura como código;
- product discovery, research e market intelligence;
- agent lifecycle, evals e harness engineering;
- Agent Skills, MCP, A2A e empacotamento de extensões;
- supply chain, policy e observability standards;
- evolução longitudinal de software por agentes;
- discussões públicas sobre drift, coerência e software factories.

## 2. Fonte e confiança

Ordem de preferência:

1. especificação, documentação oficial ou paper original;
2. repositório/projeto oficial;
3. página do fornecedor para capability declarada;
4. análise independente;
5. fórum, somente como sinal anedótico.

Claims comerciais não foram convertidos em prova de desempenho. Papers recentes foram lidos com suas limitações. A inexistência de um concorrente unificado não pode ser provada por busca pública.

## 3. Gap matrix final

| Claim material | Suporte principal | Contradição/limite | Confiança | Implicação |
|---|---|---|---|---|
| Loops contínuos de análise/remediação já são produto | AWS Transform | Foco em software/tech debt | Alta | Não competir como scanner genérico |
| Transformação determinística é viável em escala | OpenRewrite/Moderne | Cobertura depende de linguagem/recipe | Alta | Rules/AST antes de LLM quando possível |
| Arquitetura pode ser declarada em formato validável | FINOS CALM | Adoção e versão ainda evoluem | Alta | Adapter, não acoplamento interno |
| Agentes falham mais em sequência longa | EvoClaw | Benchmark recente e recorte limitado | Alta para prudência, média para generalização | Evals longitudinais e autonomia progressiva |
| Skills acumulam dívida operacional | SkillOps | Avaliação parcialmente sintética | Média | Lifecycle e contracts de skills/modules |
| MCP resolve integração de tools/context | MCP spec | Não resolve orquestração/app governance | Alta | MCP adapter, não kernel |
| Mercado já cobre sinais de produto/mercado | Productboard, Dovetail, Feedly | Não os conecta ao sistema observado | Alta | Integrar em vez de substituir |
| Nenhum produto público cobre a tese completa | Landscape consultado | Produtos privados/novos podem existir | Média | Posicionar como combinação, validar em entrevistas |

## 4. Fontes primárias e oficiais

### Modernização e arquitetura

- [AWS Transform Continuous Modernization — User Guide](https://docs.aws.amazon.com/transform/latest/userguide/continuous-modernization.html)
- [AWS Transform Continuous Modernization — Product](https://aws.amazon.com/transform/continuous-modernization/)
- [OpenRewrite Documentation](https://docs.openrewrite.org/)
- [Moderne — Tech Stack Modernization](https://moderne.ai/use-cases/tech-stack-modernize)
- [KAVIA — Product Overview](https://kavia.ai/product-overview)
- [vFunction](https://vfunction.com/)
- [CodeScene](https://codescene.com/)
- [FINOS CALM](https://calm.finos.org/)
- [Revieko — Architecture Drift Radar](https://github.com/marketplace/revieko-architecture-drift-radar)
- [ArchCodex](https://github.com/ArchCodexOrg/archcodex)
- [Erode — Architecture Drift](https://github.com/marketplace/actions/erode-architecture-drift)
- [ArcKit](https://github.com/tractorjuice/arc-kit)

### Produto, sinais e avaliação

- [Productboard](https://www.productboard.com/)
- [Dovetail](https://dovetail.com/)
- [Feedly Market Intelligence](https://feedly.com/market-intelligence)
- [LangSmith Evaluation](https://www.langchain.com/langsmith/evaluation)
- [Promptfoo — Evaluate Coding Agents](https://www.promptfoo.dev/docs/guides/evaluate-coding-agents/)

### Protocolos e padrões

- [Agent Skills — Specification](https://agentskills.io/specification)
- [MCP — Architecture](https://modelcontextprotocol.io/docs/2026-07-28/learn/architecture)
- [MCP — Security Best Practices](https://modelcontextprotocol.io/docs/2026-07-28/tutorials/security/security_best_practices)
- [MCP — Authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)
- [A2A Project](https://github.com/a2aproject/a2a)
- [Linux Foundation — A2A announcement](https://www.linuxfoundation.org/press/linux-foundation-launches-the-agent2agent-protocol-project-to-enable-secure-intelligent-communication-between-ai-agents)
- [CloudEvents](https://cloudevents.io/)
- [OpenTelemetry Specifications](https://opentelemetry.io/docs/specs/otel/)
- [OCI Image and Distribution 1.1](https://opencontainers.org/posts/blog/2024-03-13-image-and-distribution-1-1/)
- [Sigstore Cosign](https://docs.sigstore.dev/cosign/signing/other_types/)
- [SPDX](https://spdx.dev/)
- [SLSA v1.2](https://slsa.dev/spec/v1.2/)
- [Open Policy Agent](https://openpolicyagent.org/docs)
- [Next.js App Router](https://nextjs.org/docs/app)
- [Next.js Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers)

### Pesquisa

- [EvoClaw: Evaluating AI Agents on Continuous Software Evolution](https://arxiv.org/abs/2603.13428), Deng et al., 2026-03-13.
- [SkillOps: Managing LLM Agent Skill Libraries as Self-Maintaining Software Ecosystems](https://arxiv.org/abs/2605.13716), Pu, Song e Zhao, 2026-05-13.
- [DocSync](https://arxiv.org/html/2605.02163), 2026.
- [Agentic Technical Debt](https://arxiv.org/html/2605.29129v1), 2026.
- [Codebase cognitive debt](https://www.thoughtworks.com/en-us/radar/techniques/codebase-cognitive-debt), Thoughtworks Technology Radar.

## 5. Discussões públicas consultadas

- [Why Software Factories Fail](https://news.ycombinator.com/item?id=49023019)
- [The unreasonable effectiveness of an LLM agent loop](https://news.ycombinator.com/item?id=43998472)
- [What AI coding costs you](https://news.ycombinator.com/item?id=47194847)
- [AI Army Unleashed](https://github.com/githubnext/gh-aw/discussions/10334)
- [Architecture as Code: What's the Point?](https://www.reddit.com/r/softwarearchitecture/comments/1g4s81c/architecture_as_code_whats_the_point/)

## 6. Limitações

- Não houve entrevistas com clientes, fornecedores ou mantenedores.
- Não foram testados produtos comerciais em trial/piloto.
- Preço, SLAs, contratos e limites de uso não foram comparados.
- Roadmaps e capacidades privadas não são observáveis.
- Datas e estados de produtos podem mudar após 2026-08-29.
- Alguns papers de 2026 ainda podem ser revisados, atualizados ou contestados.
- A pesquisa em fóruns é amostragem qualitativa, não survey representativo.

## 7. Próxima evidência necessária

Antes de implementação substancial:

1. 10–15 entrevistas em três perfis: founder/solo, platform/AI lead e enterprise architecture.
2. Três design partners com dados reais e restrições diferentes.
3. Benchmark do baseline automático em cinco stacks.
4. Spike CALM import/export e OCI module package.
5. Threat modeling com um CISO externo.
6. Comparativo hands-on com AWS Transform, Moderne e duas ferramentas de drift.
7. Medição do custo por proposal aceita e outcome verificado.
8. Validação de willingness-to-pay para o wedge de harness evolution.

## 8. Critério de parada da pesquisa

A pesquisa foi encerrada quando cada claim consequential tinha fonte primária/oficial ou limitação explícita, novas buscas passaram a retornar variações das mesmas categorias e nenhum candidato adicional alterou a síntese central. Isso é suficiente para arquitetura de descoberta e planejamento; não substitui due diligence comercial ou testes hands-on.

