# Pesquisa de mercado, projetos e discussões

**Data de corte:** 2026-08-29  
**Objetivo:** entender o que já existe, como funciona, quão maduro parece e onde permanece a oportunidade do EvolutionOS.

## 1. Conclusão direta

A oportunidade não está em inventar mais um scanner, agente de código, radar de tecnologia ou dashboard de dívida. Todos já existem em diferentes níveis de maturidade. A oportunidade é o **tecido de decisão e evolução** que conecta:

1. intenção e hipótese do produto;
2. evidência externa e interna;
3. arquitetura declarada e sistema observado;
4. harness, modelos, skills, MCPs e evals;
5. propostas, aprovações, execução e verificação;
6. memória do que foi aceito, rejeitado, adiado e por quê.

Não foi identificado, na amostra consultada, um produto que cubra essa combinação integralmente desde uma ideia até um portfólio enterprise. Isso é uma inferência de pesquisa, não uma alegação de inexistência universal.

## 2. Como ler “maturidade”

| Classe | Significado nesta pesquisa |
|---|---|
| Estabelecido | Produto/projeto operacional, documentação pública substancial e caso de uso claro |
| Em crescimento | Produto real e coerente, mas categoria/cobertura ainda em formação |
| Emergente | Projeto, app ou prática com escopo útil e pouca evidência pública de escala |
| Pesquisa | Paper/benchmark; não presumir prontidão de produção |
| Padrão ativo | Especificação/ecossistema em desenvolvimento ou adoção; maturidade varia por versão |

As classes não avaliam receita, qualidade ou segurança. Claims funcionais de fornecedores continuam sendo claims de fornecedor.

## 3. Landscape principal

