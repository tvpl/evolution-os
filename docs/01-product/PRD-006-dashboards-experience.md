# PRD-006 — Dashboards e experiência Next.js

**Status:** Accepted  
**Objetivo:** Tornar um sistema complexo compreensível por progressive disclosure e ação orientada por decisão.

## 1. Princípios de UX

- Começar por atenção e decisão, não inventário.
- Mostrar relações e mudanças, não apenas estados.
- Distinguir fato, inferência, recomendação, decisão e resultado.
- Decompor scores e expor confiança.
- Permitir drill-down até evidence lineage.
- Mostrar o “por que agora?” e o custo de não agir.
- Ações de risco nunca usam confirmação genérica.
- Experiência de ideia sem código tem o mesmo nível de acabamento.

## 2. Navegação global

1. Home / Evolution Inbox.
2. Portfolio.
3. Projects.
4. Campaigns.
5. Evidence & Radar.
6. Agents & Runs.
7. Modules & Integrations.
8. Policies & Governance.
9. Administration.

## 3. Dashboards

### 3.1 Evolution Inbox

Fila pessoal baseada em papel e policy:

- decisões pendentes;
- investigação necessária;
- experimentos aguardando execução;
- mudanças verificadas;
- deadlines e review triggers;
- conflitos de evidência;
- novos riscos críticos.

Cada card mostra projeto, recomendação, tipo, impacto, urgência, confidence band, evidência principal, owner e próxima ação.

### 3.2 Portfolio Evolution Map

- mapa por domínio/produto/sistema;
- distribuição de findings por dimensão;
- EOL horizon;
- campaigns e rollout;
- projetos sem owner, baseline ou snapshot recente;
- concentração de tecnologia/modelo/MCP;
- riscos sistêmicos e dependências críticas;
- comparação temporal.

Não usar ranking de “pior equipe”. O foco é risco e coordenação.

### 3.3 Project Cockpit

Abas:

- Overview;
- Intent & Product;
- Architecture;
- Implementation;
- Runtime;
- AI Harness;
- Evidence;
- Proposals & Decisions;
- Timeline;
- Settings.

Header persistente mostra fase, owners, freshness, autonomy level, Node status e open attention.

### 3.4 Product Relevance

- hipóteses e evidência;
- mudanças de mercado/concorrência;
- feedback themes;
- diferenciação ameaçada ou fortalecida;
- outcomes e sinais de uso;
- opportunities e experiments.

### 3.5 Architecture & System Map

- visualização declarada, observada e diff;
- componentes, dados e relationships;
- ADRs relacionados;
- violations e fitness functions;
- blast radius de proposta;
- timeline de drift.

### 3.6 Harness Observatory

- models/providers e dependências;
- prompts/instructions;
- skills, MCPs, hooks e permissions;
- eval coverage e regressions;
- custo, latência e task success;
- redundância, incompatibilidade e update candidates;
- recomendações de experimentos A/B.

### 3.7 Evolution Proposal Workspace

Layout em três painéis adaptativos:

- proposta e alternativas;
- impacto no Twin;
- evidências e comentários.

Ações: request evidence, challenge, simulate, approve experiment, defer, reject, approve change. A UI exibe policy e approvers antes de executar.

### 3.8 Agent Runs

- graph/timeline da execução;
- inputs classificados;
- skills e tools ativadas;
- policy decisions;
- token/cost/latency;
- outputs e proof artifacts;
- falhas/retries;
- human interventions;
- replay permitido ou bloqueado.

### 3.9 Modules & Capabilities

- installed/available updates;
- permission diff;
- compatibility;
- rollout por projeto;
- health e evals;
- quarantine e rollback.

### 3.10 Governance & Audit

- policy simulator;
- approvals pendentes;
- autonomy distribution;
- exception register;
- access logs;
- evidence exports;
- retention e data residency.

## 4. Onboarding

Usuário escolhe:

- “Tenho apenas uma ideia.”
- “Tenho um projeto/repositório.”
- “Quero conectar um portfólio.”
- “Quero usar somente o Node local.”

O wizard não pergunta stack quando não existe stack. Ele recomenda profile e módulos mínimos, apresenta permissões e cria a primeira hipótese/manifest.

## 5. Requisitos

- **UX-FR-001:** keyboard navigation e WCAG 2.2 AA.
- **UX-FR-002:** dark/light e visualização responsiva.
- **UX-FR-003:** URLs estáveis para projeto, proposal, evidence e run.
- **UX-FR-004:** filtros preserváveis e compartilháveis conforme autorização.
- **UX-FR-005:** server-side authorization em toda rota/dado.
- **UX-FR-006:** dados críticos não dependem de color-only encoding.
- **UX-FR-007:** scores sempre abrem decomposição.
- **UX-FR-008:** toda ação mutável apresenta capabilities, side effects e rollback.
- **UX-FR-009:** long-running operations mostram progresso por etapa e podem continuar fora da página.
- **UX-FR-010:** estado de streaming não é tratado como decisão final.
- **UX-FR-011:** UI distingue stale, unavailable e unknown.
- **UX-FR-012:** exportar proposal/decision em Markdown/JSON/PDF futuro.

## 6. Arquitetura de experiência

Next.js App Router será a console web. Server Components são usados para leitura e composição inicial; Client Components somente para interações, grafos e streaming. Next.js atua como UI/BFF, não como dono do runtime agentic ou de jobs longos. Detalhes em [arquitetura Next.js](../02-architecture/11-nextjs-experience.md).

## 7. Critérios de aceite

- Uma nova pessoa identifica em menos de cinco minutos por que há uma proposta pendente.
- É possível chegar da proposta à fonte original em até três níveis de navegação.
- Um approver entende o blast radius sem abrir o repositório.
- Usuário de idea mode não vê telas vazias dependentes de código.
- Run longo sobrevive a refresh e logout.
- Permissão negada nunca vaza existência ou conteúdo de projeto restrito.

