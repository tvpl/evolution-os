# PRD-005 — Ecossistema de módulos

**Status:** Proposed para MVP privado; marketplace público é pós-MVP  
**Objetivo:** Permitir expansão segura sem acoplar o núcleo a toda fonte, técnica ou ferramenta.

## 1. Princípio

EvolutionOS não terá “uma skill para cada coisa” carregada em todos os agentes. Ele terá pacotes instaláveis com capacidades explícitas. Um módulo pode conter um ou mais componentes:

- sensor;
- analyzer determinístico;
- agent skill;
- policy pack;
- connector/MCP adapter;
- executor;
- UI contribution;
- schema/ontology extension;
- eval pack;
- transformation recipe.

## 2. Profiles de módulos

### Core modules

Mantidos pelo projeto, necessários ao fluxo fundador: manifest, evidence, proposal, policy, audit e basic repo sensor.

### Verified modules

Revisados, assinados, com evals e suporte definido. Podem ser públicos ou privados.

### Community modules

Assinados pelo autor, sem endosso. Instalação exige policy e mostra risco.

### Private modules

Publicados em registry da organização, com controle e proveniência internos.

## 3. Lifecycle

`discover → inspect → resolve dependencies → policy check → install → configure → activate → observe → update → quarantine/rollback → uninstall`

Atualização nunca eleva permissões silenciosamente. Nova capability exige aprovação.

## 4. Requisitos

- **MOD-FR-001:** manifest declara identidade, versão, publisher, license e compatibility.
- **MOD-FR-002:** declarar todos os component types.
- **MOD-FR-003:** declarar capabilities e data classifications exigidas.
- **MOD-FR-004:** declarar network destinations quando aplicável.
- **MOD-FR-005:** declarar schemas de input/output e side effects.
- **MOD-FR-006:** incluir digest, signature, provenance e SBOM.
- **MOD-FR-007:** incluir evals e exemplos mínimos.
- **MOD-FR-008:** suportar lockfile por projeto.
- **MOD-FR-009:** resolver compatibilidade sem executar código.
- **MOD-FR-010:** executar em processo/container/WASM isolado conforme risco.
- **MOD-FR-011:** permitir instalação central com activation local seletiva.
- **MOD-FR-012:** registrar versão efetivamente usada em cada finding/proposal.
- **MOD-FR-013:** suportar rollout gradual e rollback.
- **MOD-FR-014:** quarentenar módulo após falha de assinatura, policy ou segurança.
- **MOD-FR-015:** não permitir que UI contribution execute capability não declarada.
- **MOD-FR-016:** separar configuração não secreta de secret references.

## 5. Distribuição

Pacotes devem usar OCI artifacts para distribuição, pois registries existentes suportam artefatos associados e digest endereçável. Assinaturas e attestations usam Sigstore/cosign ou equivalente enterprise. A decisão está registrada em ADR.

O pacote pode conter:

```text
module/
├── evolution.module.yaml
├── components/
├── skills/
├── policies/
├── schemas/
├── evals/
├── docs/
├── sbom.spdx.json
└── provenance.json
```

## 6. Módulos iniciais propostos

| Módulo | Componentes principais | Onde roda |
|---|---|---|
| `project-foundation` | Manifest, artifact import, baseline | Hub/Node |
| `git-intelligence` | Repo sensor, churn/hotspots, PR connector | Node |
| `dependency-health` | SBOM, EOL/CVE, update candidate | Node |
| `architecture-intelligence` | CALM/C4 import, graph, drift, fitness | Node/Hub |
| `product-radar` | Feedback, competitor and market signals | Hub |
| `technology-radar` | Docs, releases, standards, EOL | Hub |
| `harness-intelligence` | Skills/MCP/model inventory and evals | Node |
| `documentation-sync` | Drift and change proposal | Node |
| `runtime-fit` | OTel/SLO/cost correlation | Node/Hub |
| `security-governance` | Threat, secrets, policy checks | Node |
| `change-experiment` | Sandbox, benchmark and proof artifacts | Node |
| `portfolio-campaigns` | Cross-project grouping and rollout | Hub |

## 7. Marketplace UX

Antes de instalar, mostrar:

- publisher e trust tier;
- última atualização e suporte;
- compatibilidade;
- permissions/capabilities;
- dados acessados e enviados;
- destinations de rede;
- side effects;
- resultados de evals;
- vulnerabilidades e SBOM;
- projetos que usam e status do rollout;
- mudanças de permissão entre versões.

## 8. Critérios de aceite

- Um módulo privado pode ser publicado e instalado sem marketplace público.
- Instalação offline é possível por bundle assinado.
- Lockfile reproduz o conjunto de módulos.
- Upgrade com nova capability bloqueia até aprovação.
- Finding mantém referência à versão do módulo mesmo após upgrade.
- Desinstalar um módulo não apaga evidências e decisões produzidas.