| Projeto/produto | O que faz | Como faz | Maturidade pública | Cobertura em relação ao EvolutionOS | Fonte |
|---|---|---|---|---|---|
| AWS Transform Continuous Modernization | Descobre repositórios, analisa tech debt, vulnerabilidades e oportunidades; agenda análises e abre PRs/MRs | Sources + scans rápidos/profundos + transformation definitions + remediação local/remota | Estabelecido | Muito próximo no loop de software, mas não é um sistema explícito de hipóteses, mercado, harness e decisão do produto | [Documentação oficial](https://docs.aws.amazon.com/transform/latest/userguide/continuous-modernization.html) |
| OpenRewrite / Moderne | Refatora e moderniza muitos repositórios | Lossless semantic trees e recipes determinísticas; Moderne orquestra em escala | Estabelecido | Excelente executor determinístico; não é o cérebro causal/portfolio de evolução | [OpenRewrite](https://docs.openrewrite.org/), [Moderne](https://moderne.ai/use-cases/tech-stack-modernize) |
| KAVIA | Conecta entendimento, planejamento, design, build, teste, modernização e operação | Code intelligence, geração de artefatos, workflows e validação | Em crescimento | Adjacente amplo e provavelmente o mais próximo no SDLC; ênfase pública continua em engenharia/codebase | [Product overview](https://kavia.ai/product-overview) |
| vFunction | Modernização e observabilidade arquitetural de aplicações complexas | Análise de runtime/código, domínio alvo e supervisão de drift | Estabelecido enterprise | Forte em arquitetura observada e modernização; não cobre integralmente descoberta de produto e harness agêntico | [Plataforma](https://vfunction.com/) |
| CodeScene | Prioriza riscos e dívida por comportamento e hotspots | Code health + histórico de mudança + análise sociotécnica | Estabelecido | Sensor/analisador valioso; não é uma malha de evolução completa | [CodeScene](https://codescene.com/) |
| FINOS CALM | Representa arquitetura de forma padronizada, versionada e validável | Schemas, patterns, controls e tooling de architecture-as-code | Padrão ativo, FINOS incubating | Ótimo adaptador para arquitetura declarada; não substitui o knowledge/evidence graph | [CALM](https://calm.finos.org/) |
| Revieko Drift Radar | Detecta drift arquitetural em pull requests | Baseline vs. mudança, hotspots e status check no GitHub | Emergente | Um gate especializado que pode virar connector/module | [GitHub Marketplace](https://github.com/marketplace/revieko-architecture-drift-radar) |
| ArchCodex | Restringe dependências/arquitetura e leva regras ao fluxo do agente | Regras versionadas e feedback de conformance | Emergente/open source | Possível policy/conformance module; não cobre relevância externa | [Repositório](https://github.com/ArchCodexOrg/archcodex) |
| Erode | Torna erosão arquitetural visível em CI | GitHub Action e regras de dependência | Emergente | Sensor/gate de escopo pontual | [GitHub Marketplace](https://github.com/marketplace/actions/erode-architecture-drift) |
| ArcKit | Organiza governança de arquitetura assistida por IA | Workflows estruturados de estratégia, design, delivery e assurance | Emergente/open source | Adjacente em governança; menos orientado a loop operacional e evidência externa | [Repositório](https://github.com/tractorjuice/arc-kit) |
| Productboard | Consolida insights e priorização de produto | Feedback, features, roadmaps e priorização | Estabelecido | Fonte de intenção/feedback e destination para decisões; não observa arquitetura/harness | [Productboard](https://www.productboard.com/) |
| Dovetail | Pesquisa e inteligência de cliente | Repositório de pesquisa, análise e síntese de feedback | Estabelecido | Source connector para evidência qualitativa | [Dovetail](https://dovetail.com/) |
| Feedly Market Intelligence | Monitora temas, empresas, tecnologia e riscos | Agregação e modelos de inteligência sobre fontes externas | Estabelecido | Sensor externo potencial; não liga evidência ao sistema executável | [Feedly](https://feedly.com/market-intelligence) |
| LangSmith | Observa e avalia aplicações/agentes | Traces, datasets, online/offline evals | Estabelecido | Executor/fonte de evals do harness | [Evaluation](https://www.langchain.com/langsmith/evaluation) |
| Promptfoo | Testa prompts, modelos e agentes | Evals declarativas, assertions e red teaming | Estabelecido/open source | Eval module/runner; não gerencia a evolução do produto | [Coding-agent evals](https://www.promptfoo.dev/docs/guides/evaluate-coding-agents/) |

## 4. Padrões e protocolos relevantes

| Padrão | Papel correto | O que ele não resolve | Decisão proposta | Fonte |
|---|---|---|---|---|
| Agent Skills | Conhecimento procedural ativável com disclosure progressivo | Empacotamento operacional, sandbox, supply chain, UI e governança de lifecycle | Skills vivem dentro ou ao lado de módulos; não são a unidade universal | [Especificação](https://agentskills.io/specification) |
| MCP | Conectar hosts de IA a tools, resources e prompts | Orquestração durable, política global, memória causal, packaging e eval governance | Adaptador de interoperabilidade com capability proxy | [Arquitetura](https://modelcontextprotocol.io/docs/2026-07-28/learn/architecture) |
| A2A | Comunicação e descoberta entre agentes/sistemas agentic | Modelo interno de produto ou política de execução | Opcional em fronteiras administrativas; não obrigatório no kernel inicial | [Projeto](https://github.com/a2aproject/a2a), [Linux Foundation](https://www.linuxfoundation.org/press/linux-foundation-launches-the-agent2agent-protocol-project-to-enable-secure-intelligent-communication-between-ai-agents) |
| CloudEvents | Envelope interoperável para eventos | Semântica do domínio e garantia de workflow | Envelope padrão com extensões EvolutionOS | [CloudEvents](https://cloudevents.io/) |
| OpenTelemetry | Traces, metrics e logs vendor-neutral | Avaliação semântica e causalidade de produto | Base de telemetria, estendida por lineage e eval artifacts | [OTel specs](https://opentelemetry.io/docs/specs/otel/) |
| OCI artifacts | Distribuição content-addressed de artefatos | Confiança do publisher e política de ativação | Candidato a transporte de modules | [OCI 1.1](https://opencontainers.org/posts/blog/2024-03-13-image-and-distribution-1-1/) |
| Sigstore/cosign | Assinatura e verificação de artefatos | Qualidade funcional ou segurança sem policy | Assinar módulos e attestations | [Cosign](https://docs.sigstore.dev/cosign/signing/other_types/) |
| SPDX + SLSA | SBOM e provenance de build | Autorização em runtime | Material obrigatório para tiers verificados | [SPDX](https://spdx.dev/), [SLSA 1.2](https://slsa.dev/spec/v1.2/) |
| OPA/Rego | Decisão de policy desacoplada | Gestão de identidade, secrets e consentimento por si só | Primeira implementação de policy engine, com contrato de domínio neutro | [OPA](https://openpolicyagent.org/docs) |

## 5. Pesquisa acadêmica e sinais de fronteira

### EvoClaw

O benchmark [EvoClaw](https://arxiv.org/abs/2603.13428) usa sequências de milestones dependentes para testar evolução contínua. Os autores relatam mais de 80% em tarefas isoladas contra no máximo 38,03% no cenário contínuo, além de regressões que se acumulam. Implicações:

- um agente “bom em tickets” não é automaticamente bom em evolução longitudinal;
- integridade entre milestones importa tanto quanto feature recall;
- exploração, testes, checkpoints e memória de arquitetura devem fazer parte do runtime;
- autonomia deve crescer com resultados observados, não com confiança declarada pelo modelo.

Limite: é um benchmark recente, com sete itinerários e custo/modelos específicos. Ele sustenta prudência; não fornece uma arquitetura pronta.

### SkillOps

[SkillOps](https://arxiv.org/abs/2605.13716) formaliza skills como contratos tipados e cria relações de dependência, compatibilidade, redundância e alternativa. O paper sugere que skills acumulam dívida e precisam de manutenção em library-time, não apenas seleção em task-time. Implicações:

- skills precisam de owners, versões, evals e critérios de aposentadoria;
- compatibilidade e redundância devem ser objetos do catálogo;
- regras baratas podem resolver parte do maintenance loop antes de usar LLM.

Limite: avaliação parcialmente sintética e baseada principalmente em ALFWorld; resultados não devem ser generalizados diretamente para engenharia enterprise.

### Documentação e dívida agentic

[DocSync](https://arxiv.org/html/2605.02163), [Agentic Technical Debt](https://arxiv.org/html/2605.29129v1) e o conceito de [codebase cognitive debt](https://www.thoughtworks.com/en-us/radar/techniques/codebase-cognitive-debt) convergem no problema de contexto que se degrada, documentação que diverge e mudanças locais que não preservam o modelo mental do sistema. Isso fundamenta snapshots, decision memory, contradictions e verification receipts.

## 6. Fóruns e discussões públicas

Essas fontes são **anedóticas**. Servem para descobrir objeções e vocabulário, não para provar prevalência.

| Discussão | Sinal observado | Uso no design |
|---|---|---|
| [Why Software Factories Fail](https://news.ycombinator.com/item?id=49023019) | Software é manutenção contínua e ownership, não geração one-shot | O produto não termina no merge |
| [AI Army Unleashed](https://github.com/githubnext/gh-aw/discussions/10334) | Alto volume de mudanças aumenta preocupação com drift silencioso | Gates arquiteturais e budgets por campanha |
| [Architecture as Code: What's the Point?](https://www.reddit.com/r/softwarearchitecture/comments/1g4s81c/architecture_as_code_whats_the_point/) | Architecture-as-code tem valor para alguns e custo de adoção para outros | Import incremental e progressive adoption |
| [The unreasonable effectiveness of an LLM agent loop](https://news.ycombinator.com/item?id=43998472) | Problemas repetidos podem virar procedimento/código barato | Promote deterministic automation após padrões estáveis |
| [What AI coding costs you](https://news.ycombinator.com/item?id=47194847) | Drift arquitetural é percebido como custo macro, diferente de higiene local | Separar quality findings de architectural coherence |

## 7. Mapa de cobertura

Legenda: **F** forte, **P** parcial, **—** fora do foco público.

| Solução | Ideia/hipótese | Sinais externos | Código/arquitetura | Harness/evals | Decisão persistida | Execução governada | Portfólio |
|---|---:|---:|---:|---:|---:|---:|---:|
| AWS Transform | — | — | F | P | P | F | F |
| Moderne/OpenRewrite | — | — | F | P | — | P | F |
| KAVIA | P | — | F | P | P | F | F |
| vFunction | — | — | F | — | P | P | F |
| CodeScene | — | — | F | — | — | — | F |
| CALM | — | — | F declarada | — | — | P via controls | P |
| Productboard/Dovetail | F | F | — | — | P | — | F |
| LangSmith/Promptfoo | — | — | P | F | — | P | F/P |
| EvolutionOS proposto | F | F | F | F | F | F | F |

## 8. O que copiar, integrar e evitar

### Copiar como princípio

- OpenRewrite/Moderne: determinismo e transformação verificável.
- AWS Transform: análise recorrente, triagem e remediação em campanhas.
- CALM: arquitetura versionável e machine-readable.
- LangSmith/Promptfoo: evals offline/online e datasets.
- Agent Skills: disclosure progressivo.
- MCP: adapters padronizados, isolados por conexão/capability.
- SkillOps: lifecycle e saúde da biblioteca.

### Integrar, não reimplementar cedo

- SCM, CI/CD, issue trackers, observability, vulnerability scanners;
- market/customer-research systems;
- policy engines, identity providers e secret managers;
- eval runners e deterministic codemods;
- CALM e formatos de SBOM/provenance.

### Evitar

- competir primeiro em code generation generalista;
- criar um grafo proprietário impossível de exportar;
- instalar tools MCP com credenciais irrestritas;
- dar uma única nota opaca de “obsolescência”;
- transformar alertas em mudanças automáticas sem avaliação causal;
- chamar marketing ou release note de evidência suficiente.

## 9. Tese de diferenciação defensável

O moat provável não é o modelo usado nem um agente específico. É a combinação acumulativa de:

- histórico de decisões e seus resultados;
- modelo temporal de projeto/portfólio;
- evidence lineage e contraditório;
- policy + approval + receipts;
- módulos versionados e avaliados;
- baselines e golden paths próprios da organização;
- dados locais preservados pelo Node;
- aprendizado de quais sinais realmente predizem valor naquele contexto.

Isso produz switching cost legítimo sem aprisionar formatos: o valor está na memória e no aprendizado organizacional, enquanto contratos permanecem exportáveis.

