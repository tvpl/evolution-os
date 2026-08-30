# Lifecycle e casos de uso

## Estados do projeto

`concept → discovery → build → launch → operate → evolve → sunset → archived`

Um projeto composto pode ter filhos em fases diferentes. Harnesses e componentes possuem lifecycle próprio.

## UC-01 — Avaliar ideia nova

1. Usuário descreve problema e público.
2. Foundation skill estrutura hipóteses.
3. Product Scout pesquisa fontes e concorrentes.
4. Challenger procura substitutos e mudança tecnológica.
5. Engine propõe experimentos e critérios de kill/continue.
6. Decisões alimentam o Twin antes do código.

## UC-02 — Onboard de repositório existente

1. Node descobre docs, código, dependencies e CI.
2. Cartographer propõe componentes e relações.
3. Usuário confirma ownership e product/system mapping.
4. Gaps ficam visíveis; nenhuma arquitetura é inventada como fato.
5. Primeiro baseline e backlog de investigação são gerados.

## UC-03 — Framework/modelo entra em EOL

1. Technology Radar ingere fonte oficial.
2. Hub identifica candidatos por metadata.
3. Nodes confirmam uso real e paths afetados.
4. Campaign agrupa análise, mas cada projeto recebe impacto próprio.
5. Propostas incluem prazo, opções e teste.
6. Execução produz PRs e prova por projeto.

## UC-04 — Concorrente commoditiza feature

1. Competitive signal é corroborado.
2. Product Challenger liga feature à proposta de valor.
3. Engine testa se diferenciação dependia dela.
4. Propõe watch, reposicionamento, experimento ou redesign.
5. PM decide e registra condições.

## UC-05 — Harness ficou obsoleto

1. Harness sensor inventaria modelo, instructions, skills, MCPs e evals.
2. Nova versão de modelo ou agent runtime vira signal.
3. Harness Auditor identifica workarounds possivelmente redundantes.
4. Experiment Runner compara baseline e variantes.
5. Só recomenda remoção/adoção após task evals, custo e segurança.

## UC-06 — Architecture drift

1. PR event aciona Node.
2. Checks determinísticos comparam imports, CALM e fitness functions.
3. Finding diferencia violation do baseline e possível mudança legítima.
4. Para preservar baseline, bloqueia/conserta conforme policy.
5. Para mudar baseline, exige architecture proposal/ADR.

## UC-07 — Incident gera evolução

1. Incident connector recebe evento e timeline.
2. Runtime Analyst liga traces e componentes.
3. Root cause humana/agêntica produz claims com evidências.
4. Follow-ups tornam-se proposals e fitness functions.
5. Mudança verificada fecha loop; aprendizado atualiza contexto.

## UC-08 — Portfolio campaign

1. Leader encontra padrão comum.
2. Cria cohort e análise piloto.
3. Escolhe canaries representativos.
4. Aprende transformation/evals.
5. Expande por waves com exceções e rollback.
6. Reporta outcomes agregados sem apagar contextos locais.

## UC-09 — Operação standalone

1. Desenvolvedor inicializa Node.
2. Seleciona módulos locais.
3. Executa snapshot/analyze.
4. Revisa relatório/proposal.
5. Opcionalmente exporta pacote ou registra no Hub.

## UC-10 — Sunset consciente

1. Signals mostram baixo uso, alto custo ou substituição.
2. Engine liga consumers e obrigações.
3. Proposta inclui migração, retenção e communication plan.
4. Evidência de desligamento e rollback window é preservada.
5. Twin vira archived, mas decisões continuam acessíveis.

