# PRD-002 — Project Registry e memória evolutiva

**Status:** Accepted  
**Objetivo:** Registrar o significado e o estado de uma iniciativa ao longo de seu ciclo de vida.

## 1. Problema

Um repositório não representa um produto. Ideias, hipóteses, serviços, documentos, runtime, harnesses e decisões possuem ciclos de vida diferentes. Um catálogo limitado a repositórios produz recomendações tecnicamente corretas e estrategicamente irrelevantes.

## 2. Resultado

Cada iniciativa recebe um Project Twin navegável, composto por entidades versionadas e relações com provenance. O Twin pode começar vazio e ganhar fidelidade progressivamente.

## 3. Tipos iniciais

| Tipo | Exemplo | Observações |
|---|---|---|
| `idea` | Novo app ou oportunidade | Pode não ter código, owner técnico ou arquitetura. |
| `product` | Plataforma voltada a usuários | Liga problemas, outcomes, feedback e sistemas. |
| `system` | Adquirência, pagamentos, CRM | Agrega serviços, dados, fluxos e restrições. |
| `service` | Autorizador ou API | Unidade operável e versionável. |
| `repository` | Repositório Git | Fonte de implementação, não unidade obrigatória de produto. |
| `harness` | Configuração agentic | Skills, models, prompts, tools, evals e políticas. |
| `portfolio` | Unidade de negócio | Agregação analítica e governança. |

Tipos são extensíveis, mas os campos semânticos fundamentais permanecem.

## 4. Estrutura mínima

- Identidade: ID imutável, nome, aliases, tipo e status.
- Intenção: problema, público, proposta de valor e outcomes.
- Ownership: business, product, architecture, engineering, security e AI.
- Restrições: legais, segurança, custo, prazo, plataforma e soberania.
- Horizonte: experimental, tactical, strategic ou sunset.
- Objetivos e métricas.
- Hipóteses e nível de evidência.
- Artefatos e sources.
- Relações com outros projetos.
- Baselines e policies.
- Review cadence e triggers.

## 5. Requisitos

- **REG-FR-001:** criar manualmente, via manifest, import ou discovery.
- **REG-FR-002:** mesclar descoberta com cadastro sem perder origem de campos.
- **REG-FR-003:** manter valores declarados e observados separadamente.
- **REG-FR-004:** permitir múltiplos owners por papel e tempo de vigência.
- **REG-FR-005:** representar relações temporais e direcionais.
- **REG-FR-006:** suportar anexos por conteúdo, URI ou referência externa.
- **REG-FR-007:** versionar snapshots e permitir comparação.
- **REG-FR-008:** indicar cobertura e freshness por dimensão.
- **REG-FR-009:** registrar field-level provenance.
- **REG-FR-010:** não sobrescrever dado humano por inferência agentic.
- **REG-FR-011:** suportar claim contestada e resolução explícita.
- **REG-FR-012:** exportar Twin em formato portável.
- **REG-FR-013:** manter tombstone e histórico após arquivamento.
- **REG-FR-014:** propagar mudanças somente por regras explícitas; por exemplo, owner organizacional para filhos.
- **REG-FR-015:** representar condições que invalidam ou reabrem decisões.

## 6. Onboarding adaptativo

### Idea mode

Perguntas mínimas:

- Qual problema existe e para quem?
- Que comportamento atual seria substituído?
- Qual hipótese central pode invalidar a ideia?
- O que seria sucesso e fracasso?
- Quais soluções ou concorrentes já são conhecidos?
- Que restrições são inegociáveis?

### Existing project mode

O Node descobre repositórios, manifests, documentos, dependências, CI, IaC e observabilidade. A UI apresenta sugestões de composição que o usuário confirma.

### Enterprise import

Importa software catalog, SCM groups, CMDB, ownership e scorecards. Entidades duplicadas são propostas para reconciliação, nunca unidas por nome automaticamente.

## 7. Freshness e cobertura

Cada dimensão recebe:

- `coverage`: unknown, partial, sufficient, complete;
- `freshness`: data da última observação válida;
- `authority`: declared, observed, inferred, external;
- `confidence`: decomposição baseada em fonte e corroboration;
- `sensitivity`: public, internal, confidential, restricted.

O dashboard deve evitar uma pontuação única de “qualidade do projeto”. Em vez disso, mostra dimensões e lacunas.

## 8. Memória de decisão

Uma Decision contém:

- contexto e proposta relacionada;
- decisão e autor;
- alternativas consideradas;
- justificativa;
- evidências;
- consequências esperadas;
- data de vigência;
- review triggers;
- supersedes/superseded by;
- outcome observado.

Ao gerar nova proposta, o motor busca decisões semanticamente e estruturalmente relacionadas. Uma rejeição só pode ser reaberta quando há nova evidência, mudança de contexto ou trigger satisfeito.

## 9. Experiência principal

O Project Overview apresenta:

- identidade, fase e outcomes;
- mapa de relações;
- evolução recente;
- lacunas de contexto;
- proposals abertas;
- saúde técnica, arquitetural, agentic e de produto;
- decisões próximas de revisão;
- evidências recentes;
- ações permitidas.

## 10. Critérios de aceite

- Uma ideia pode ser registrada sem qualquer integração técnica.
- Um monorepo pode representar vários serviços e produtos.
- Um produto pode depender de sistemas em outros workspaces autorizados.
- Valor inferido nunca substitui silenciosamente valor declarado.
- Usuário consegue reconstruir por que uma decisão existia em determinada data.
- Export/import preserva IDs, relações, versões e provenance.

