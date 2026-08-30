# PRD-004 — Evolution Node

**Status:** Accepted  
**Objetivo:** Dar a cada projeto um runtime autônomo, local e seguro para observação, análise e execução.

## 1. Tese

O sistema central não deve precisar receber todo o código, segredos, telemetria ou dados do projeto. Um Node opera junto ao ambiente do projeto, possui identidade própria e sincroniza somente o que policies permitem.

O mesmo Node deve funcionar em quatro formas:

- CLI sob demanda;
- GitHub/GitLab CI runner;
- daemon agendado;
- serviço/Kubernetes workload para uso contínuo.

## 2. Modos

### Standalone

- Inicializa `.evolution/`.
- Usa arquivos locais e storage leve.
- Executa módulos instalados.
- Produz relatório, artifacts, issues ou PRs locais.
- Pode usar modelos locais ou remotos configurados.
- Não exige conta ou Hub.

### Managed

- Registra-se no Hub usando identidade de workload.
- Recebe policies, campaigns e módulos permitidos.
- Emite heartbeat, capabilities e resultados minimizados.
- Mantém execução e dados sensíveis localmente.

### Air-gapped/federated

- Recebe bundles assinados por canal controlado.
- Exporta pacotes de resultado assinados.
- Não depende de conexão permanente.

## 3. Responsabilidades

- Descobrir estrutura local e validar o manifest.
- Hospedar sensors e analyzers locais.
- Manter cache e snapshot do projeto.
- Aplicar policy antes de qualquer tool call.
- Montar contexto mínimo para agentes.
- Mediar acesso a SCM, filesystem, CI, IaC e telemetry.
- Executar sandbox e guardar proof artifacts.
- Assinar resultados e manter audit log local.
- Sincronizar dados autorizados com o Hub.
- Expor um MCP local opcional para coding agents consultarem o Twin e proposals.

## 4. Requisitos

- **NODE-FR-001:** funcionar sem Hub para fluxos principais read-only.
- **NODE-FR-002:** instalar sem privilégios administrativos sempre que possível.
- **NODE-FR-003:** declarar capabilities reais em cada heartbeat.
- **NODE-FR-004:** negar capability não concedida, mesmo que o agente peça.
- **NODE-FR-005:** usar credenciais de curta duração ou helpers nativos; nunca expor segredo ao prompt.
- **NODE-FR-006:** suportar execução efêmera e persistente.
- **NODE-FR-007:** manter spool local quando Hub estiver indisponível.
- **NODE-FR-008:** sincronizar de forma idempotente e retomável.
- **NODE-FR-009:** permitir política `metadata-only`, `derived-only`, `artifact-approved` ou `full-sync`.
- **NODE-FR-010:** isolar módulos e limitar CPU, memória, rede, filesystem e duração.
- **NODE-FR-011:** validar assinatura e digest antes de executar módulo.
- **NODE-FR-012:** produzir attestations sobre versão, inputs e ambiente.
- **NODE-FR-013:** suportar atualização com rollback.
- **NODE-FR-014:** funcionar com provider de modelo plugável.
- **NODE-FR-015:** registrar trace correlacionável sem incluir segredo ou conteúdo restrito.
- **NODE-FR-016:** oferecer dry-run para toda ação mutável suportada.
- **NODE-FR-017:** permitir desligamento de rede por execução.
- **NODE-FR-018:** fornecer health, diagnostics e compatibility report.

## 5. Estrutura local sugerida

```text
.evolution/
├── project.yaml
├── policies/
├── baselines/
├── decisions/
├── evals/
├── modules.lock
├── sources/
└── generated/       # não é fonte de verdade sem revisão
```

Caches, secrets e estado transitório não ficam obrigatoriamente no repositório.

## 6. Sincronização

O Node mantém um cursor por stream e usa envelopes assinados. Hub e Node não assumem ordem global. Cada atualização contém:

- node/project/tenant IDs;
- event ID e causation/correlation IDs;
- snapshot/version;
- classificação;
- schema version;
- digest;
- conteúdo ou referência autorizada;
- attestation da execução.

Conflitos não são resolvidos por last-write-wins para decisões ou artefatos humanos. Entram em reconciliation.

## 7. Experiência do desenvolvedor

Comandos conceituais:

- `init`: criar estrutura e wizard.
- `doctor`: validar ambiente, manifest, modules e policies.
- `snapshot`: observar o projeto.
- `analyze`: executar uma análise ou profile.
- `inbox`: listar findings/proposals locais.
- `explain`: navegar evidence lineage.
- `experiment`: preparar execução isolada.
- `verify`: rodar proof plan.
- `sync`: registrar ou sincronizar com Hub.
- `module`: listar, instalar, atualizar e auditar módulos.

Os nomes finais são decisão de interface; a semântica é contratual.

## 8. Critérios de aceite

- Projeto local obtém primeiro finding sem criar conta.
- Bloqueio de egress impede fonte externa sem quebrar análise local.
- Hub indisponível não causa perda de resultado.
- Policy metadata-only é comprovada por testes de contrato.
- Um módulo sem assinatura ou capability é rejeitado antes de iniciar.
- Após timeout mutável, o Node verifica idempotency status antes de retry.
- Usuário pode remover o Node sem perder artefatos versionados do projeto.

