# PRD-001 — Plataforma EvolutionOS

**Status:** Accepted for discovery and MVP  
**Owner:** Product & Architecture  
**Escopo:** Ecossistema completo e primeiro vertical slice

## 1. Contexto

Projetos perdem relevância ou coerência porque seus artefatos e sinais vivem separados. Produto acompanha feedback; engenharia acompanha dependências; arquitetura registra ADRs; segurança acompanha vulnerabilidades; equipes de IA acompanham modelos e evals. A decisão transversal depende de pessoas que raramente possuem todo o contexto e tempo necessário.

EvolutionOS deve criar uma memória operacional capaz de correlacionar essas dimensões e produzir decisões evolutivas justificadas.

## 2. Problema de usuário

“Tenho uma ideia, produto, sistema ou harness que preciso manter relevante e tecnicamente saudável, mas não consigo acompanhar todas as mudanças externas e internas, entender o que realmente me afeta nem preservar por que cada decisão foi tomada.”

## 3. Objetivos

- Registrar qualquer iniciativa antes ou depois de existir código.
- Criar um Project Twin incremental e verificável.
- Observar fontes internas e externas sem conceder escrita por padrão.
- Detectar mudanças, riscos, oportunidades e contradições.
- Gerar Evolution Proposals explicáveis e acionáveis.
- Permitir decisão humana e preservar aprendizado.
- Executar experimentos ou mudanças somente dentro da autonomia autorizada.
- Operar standalone e federado usando os mesmos contratos.
- Ser extensível por módulos, skills, políticas e conectores assinados.

## 4. Não objetivos iniciais

- Substituir GitHub/GitLab, Jira/Linear, observability backends ou ferramentas de CI.
- Hospedar código-fonte como requisito.
- Fazer auto-merge de mudanças arquiteturais ou de produto.
- Prever sucesso comercial com uma pontuação opaca.
- Construir um modelo fundacional próprio.
- Suportar todo tipo de integração no MVP.
- Criar um marketplace público antes da segurança do pacote modular estar validada.

## 5. Personas primárias

- Founder ou criador individual.
- Product manager / product strategist.
- Tech lead / software architect.
- Platform engineering / modernization lead.
- AI engineering / harness owner.
- Security, risk ou compliance reviewer.
- Engineering leader responsável por portfólio.

Detalhes em [Personas e JTBD](07-personas-and-jtbd.md).

## 6. Proposição de valor

### Para um projeto

Uma caixa de entrada de mudanças realmente relevantes, cada uma conectada a evidências, decisões e artefatos atingidos.

### Para uma organização

Uma visão do portfólio que mostra onde obsolescência, dívida, risco ou perda de diferenciação estão se formando e permite campanhas coordenadas sem retirar autonomia das equipes.

### Para agentes

Contexto confiável e sob demanda sobre intenção, arquitetura, restrições e decisões; ferramentas limitadas por capacidade; e feedback estruturado para aprender com resultados.

## 7. Conceito operacional

O produto executa ciclos contínuos:

1. **Observe:** sensors capturam mudanças e snapshots.
2. **Understand:** o Cartographer liga dados ao Project Twin.
3. **Challenge:** especialistas agentic testam premissas e detectam drift.
4. **Propose:** o Planner produz uma proposta completa.
5. **Decide:** políticas encaminham para aprovação, rejeição ou experimento.
6. **Execute:** runners atuam em sandbox, issue tracker ou SCM.
7. **Verify:** testes, evals, fitness functions e métricas avaliam resultado.
8. **Learn:** memória e baselines são atualizados explicitamente.

## 8. Requisitos funcionais

### Registro e Project Twin

- **CORE-FR-001:** cadastrar projeto dos tipos `idea`, `product`, `system`, `service`, `repository`, `harness`, `portfolio` ou tipo estendido.
- **CORE-FR-002:** relacionar projetos por composição, dependência, implementação, ownership e influência.
- **CORE-FR-003:** importar ou criar um manifest versionado.
- **CORE-FR-004:** registrar objetivos, restrições, hipóteses, métricas e horizonte.
- **CORE-FR-005:** anexar ou referenciar PRDs, ADRs, specs, diagramas e repositórios.
- **CORE-FR-006:** manter timeline e versões do Twin.
- **CORE-FR-007:** registrar decisões rejeitadas e review triggers.

### Observação

- **CORE-FR-010:** instalar sensors por projeto ou organização.
- **CORE-FR-011:** executar observações manuais, agendadas ou por evento.
- **CORE-FR-012:** classificar fontes e dados por sensibilidade e confiabilidade.
- **CORE-FR-013:** armazenar evidência bruta quando permitido ou referência/hash quando não permitido.
- **CORE-FR-014:** deduplicar sinais preservando múltiplas fontes.
- **CORE-FR-015:** detectar conflitos entre fontes sem resolvê-los silenciosamente.

### Inteligência

