# PRD-003 — Evolution Engine

**Status:** Accepted  
**Objetivo:** Transformar mudanças internas e externas em decisões evolutivas verificáveis.

## 1. Problema

Scanners produzem findings; feeds produzem notícias; LLMs produzem opiniões. Nenhum desses resultados isolados constitui uma decisão. O Evolution Engine deve correlacionar evidência, contexto, impacto, alternativa e verificação sem transformar incerteza em falsa precisão.

## 2. Entradas

- Snapshot do Project Twin.
- Signal ou evento interno/externo.
- Baselines e policies aplicáveis.
- Decisões históricas e review triggers.
- Dados operacionais e de produto autorizados.
- Catálogo de capacidades, módulos e evals.

## 3. Saídas

- Observação descartada com justificativa.
- Claim normalizada.
- Finding contextualizado.
- Pedido de informação.
- Watch item com condição de reavaliação.
- Evolution Proposal.
- Campaign candidate.
- Atualização de coverage/freshness.

## 4. Pipeline lógico

### 4.1 Ingest

Valida envelope, autenticação, schema, classificação, licença e limites. Conteúdo externo permanece isolado como dado.

### 4.2 Normalize

Extrai entidades, versões, datas, claims e links. Deduplica sem eliminar fontes corroborantes.

### 4.3 Ground

Busca fontes primárias e evidência contrária. Claims sem base suficiente permanecem não verificadas.

### 4.4 Link

Relaciona sinal a tecnologias, componentes, decisões, hipóteses, riscos e métricas do Twin.

### 4.5 Analyze

Executa regras determinísticas, consultas ao grafo e agentes especialistas. Produz impacto e alternativas independentes.

### 4.6 Challenge

Um agente diferente testa causalidade, necessidade, viés de novidade, custo omitido e contradições.

### 4.7 Score

Calcula dimensões, não um veredito opaco:

- relevance;
- evidence strength;
- confidence;
- impact;
- urgency;
- expected benefit;
- migration effort;
- risk;
- reversibility;
- strategic fit.

### 4.8 Propose

Gera proposta com alternativas `do nothing`, `watch`, `experiment`, `adopt`, `migrate`, `redesign` ou `retire`.

### 4.9 Route

Policy engine determina recipients, aprovações, capability e autonomy ceiling.

## 5. Modelo de relevância

Não usar soma linear universal. Cada organização pode definir pesos e regras, mas o motor deve preservar os componentes. Um índice de triagem opcional pode ser:

\[
Priority = \frac{Relevance \times Impact \times Urgency \times EvidenceStrength}{Effort \times Risk \times Uncertainty}
\]

O valor serve para ordenar, não decidir. Divisão por valores próximos de zero deve usar normalização segura e limites configuráveis.

## 6. Requisitos

- **EVO-FR-001:** todo output liga-se ao snapshot e versões de módulos/modelos usados.
- **EVO-FR-002:** todo finding material possui ao menos uma evidence ou marcação explícita de hipótese.
- **EVO-FR-003:** inferências são rotuladas separadamente de fatos.
- **EVO-FR-004:** o motor pode responder `insufficient_context`.
- **EVO-FR-005:** conflito entre evidências é preservado.
- **EVO-FR-006:** análises são idempotentes para a mesma chave, versões e snapshot.
- **EVO-FR-007:** resultados podem ser reproduzidos dentro dos limites do modelo e fontes disponíveis.
- **EVO-FR-008:** decisões anteriores relevantes são recuperadas antes da proposta.
- **EVO-FR-009:** o Challenger não recebe a recomendação como verdade, mas evidências e contexto.
- **EVO-FR-010:** proposta inclui alternativa de não agir e custo de inação.
- **EVO-FR-011:** proposal material exige análise de reversibilidade e blast radius.
- **EVO-FR-012:** score é decomponível e configurável.
- **EVO-FR-013:** sinais podem expirar sem apagar histórico.
- **EVO-FR-014:** proposals duplicadas são relacionadas ou consolidadas.
- **EVO-FR-015:** mudanças comuns podem virar campaign sem perder decisão por projeto.
- **EVO-FR-016:** uma execução pode ser pausada, retomada e cancelada.
- **EVO-FR-017:** retries não repetem side effects.
- **EVO-FR-018:** custos de modelo, tools e compute são registrados.

## 7. Classes de análise iniciais

| Classe | Exemplo | Execução padrão |
|---|---|---|
| Product relevance | Concorrente tornou feature commodity | Hub + fontes externas |
| Technology horizon | Framework entrou em EOL | Hub pesquisa; Node confirma uso |
| Architecture drift | Limite de domínio foi violado | Node |
| Harness health | Skill redundante após mudança de modelo | Node + eval service |
| Dependency/security | CVE ou major version | Node determinístico |
| Documentation drift | ADR/contrato divergente do código | Node |
| Operational fit | Custo/latência contradiz NFR | Telemetry connector |
| Compliance | Nova regra afeta tratamento de dados | Hub + reviewer humano |

## 8. Anti-padrões proibidos

- “Novo = recomendado”.
- “Mais popular = melhor”.
- Score sem decomposição.
- LLM citar a si próprio como evidência.
- Recomendação sem custo de inação.
- Alterar baseline para eliminar finding.
- Reexecutar tool mutável após timeout sem idempotency token.
- Resumir fontes contraditórias como consenso.
- Produzir PR antes de definir critério de verificação.

## 9. Critérios de aceite

- O mesmo sinal pode ser relevante para um projeto e irrelevante para outro, com explicação.
- Um finding contraditório exibe ambos os lados.
- Uma proposta rejeitada não reaparece sem nova condição.
- O usuário navega do texto da recomendação até fontes e snapshot.
- Falta de informação gera pergunta ou spike, não suposição oculta.
- A substituição de um modelo não altera silenciosamente decisões já registradas.

