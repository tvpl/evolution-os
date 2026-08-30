# Princípios do produto

## P1 — Relevância, não novidade

Uma tecnologia nova não é uma recomendação. O sistema precisa provar relação com objetivos, restrições e métricas do projeto.

## P2 — Evidência antes de opinião

Toda afirmação material deve carregar origem, data, versão, trecho derivado, confiança e cadeia de transformação. Conteúdo externo é dado não confiável, nunca instrução para agentes.

## P3 — Memória de decisões

Decisões aceitas, rejeitadas, expiradas e revisitadas permanecem pesquisáveis. Recomendações futuras devem considerar os motivos anteriores e as condições de revisão.

## P4 — Contexto mínimo necessário

Agentes recebem somente contexto, ferramentas e permissões necessários à tarefa. Skills seguem progressive disclosure; conectores são selecionados por capacidade.

## P5 — Determinístico antes de probabilístico

Use parsers, schemas, SBOMs, políticas, testes, regras arquiteturais e dados operacionais antes de pedir julgamento a um modelo.

## P6 — Localidade e soberania

O projeto pode ser analisado no ambiente do usuário. O Hub não depende de possuir o código-fonte. A sincronização é explícita, classificável e minimizada.

## P7 — Autonomia conquistada

A instalação começa read-only. Permissões de escrita, execução e merge são concedidas por projeto, ação, risco e evidência histórica.

## P8 — Pequeno e enterprise são topologias

O modelo conceitual e os contratos são os mesmos. Escala muda armazenamento, isolamento e coordenação, não o significado de uma proposta ou evidência.

## P9 — Arquitetura pode ser preservada e questionada

Fitness functions protegem o baseline vigente. Mudá-lo requer uma proposta distinta, evidência, impacto e decisão registrada.

## P10 — Falhas devem ser visíveis

Agentes não podem mascarar incerteza, fonte indisponível, conflito de evidências ou teste inconclusivo. “Não sei” é estado válido.

## P11 — Portabilidade nas fronteiras

Manifests, eventos, evidências, módulos e integrações usam formatos abertos e versionados. Provedores de modelo e ferramentas são substituíveis.

## P12 — Evoluir o evolucionador

O próprio EvolutionOS é cadastrado como projeto. Skills, políticas, módulos e prompts possuem versões, evals, telemetria, condições de revisão e propostas de evolução.

## Heurística anti-hype

Uma novidade só pode avançar de **Observe** para **Experiment** quando:

- existe fonte primária ou evidência independente suficiente;
- o impacto é ligado a entidades reais do projeto;
- há hipótese mensurável;
- custo e blast radius estão explicitados;
- existe experimento reversível;
- a recomendação não contradiz uma restrição não resolvida.

Só pode avançar para **Adopt** ou **Migrate** depois de resultados do próprio contexto, salvo correção crítica de segurança ou obrigação legal.