- **CORE-FR-020:** ligar sinal a entidades e decisões afetadas.
- **CORE-FR-021:** calcular relevância, impacto, urgência, custo, risco, confiança e reversibilidade como dimensões separadas.
- **CORE-FR-022:** executar analyzers determinísticos antes dos agentes de julgamento.
- **CORE-FR-023:** gerar findings com evidências favoráveis e contrárias.
- **CORE-FR-024:** comparar estado observado com baseline e metas.
- **CORE-FR-025:** identificar ausência de contexto crítico e solicitar investigação.

### Propostas e decisão

- **CORE-FR-030:** gerar Evolution Proposal conforme especificação.
- **CORE-FR-031:** suportar decisões `accept`, `reject`, `defer`, `investigate`, `experiment`, `supersede`.
- **CORE-FR-032:** encaminhar aprovação por risco, projeto, domínio e ação.
- **CORE-FR-033:** registrar autor humano/agente, justificativa e evidências da decisão.
- **CORE-FR-034:** converter proposta em issue, experimento, ADR, spec, campaign ou change set.
- **CORE-FR-035:** impedir que uma mesma recomendação rejeitada reapareça sem nova evidência ou review trigger.

### Execução e verificação

- **CORE-FR-040:** executar experimento em workspace efêmero.
- **CORE-FR-041:** delegar implementação a coding agent autorizado.
- **CORE-FR-042:** criar branches/PRs sem modificar branch protegida diretamente.
- **CORE-FR-043:** executar verificações declaradas pela proposta.
- **CORE-FR-044:** comparar métricas antes/depois.
- **CORE-FR-045:** emitir resultado `verified`, `failed`, `inconclusive`, `rolled_back` ou `expired`.
- **CORE-FR-046:** incorporar resultado sem reescrever a evidência histórica.

### Portfólio e campanhas

- **CORE-FR-050:** agregar saúde, relevância e risco por projeto, domínio, owner e tecnologia.
- **CORE-FR-051:** criar campaign a partir de um finding comum.
- **CORE-FR-052:** permitir baseline organizacional com exceções locais justificadas.
- **CORE-FR-053:** comparar progresso sem criar um ranking punitivo de equipes.
- **CORE-FR-054:** exportar evidência e auditoria de decisões.

### Extensibilidade

- **CORE-FR-060:** instalar, habilitar, desabilitar e atualizar módulos.
- **CORE-FR-061:** validar assinatura, proveniência, compatibilidade e permissões antes da instalação.
- **CORE-FR-062:** ativar skills por progressive disclosure.
- **CORE-FR-063:** expor MCPs por gateway e capabilities, não diretamente a todos os agentes.
- **CORE-FR-064:** permitir módulos privados de organização.
- **CORE-FR-065:** executar módulos no Node quando a localidade exigir.

## 9. Requisitos de experiência

- O dashboard inicial deve mostrar **o que exige atenção**, não volume de dados.
- Toda pontuação deve ser decomponível e explicável.
- Usuário deve navegar de projeto → proposta → finding → claim → evidência original.
- O sistema deve diferenciar fato, inferência, recomendação e decisão.
- Incerteza e conflito devem ter representação visual própria.
- Ações com escrita devem exibir blast radius, permissões, rollback e approvers.
- Uma ideia sem repositório deve ter experiência de primeira classe.

## 10. KPIs e guardrails

### KPIs

- Tempo mediano de onboarding até primeiro Twin útil.
- Tempo mediano de sinal relevante até triagem.
- Taxa de propostas consideradas úteis.
- Taxa de propostas com evidência suficiente na primeira revisão.
- Percentual de decisões com review trigger.
- Percentual de mudanças verificadas após execução.
- Redução de findings recorrentes sem aprendizado.

### Guardrails

- Falso positivo crítico por projeto/mês.
- Ação não autorizada: zero.
- Evidência sem provenance em proposta material: zero.
- Mudança irreversível executada sem aprovação: zero.
- Conteúdo externo interpretado como instrução: zero nos testes de segurança.
- Recomendações baseadas apenas em recência/popularidade: zero.

## 11. Primeiro vertical slice

O MVP deve provar um fluxo completo com GitHub ou diretório local:

1. criar projeto;
2. importar manifest e documentação;
3. obter snapshot de repositório/dependências;
4. ingerir uma mudança externa controlada;
5. gerar finding e proposta;
6. exibir lineage e impacto no Next.js;
7. usuário rejeitar, adiar ou aprovar experimento;
8. executar experimento read-only ou branch isolada;
9. registrar resultado e decisão.

Não é MVP se apenas gerar um relatório Markdown.

## 12. Dependências

- PRD-002 Project Registry.
- PRD-003 Evolution Engine.
- PRD-004 Evolution Node.
- Especificações de evidence e proposal.
- Policy engine e identity provider.
- Um model provider e uma suíte de evals.

## 13. Critério de sucesso do MVP

Nos três cenários de validação, usuários devem conseguir explicar:

- por que a recomendação apareceu;
- qual parte do projeto foi afetada;
- o que mudaria;
- qual evidência sustenta;
- por que aceitar, rejeitar ou experimentar;
- como o sistema lembrará a decisão.

