# ADR-003 — Next.js como console e BFF

**Status:** Accepted  
**Data:** 2026-08-29

## Contexto

O usuário escolheu Next.js para frontend. A plataforma possui jobs longos, events, agent runtime e connectors que não devem depender do lifecycle de requests do frontend.

## Decisão

Usar Next.js App Router para UI e BFF de experiência. Server Components compõem leituras; Client Components cobrem interações. Route Handlers/Server Actions podem iniciar commands curtos, mas authoritative logic, durable workflows e connectors vivem no Control Plane.

## Consequências

- UX moderna, SSR/streaming e routing consistente.
- Segurança e data composition server-side.
- Backend pode evoluir independentemente.
- Exige API contracts e evita acesso ad hoc ao banco.
- Mais componentes de deployment que um monólito Next.js full-stack.

## Rejeitado

- Executar workflow agentic dentro de Route Handler.
- Manter progress state em memória do Next.js.
- Usar browser como policy enforcement point.

## Review triggers

- Backend separation gera custo sem benefício no Lite profile.
- Next.js runtime oferece primitive durable comprovada e adequada — ainda assim domain boundary será preservado.
- UI muda para outra tecnologia; APIs continuam válidas.

