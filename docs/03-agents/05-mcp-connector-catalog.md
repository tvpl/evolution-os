# Catálogo de MCPs e conectores

## 1. Estratégia

EvolutionOS expõe internamente **capabilities estáveis**. MCPs e APIs de fornecedores são adapters. Instalar cinco integrações não significa mostrar centenas de tools ao modelo.

## 2. MCPs fornecidos pelo EvolutionOS

### Evolution Project MCP

Resources/tools filtrados:

- obter project summary e context bundle;
- consultar decisions/ADRs/constraints;
- navegar architecture relations;
- listar proposals e findings;
- explicar evidence lineage;
- registrar draft artifact ou proof;
- solicitar proposal/experiment, sem autoaprovação.

Uso: coding agents, IDEs e external agentic apps.

### Evolution Governance MCP

- consultar capabilities e policy explanation;
- validar plan/action;
- solicitar approval;
- consultar approval status;
- registrar attestation.

Não expõe policy mutation a agentes comuns.

### Evolution Module MCP

- descobrir módulos permitidos;
- inspecionar metadata/permissions;
- solicitar instalação/update;
- consultar compatibility/health.

Instalação permanece command governado.

## 3. Conectores SCM

Capabilities normalizadas:

- repo metadata/read;
- commit/diff/PR read;
- issue read/create;
- branch/create;
- draft PR create/update;
- CI status/artifact read;
- webhook events.

Adapters: GitHub, GitLab, Bitbucket e local Git. Write capabilities são separadas.

## 4. Documentação e knowledge

- Local filesystem/repo docs.
- Confluence/Notion/Google Drive/SharePoint adapters futuros.
- Backstage/catalog and TechDocs.
- URL/documentation snapshot connector.
- Architecture repositories (CALM, C4, Structurizr, LikeC4).

## 5. Work management

- Jira, Linear, Azure Boards, GitHub/GitLab Issues.
- Roadmap/product systems como Productboard.
- Slack/Teams somente para notification/interaction autorizada, não source of truth.

## 6. Observability and operations

- OpenTelemetry/OTLP.
- Prometheus-compatible metrics.
- Grafana, New Relic, Dynatrace, Datadog adapters.
- Incident platforms e status pages.
- Cloud cost/FinOps sources.

Queries devem usar service accounts read-only e limits. Raw traces/logs ficam no Node quando restricted.

## 7. Security and supply chain

- CVE/OSV/NVD/vendor advisories.
- SAST/SCA/secret scanning tools.
- SPDX/CycloneDX SBOM sources.
- Container/artifact registries.
- Policy engines e SIEM export.

## 8. Cloud and infrastructure

- IaC files first: Terraform, CloudFormation, Pulumi, Kubernetes manifests.
- Cloud inventory adapters AWS/Azure/GCP.
- Kubernetes APIs via scoped service account.
- CI/CD and deployment systems.

Write cloud tools ficam fora do MVP e requerem high-risk policy.

## 9. Product and market intelligence

- Customer feedback systems.
- Analytics/feature experimentation.
- App reviews/support tickets.
- Web search/documentation feeds.
- Competitor websites/changelogs/pricing snapshots.
- Academic indexes e standards feeds.

External web content entra em quarantine/evidence pipeline.

## 10. AI/harness sources

- Model provider catalogs/changelogs/pricing.
- Prompt/eval/trace platforms.
- Agent Skill registries.
- MCP registries.
- IDE/agent config scanners.
- Local harness directories and manifests.

## 11. MCP selection policy

Antes de ativar um server:

- identity/publisher conhecido;
- transport e auth adequados;
- tool schemas versionados;
- capabilities mapeadas;
- token audience isolation;
- data destinations/classifications;
- injection and tool poisoning tests;
- health/SLO;
- rate/cost limits;
- revocation path.

## 12. Tool discovery budget

Para uma task:

1. Orchestrator identifica domains.
2. Policy limita connectors.
3. Gateway seleciona no máximo as capabilities necessárias.
4. Agent vê descriptions compactas.
5. Schema completo é carregado ao escolher tool quando runtime suportar.

Goal: diminuir context pollution e seleção incorreta.

## 13. Integrações iniciais recomendadas

Primeiro release:

- local Git/filesystem;
- GitHub read;
- manual/URL evidence;
- model provider abstrato;
- Evolution Project MCP local;
- OTel emission.

Segundo:

- GitHub issue/draft PR;
- GitLab;
- Prometheus/OTel query;
- architecture-as-code;
- dependency/security sources.

Enterprise:

- Backstage/catalog;
- Jira/Confluence;
- corporate observability;
- cloud inventory;
- product/customer sources;
- SIEM/GRC.

