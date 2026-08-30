# ADR-001 — Control Plane central e Evolution Nodes federados

**Status:** Accepted  
**Data:** 2026-08-29

## Contexto

Projetos pequenos precisam operar sem infraestrutura central. Empresas não podem obrigatoriamente enviar código e dados a um SaaS. Ao mesmo tempo, portfolio intelligence, campaigns, policies e evidence sharing exigem coordenação central.

## Decisão

Adotar um Evolution Hub como Control Plane e um Evolution Node executável perto de cada projeto. O Node funciona standalone ou managed, aplica policy local e sincroniza somente dados autorizados.

## Alternativas

- SaaS central que clona tudo: simples, mas viola soberania e air-gap.
- CLI apenas: boa localidade, fraco para portfolio e colaboração.
- Agente por SCM app sem Node: insuficiente para telemetry/private environment.

## Consequências

Positivas:

- atende solo e enterprise;
- preserva código/dados locais;
- permite offline e air-gap;
- escala por data planes;
- reduz blast radius central.

Negativas:

- protocol/version compatibility;
- sync e conflict resolution;
- lifecycle de Node;
- observabilidade distribuída;
- suporte a múltiplas topologias.

## Review triggers

- Nodes tornam onboarding inviável para maioria dos usuários.
- Confidential computing central resolve soberania com menor complexidade.
- Protocol divergence impede evolução.
- Uso real mostra que 90% das análises não exigem ambiente local.

