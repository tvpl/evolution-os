# Revisão crítica, premortem e guardrails de produto

Este documento assume deliberadamente a posição de um investidor cético, um CISO, um arquiteto enterprise e um usuário solo. O objetivo é encontrar as maneiras mais prováveis de a ideia falhar antes que a arquitetura as torne caras.

## 1. Veredito crítico

A visão é coerente, mas tem risco excepcional de virar uma **plataforma abstrata que descreve evolução sem produzi-la**. O produto só merece existir se conseguir converter sinais em decisões melhores e resultados verificáveis com menos esforço do que o processo atual.

O maior risco técnico não é o agente errar uma sugestão. É o ecossistema criar uma representação convincente, desatualizada e circular do mundo — e então automatizar com base nela.

## 2. Dez teses que precisam ser desafiadas

### 2.1 “Mais sinais levam a melhores decisões”

Pode ser falso. Mais fontes elevam ruído, duplicação, licenciamento, custo e prompt injection. O sistema deve medir **precision@accepted-proposal**, signal half-life e taxa de silêncio correto. Um sensor que gera volume sem decisões melhores deve ser desativado.

### 2.2 “É possível pontuar relevância de forma geral”

Uma nota universal seria falsa precisão. Relevância depende de estratégia, exposição, timing, capacidade de mudança, risco e reversibilidade. O produto precisa mostrar decomposição, intervalos, sensitivity e evidência, além de permitir “insuficiente para avaliar”.

### 2.3 “Um grafo unificado cria verdade”

Grafos criam conectividade, não verdade. Edges inferidas podem propagar erro e produzir impact analysis persuasivo. Cada node/edge precisa de provenance, tempo, authority, confidence e expiry. O grafo é uma visão, não autoridade final.

### 2.4 “Agentes especialistas independentes reduzem erro”

Se todos usam o mesmo contexto, modelo e incentives, múltiplos agentes podem apenas repetir o mesmo erro com aparência de consenso. Diversidade exige métodos diferentes: regras, testes, fontes, modelos ou papéis adversariais. Um “debate” sem independência não é verificação.

### 2.5 “Memória resolve coerência longitudinal”

Memória ruim institucionaliza erro. O sistema precisa de supersession, contradiction, temporal validity, garbage collection, revisão humana e capacidade de esquecer dados inválidos sem apagar audit trail.

### 2.6 “Modularidade cria ecossistema”

Um formato de pacote não cria oferta de módulos. Marketplace exige economics, suporte, trust, compatibility e distribuição. O MVP deve funcionar com poucos módulos first-party; marketplace público é uma aposta posterior.

### 2.7 “Enterprise quer uma visão global”

Quer, mas segurança, residência, segregação e ownership frequentemente impedem centralização. O Hub deve aceitar portfolio incompleto, freshness desigual e metadata mínima. Uma tela global não justifica copiar código ou PII.

### 2.8 “Times pequenos usarão governança enterprise reduzida”

Podem rejeitar qualquer setup. O modo solo precisa entregar valor em minutos, inferir o que puder, pedir confirmação progressiva e não exigir ontologia, comitê ou modelagem arquitetural completa.

### 2.9 “Evoluir continuamente é sempre melhor”

Mudança tem custo. Sistemas maduros podem otimizar estabilidade; tecnologias “ultrapassadas” podem ser seguras e econômicas. O sistema precisa recomendar manter, encapsular, aposentar ou observar — não só migrar.

### 2.10 “Um produto horizontal é o melhor ponto de entrada”

Horizontalidade amplia TAM conceitual e enfraquece urgência comercial. O primeiro wedge precisa ter buyer, trigger e métrica claros. Caso contrário, o produto vira consultoria assistida por dashboard.

## 3. Premortem

Imagine que, em 24 meses, o produto foi encerrado. As causas mais prováveis seriam:

| Falha | Sinal precoce | Prevenção/teste | Kill criterion |
|---|---|---|---|
| Dashboard cemetery | Usuários visitam apenas em demos ou auditorias | Notificações orientadas a decisão; medir weekly decision users | <20% dos projetos ativos geram ou fecham uma decisão/90 dias |
| Alert fatigue | >70% dos sinais são arquivados sem ação/razão | Budgets, dedupe, source scoring, silence objective | Precision de sinais materiais não melhora após 3 ciclos |
| Recomendações genéricas | Propostas poderiam servir para qualquer projeto | Exigir links a constraints, exposure, evidence e baseline | Revisores classificam >30% como “sem contexto específico” |
| Grafo desatualizado | Owners ignoram impact analysis | Freshness visível, expiry, reconciliation e source authority | >10% de relações críticas falham em amostragem mensal |
| Custo desproporcional | Token/compute cresce mais rápido que decisões aceitas | Determinístico primeiro, cache, incremental snapshots | Custo por decisão aceita supera benefício estimado repetidamente |
| Falha de confiança | Uma ação excede escopo ou vaza dado | Default deny, node local, exact-digest approval, red team | Qualquer breach material aciona stop e redesign |
| Integração sem fim | Roadmap dominado por connectors custom | Contract kits, generic webhooks, partner boundary | >50% da engenharia em integrações únicas por 2 quarters |
| Plataforma antes do produto | Muito catálogo/policy, pouco outcome | Wedge com loop fechado e 3 métricas | Sem melhoria mensurável em 3 pilotos completos |
| Dependência de modelo | Upgrade altera comportamento e quebra evals | Provider abstraction + eval gates + pinned profiles | Sem capacidade de rollback reproduzível |
| Marketplace fantasma | Módulos externos sem manutenção ou demanda | First-party modules e private registry primeiro | Não lançar público sem 3 publishers ativos e demanda repetida |

## 4. Riscos de segurança específicos

### 4.1 Prompt injection de fontes

Release notes, issues, websites, documentos e MCP resources são dados não confiáveis. Um conteúdo pode instruir o agente a revelar secrets ou executar ferramentas.

Controles:

- separar conteúdo de instrução;
- sanitizar e classificar fontes;
- nunca derivar capability de conteúdo;
- egress allowlist e proxy;
- canary secrets/honey tokens;
- adversarial eval packs;
- confirmação humana para side effects externos.

### 4.2 Tool poisoning e troca de semântica

Um MCP/module pode alterar schema, descrição ou comportamento após aprovação.

Controles:

- pin por digest/version;
- capability manifest e permission diff;
- conformance suite antes de activate/update;
- trust tier, assinatura, SBOM e provenance;
- quarantine e kill switch;
- nunca confiar apenas na descrição textual do tool.

### 4.3 Confused deputy

O Hub pode ter mais autoridade que o projeto/agent que solicita a ação.

Controles:

- token audience/resource binding;
- delegação explícita por tenant/projeto/run;
- short-lived credentials;
- capability attenuation no Node;
- registrar requester, approver, executor e target;
- proibir token passthrough entre fronteiras.

### 4.4 Exfiltração por artefatos derivados

Metadata, embeddings, stack traces e summaries podem reter dados sensíveis.

Controles:

- classificação propagada para derivados;
- sync policy por classe;
- redaction testável;
- não considerar embedding “anonimizado” por padrão;
- lineage até o dado bruto para revogação e recomputação.

### 4.5 Self-modification circular

Um agente pode editar a Skill, eval ou policy que o avalia.

Controles:

- separation of duties;
- protected governance repository;
- verifier/evals pinados fora do change set;
- dual approval para mudanças em runtime/policy/evals;
- shadow/canary antes de promotion;
- agent cannot promote itself.

## 5. Riscos epistemológicos

### Evidência não é verdade

Evidence records registram o que uma fonte afirma/mede. Autoridade, recência e método determinam peso. Duas fontes podem discordar legitimamente.

### Correlação não é impacto

Uma mudança de tecnologia coincidir com uma métrica não prova causalidade. Use baseline, controles, rollout e falsification criteria sempre que possível.

### Ausência de sinal não é segurança

Fontes podem estar indisponíveis, privadas ou atrasadas. Freshness e coverage precisam aparecer no dashboard.

### Consenso de agentes não é consenso de evidência

Conte votos apenas quando os agentes têm evidência/métodos independentes. Caso contrário, colapse argumentos duplicados.

### Documento declarado não é sistema observado

O produto jamais “corrige” a arquitetura declarada silenciosamente a partir de inference. Propõe reconciliation com diff e owner.

## 6. Riscos de UX e produto

