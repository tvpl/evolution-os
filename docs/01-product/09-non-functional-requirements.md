# Requisitos não funcionais

## Segurança e privacidade

- **NFR-SEC-001:** autenticação OIDC/OAuth 2.1 e workload identity para Nodes.
- **NFR-SEC-002:** autorização por tenant, project, capability, resource e action.
- **NFR-SEC-003:** read-only default e deny-by-default.
- **NFR-SEC-004:** segredos não entram em prompt, log, trace ou artifact.
- **NFR-SEC-005:** encryption in transit e at rest; customer-managed keys no enterprise.
- **NFR-SEC-006:** data residency e retention configuráveis.
- **NFR-SEC-007:** módulos assinados, SBOM e provenance.
- **NFR-SEC-008:** sandbox com isolamento e egress control.
- **NFR-SEC-009:** prompt injection defense em dados externos.
- **NFR-SEC-010:** auditoria tamper-evident para decisões e ações materiais.

## Disponibilidade e resiliência

- **NFR-RES-001:** Hub indisponível não impede Node standalone.
- **NFR-RES-002:** jobs longos são durable, pausáveis e retomáveis.
- **NFR-RES-003:** event consumers são idempotentes.
- **NFR-RES-004:** partial failure é visível por fonte/módulo/etapa.
- **NFR-RES-005:** timeout mutável não gera retry cego.
- **NFR-RES-006:** backups e restore são testados.

## Escala

- **NFR-SCL-001:** Lite suporta 1–10 projetos em uma máquina.
- **NFR-SCL-002:** Team suporta centenas de projetos com workers horizontais.
- **NFR-SCL-003:** Enterprise suporta milhares de projetos e campanhas segmentadas.
- **NFR-SCL-004:** nenhuma listagem crítica depende de varrer o grafo inteiro.
- **NFR-SCL-005:** ingestion usa backpressure e quotas por tenant/source.

## Performance

- **NFR-PERF-001:** páginas interativas principais atingem resposta inicial p95 < 2,5 s sob carga-alvo, excluindo jobs.
- **NFR-PERF-002:** ações do usuário confirmam enqueue em p95 < 1 s.
- **NFR-PERF-003:** progresso de run aparece em até 5 s após evento.
- **NFR-PERF-004:** grandes grafos usam progressive loading e agregações.

## Portabilidade

- **NFR-PORT-001:** exportar project manifests, evidence, proposals e decisions em formatos documentados.
- **NFR-PORT-002:** providers de modelo são substituíveis.
- **NFR-PORT-003:** boundaries usam APIs/eventos abertos.
- **NFR-PORT-004:** deployment não depende exclusivamente de um cloud provider.

## Observabilidade e auditabilidade

- **NFR-OBS-001:** OTel traces, metrics e logs correlacionados.
- **NFR-OBS-002:** run registra versões de model, skill, module, policy e prompt bundle.
- **NFR-OBS-003:** custo por run/project/tenant.
- **NFR-OBS-004:** decisões de policy são explicáveis.
- **NFR-OBS-005:** evidence lineage navegável e exportável.

## Acessibilidade e usabilidade

- **NFR-UX-001:** WCAG 2.2 AA.
- **NFR-UX-002:** responsive desktop/tablet; mobile para triagem e aprovação segura.
- **NFR-UX-003:** internacionalização preparada; português e inglês como primeiros idiomas.
- **NFR-UX-004:** timestamps sempre exibem timezone e origem.

## Manutenibilidade

- **NFR-MNT-001:** modular boundaries e contract tests.
- **NFR-MNT-002:** schemas têm versionamento e migration policy.
- **NFR-MNT-003:** deprecation window para API/module contracts.
- **NFR-MNT-004:** EvolutionOS monitora a si próprio.
- **NFR-MNT-005:** toda capability crítica possui owner e SLO.

## IA e qualidade epistêmica

- **NFR-AI-001:** nenhuma decisão material depende somente de uma execução não avaliada.
- **NFR-AI-002:** evals cobrem groundedness, tool use, relevance e policy compliance.
- **NFR-AI-003:** models são versionados e gated por eval antes de promoção.
- **NFR-AI-004:** confidence é explicável e nunca apresentada como precisão garantida.
- **NFR-AI-005:** sistema rotula `fact`, `inference`, `hypothesis` e `recommendation`.

