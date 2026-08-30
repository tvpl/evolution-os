# Arquitetura da experiência Next.js

## 1. Decisão

Next.js App Router será o frontend e BFF de experiência. O runtime agentic, workflow engine, connector execution e authoritative domain logic vivem fora do processo web.

## 2. Responsabilidades do Next.js

- Routing, layouts e navigation.
- Server-side session e authorization-aware data composition.
- Server Components para leitura e primeira renderização.
- Client Components para graph canvas, filters, editors e real-time progress.
- Route Handlers/BFF para composition, CSRF-safe mutations e streaming proxy quando necessário.
- Design system, accessibility, i18n e theming.
- Optimistic UI somente para ações facilmente reconciliáveis.

## 3. Não responsabilidades

- Executar runs longos.
- Ser event broker.
- Guardar workflow state em memória.
- Conectar diretamente a bancos por toda a UI sem domain API.
- Armazenar secrets de connectors.
- Tomar policy decisions no client.
- Considerar Server Action como job durability.

## 4. Estrutura de rotas conceitual

```text
app/
├── (auth)/
├── (workspace)/[workspaceId]/
│   ├── inbox/
│   ├── portfolio/
│   ├── projects/[projectId]/
│   ├── proposals/[proposalId]/
│   ├── runs/[runId]/
│   ├── campaigns/
│   ├── evidence/
│   ├── modules/
│   └── governance/
├── onboarding/
└── api/              # BFF/streaming/webhook only when appropriate
```

## 5. Frontend domains

- Shell/navigation/command palette.
- Evolution Inbox.
- Portfolio analytics.
- Project Twin explorer.
- Proposal workspace.
- Graph/architecture viewer.
- Harness observatory.
- Agent run explorer.
- Module/connector manager.
- Policy/governance console.

Cada domínio possui server data contracts, client view models e permission tests.

## 6. Data fetching

- Server Components fazem queries iniciais com user context.
- Backend retorna projection específica da view; frontend não recompõe o grafo inteiro.
- Client faz pagination/filter/drill-down incremental.
- TanStack Query ou equivalente pode gerenciar client cache para interações; não duplica source of truth.
- Mutations retornam command receipt e resource version.
- Runs longos retornam ID; progresso vem de event stream e pode ser reconsultado.

## 7. Real-time

- SSE como default para one-way progress/inbox updates.
- WebSocket apenas para colaboração bidirecional ou graph editing se necessário.
- Client reconecta com cursor/last event ID.
- Estado terminal sempre é confirmado pela API.
- UI mostra stale/reconnecting sem apresentar progresso fantasma.

## 8. Design system

Tokens semânticos:

- status: healthy, watch, attention, critical, unknown;
- epistemic: fact, inference, hypothesis, recommendation, decision;
- confidence bands;
- autonomy/risk levels;
- source freshness.

Componentes centrais:

- EvidenceBadge/LineageDrawer.
- ConfidenceBreakdown.
- ImpactGraph.
- ProposalCard/DecisionPanel.
- CapabilityDiff.
- RunTimeline.
- FreshnessIndicator.
- ConflictPanel.
- PolicyExplanation.
- ExperimentComparison.

## 9. Segurança frontend

- Sem token sensível em browser storage.
- HttpOnly secure session cookies ou approved token pattern.
- CSRF defense para mutations.
- CSP e dependency hygiene.
- Sanitização rigorosa de Markdown/evidence.
- External links e embedded content isolados.
- Authorization no backend; UI hiding é conveniência.
- Telemetry client sem conteúdo confidencial.

## 10. Performance

- Route-level streaming/skeletons.
- Virtualização em listas/grafos grandes.
- Aggregate endpoints e lazy relationships.
- Charts server-prepared quando possível.
- Bundle budgets; graph/editor libraries carregadas sob demanda.
- Cache de leitura com tags/versions, sem cache compartilhado cross-tenant.

## 11. Testes

- Component e accessibility tests.
- Route authorization matrix.
- BFF contract tests.
- E2E dos fluxos críticos.
- SSE reconnect/resume.
- Redaction e cross-tenant negative tests.
- Large graph/list performance.
- Visual regression para estados fact/inference/conflict.

## 12. Progressive disclosure

Home mostra 3–7 itens prioritários. Details expandem score e impact. Evidence abre lineage. Raw source exige ação explícita e autorização. Isso reduz carga cognitiva sem esconder fundamentos.

