# Módulos, skills e MCPs

## 1. Separação conceitual

| Conceito | Serve para | Não deve ser usado como |
|---|---|---|
| Module | Unidade instalável, assinada e governável | Prompt informal |
| Skill | Conhecimento procedimental sob demanda | Credential store ou sandbox |
| MCP | Interface entre AI app e tools/resources | Event bus ou autorização implícita |
| Connector | Integração normalizada com sistema externo | Exposição bruta de toda API ao modelo |
| Agent | Executor de um papel dentro de workflow | Superusuário permanente |
| Policy | Decisão determinística de permissão/roteamento | Instrução em linguagem natural apenas |

## 2. Por que Module é a unidade principal

Uma skill não descreve adequadamente:

- permissões de runtime;
- side effects;
- network egress;
- compatibilidade binária/protocolar;
- assinatura e SBOM;
- schemas de artifacts;
- isolamento;
- lifecycle e rollback.

O Module engloba esses aspectos e pode incluir skills. Isso permite instalar “Harness Intelligence” como uma capability completa, não copiar vários prompts para diretórios diferentes.

## 3. Skill model

Skills seguem o padrão aberto Agent Skills, com progressive disclosure:

1. catálogo com nome/descrição;
2. `SKILL.md` ativado quando necessário;
3. resources/scripts carregados conforme referência.

Regras EvolutionOS:

- skill tem ID e versão imutáveis;
- descrição possui activation tests positivos e negativos;
- instrução não concede capability;
- references são content-addressed;
- scripts rodam no sandbox do módulo;
- output esperado possui schema quando participa do workflow;
- eval pack acompanha mudanças materiais;
- organization overlay não altera pacote original; cria versão/configuração rastreável.

## 4. MCP gateway

Não conectar dezenas de MCPs diretamente a cada agente. O gateway:

- registra servidores e tools;
- normaliza identities e health;
- traduz raw tools em capabilities estáveis;
- filtra discovery por task e policy;
- valida input/output schemas;
- injeta credentials fora do modelo;
- aplica OAuth/resource audience e token isolation;
- limita rate/cost;
- registra calls, redaction e result classification;
- adiciona idempotency/reconciliation wrappers;
- desabilita server comprometido.

Exemplo: agente pede capability `scm.pull_request.create`. Policy escolhe connector GitHub/GitLab autorizado e fornece tool adapter apropriado; o agente não recebe token nem a API completa.

## 5. Quando usar MCP

Use MCP para:

- um coding agent consultar Project Twin;
- um specialist acessar ferramenta/knowledge source;
- integrar um sistema que já oferece MCP confiável;
- expor proposals, decisions e evidence como resources controlados.

Não use MCP para:

- eventos internos de domínio;
- comunicação Hub/Node de estado;
- streaming de telemetry em massa;
- autorização;
- segredos;
- distribuir packages.

## 6. A2A

A2A é opcional e posterior. É útil quando EvolutionOS delega uma task a uma aplicação agentic independente de outro fornecedor, que mantém seu próprio runtime. Internamente, agents do mesmo runtime usam task/artifact contracts, não A2A.

## 7. Tool-risk taxonomy

| Classe | Exemplo | Default |
|---|---|---|
| R0 Pure | Parse, calculate, validate schema | Permitido em sandbox |
| R1 Read | Read repo/docs/metrics | Policy + classification |
| R2 Prepare | Generate patch/plan locally | Sandbox, no external write |
| R3 Reversible write | Create issue/branch/draft PR | Approval conforme projeto |
| R4 Material write | Merge/deploy/change policy | Strong approval + proof |
| R5 Irreversible/high impact | Delete data/production mutation | Proibido por default; exceptional workflow |

## 8. Capability naming

Padrão: `<domain>.<resource>.<action>`.

Exemplos:

- `project.twin.read`
- `evidence.external.ingest`
- `repo.source.read`
- `scm.branch.create`
- `scm.pull_request.create`
- `experiment.sandbox.run`
- `telemetry.metrics.query`
- `module.install.request`
- `policy.exception.approve`

Capabilities podem ter constraints de project, branch, environment, destination, duration e volume.

## 9. Compatibilidade e lock

`modules.lock` registra:

- module/version/digest;
- skill/connector subcomponents;
- protocol and schema ranges;
- granted capabilities;
- policy bundle version;
- provenance reference;
- installedAt/approvedBy.

Agent run registra lock snapshot. Isso permite reproduzir ou explicar resultados após upgrades.

## 10. Standards adotados

- Agent Skills para skills.
- MCP para AI-to-tool/resource.
- A2A na fronteira entre agentic apps independentes.
- OCI artifacts para packages.
- Sigstore/cosign para assinatura.
- SPDX para SBOM/provenance references.
- OPA-compatible policy bundles como primeira implementação.