| Risco | Antídoto de UX |
|---|---|
| Usuário não sabe por onde começar | Onboarding por pergunta: ideia, repo ou portfólio; progressive profiling |
| Uma nota domina julgamento | Mostrar range, drivers, contrary evidence e “what would change this” |
| Aprovação vira clique ritual | Resumo de escopo, diff, blast radius, expiry e digest antes do approve |
| Propostas longas demais | Camada executiva + drill-down para evidence/trace |
| Falso senso de completude | Coverage/freshness banner e unknowns explícitos |
| Owners recebem tudo | Routing por decisão necessária, não por sensor |
| Histórico vira arquivo morto | Review triggers e resurfacing com contexto novo |
| Enterprise esconde a origem da decisão | Export auditável, comments e ADR sync |

## 7. Riscos econômicos

O modelo de custo precisa considerar:

- ingestão e storage de evidência;
- indexação e recomputação;
- chamadas de modelos e retries;
- execução em sandbox;
- egress e APIs pagas;
- revisão humana;
- custo de integração/gestão de permissions;
- custo da mudança recomendada.

Métrica operacional proposta:

`net_verified_value = verified benefit − analysis cost − execution cost − review cost − regression cost`

Benefícios difíceis de monetizar devem ser rotulados como qualitativos. Nunca converter confiança do LLM diretamente em ROI.

## 8. Alternativas estratégicas

### Alternativa A — Apenas modernização de código

Mais simples, mas compete diretamente com players fortes. Pode ser connector/executor, não visão final.

### Alternativa B — Apenas governance/harness para agentes

Tem urgência alta e wedge claro, mas perde a tese de produto/mercado. Pode ser a primeira vertical comercial dentro do mesmo metamodelo.

### Alternativa C — Apenas radar executivo de portfólio

Fácil de demonstrar, difícil de provar valor e propenso a dashboard cemetery. Não recomendado sem loop de ação.

### Alternativa D — Serviço consultivo agentic

Pode aprender domínio e gerar receita inicial, porém precisa transformar padrões repetidos em modules e product workflows para não permanecer serviço.

### Alternativa E — Open protocol primeiro

Favorece ecossistema, mas pode não obter adoção sem produto útil. O Protocol deve nascer exportável, enquanto o wedge entrega valor imediato.

## 9. Wedge recomendado e prova de valor

Primeiro caso:

> Evolução segura de um sistema com IA: registrar intenção e arquitetura, inventariar modelo/skills/MCPs/evals, detectar uma mudança material, produzir proposta com contraditório, preparar experimento em sandbox e verificar regressões.

Por que esse wedge:

- o problema de churn é explícito;
- harness drift é pouco coberto por ferramentas tradicionais;
- integra produto, arquitetura e execução sem exigir portfólio completo;
- produz métricas observáveis em semanas;
- usa Node local e política desde o início.

Critérios de piloto:

- tempo até baseline útil < 60 minutos para repo suportado;
- ≥60% das proposals materiais julgadas context-specific;
- zero ação fora de capability/policy;
- ≥30% menos tempo humano para decidir uma mudança selecionada;
- nenhuma regressão crítica no experimento promovido;
- usuário retorna para um segundo ciclo de evolução.

## 10. O que não construir no primeiro ano

- um IDE próprio;
- um model provider próprio;
- um vector database ou graph database próprio;
- um novo protocolo geral de agentes;
- um marketplace público sem base instalada;
- dezenas de agents com personas sobrepostas;
- um sistema autônomo de produção A5;
- previsão universal de tendências;
- geração completa de produtos com um clique;
- substitutos de GitHub, Jira, observability, Productboard ou policy engines.

## 11. Gates de continuidade do produto

O ecossistema deve continuar recebendo investimento apenas se:

1. propostas mudarem decisões reais, e não apenas resumirem fatos;
2. outcomes puderem ser verificados em pelo menos parte dos casos;
3. usuários repetirem o ciclo por iniciativa própria;
4. custo por decisão aceita cair com aprendizado e automação determinística;
5. integração incremental funcionar sem centralizar dados sensíveis;
6. módulos first-party forem reutilizáveis em múltiplos projetos;
7. falsos positivos e contraditórios forem mensuráveis;
8. uma falha de modelo puder ser contida, explicada e revertida.

Se esses gates não forem atingidos, reduzir escopo para uma vertical verificável é superior a ampliar a plataforma.

