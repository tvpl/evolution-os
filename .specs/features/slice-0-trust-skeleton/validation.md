# Validation Report — slice-0-trust-skeleton

- **Result**: PASS
- **Diff range**: 15774fd..65704d8
- **Date**: 2026-08-31
- **Verifier**: independent (evidence-or-zero; author != verifier)

## Gates — comandos executados e contagens reais

| Gate | Comando | Resultado |
| ---- | ------- | --------- |
| DB | `bash scripts/dev-db.sh start` | up (`postgresql://evo@127.0.0.1:55432/evolution`) |
| Unit | `pnpm test:unit` (raiz) | exit 0 — 18 passed (packages/contracts, test/contracts.test.ts) |
| Integration | `pnpm test:int` (raiz) | exit 0 — 44 passed (apps/hub, 8 files) + 5 passed (apps/node/test/cli.test.ts) |
| E2E | `cd apps/console && pnpm test:e2e` | exit 0 — 2 passed (e2e/register.spec.ts, hub+console reais, 24.7s) |
| **Total** | | **67 unit/int + 2 e2e, todos verdes** |

Re-execução pós-sensor: `cd apps/hub && pnpm vitest run` → 44 passed, exit 0 (árvore restaurada).

## Per-AC evidence

Caminhos abreviados: `hub/` = `apps/hub/test/`, `contracts/` = `packages/contracts/test/`, `node/` = `apps/node/test/`, `console/` = `apps/console/e2e/`.

| TRUST-ID / AC | Evidence (file:line + asserção) | Spec outcome | Coberto? |
| ------------- | -------------------------------- | ------------ | -------- |
| TRUST-01 — persist + emit via outbox, mesmo type, MESMA transação | hub/registry.test.ts:76 `expect(outbox.rows[0].type).toBe("io.evolutionos.project.project.registered.v1")`; :69 projeto persistido `{org_id:"org_dev_a", workspace_id:"ws_dev_a"}`; :75 `expect(outbox.rowCount).toBe(1)`; mesma-tx provada em :135-151 — envelope inválido detectado após o insert do projeto → `rejects.toThrow("event envelope violates contract")` e :150 `expect(await counts()).toEqual(before)` (rollback conjunto projeto+evento) | Persistência + evento CloudEvents do type exato pela outbox transacional na mesma tx | Sim |
| TRUST-02 — projeção consumida → console exibe do read model | hub/outbox-projection.test.ts:76 lista vazia antes do dispatch, :79 `expect(stats).toEqual({delivered:1,...})`, :83 `expect(projects[0]).toMatchObject({project_id: projectId, name: "Projeto proj-flow"})` (GET /projects lê projects_view); UI real: console/register.spec.ts:24 `toContainText("registrado: prj_")` e :29 `expect(page.getByTestId("project-list")).toContainText(name)` após reload | Console exibe o projeto a partir do read model projetado | Sim |
| TRUST-03 — 6 extensions obrigatórias | hub/registry.test.ts:86-93 `expect(envelope).toMatchObject({tenantid:"org_dev_a", workspaceid:"ws_dev_a", projectid: projectId, classification:"internal", schemaversion:"1", correlationid: expect.stringMatching(/^req_/)})` — as 6 nomeadas — + :85 `expect(validateEvent(envelope)).toEqual({ok:true, errors:[]})`; schema exige extension: contracts/contracts.test.ts:180 `expect(result.errors.join("\n")).toContain("tenantid")` | Evento carrega `tenantid`, `workspaceid`, `projectid`, `correlationid`, `classification`, `schemaversion` | Sim |
| TRUST-04 — mesma key+digest → resultado anterior, sem evento duplicado | hub/registry.test.ts:100-102 `expect(replay.statusCode).toBe(200)`, `expect(replay.json().projectId).toBe(first.json().projectId)`, `expect(await counts()).toEqual(before)` (nenhuma linha nova em projects nem outbox) | Retorna resultado anterior sem emitir duplicata | Sim |
| TRUST-05 — key reutilizada com digest diferente → conflito | hub/registry.test.ts:109-111 `expect(res.statusCode).toBe(409)`, `expect(res.json().title).toBe("idempotency_conflict")`, `expect(await counts()).toEqual(before)` | Rejeição como conflito | Sim |
| TRUST-06 — sessão escopada a exatamente uma org/workspace | hub/identity.test.ts:32 `expect(scope).toEqual({userId:"user_dev_a", orgId:"org_dev_a", workspaceId:"ws_dev_a"})`; reforço :68-77 header `x-tenant-id` forasteiro é ignorado (`scope.orgId === "org_dev_a"`); :53-66 token adulterado → 401 | Login estabelece sessão de um único org+workspace | Sim |
| TRUST-07 — negação cross-tenant | hub/registry.test.ts:173-174 `expect(res.statusCode).toBe(403)`, `expect(res.json().title).toBe("access_denied")` (sessão B lendo projeto de A); projeção também isolada: hub/outbox-projection.test.ts:147 `expect(await listProjects(tokenB)).toEqual([])` | API nega requisição a projeto de outro tenant | Sim |
| TRUST-08 — auditoria de negação com actor/action/reason | hub/registry.test.ts:178-183 `expect(audit.rows[0]).toEqual({actor:"user_dev_b", action:"project.read", outcome:"denied", reason:"cross-tenant access"})`; hub/policy.test.ts:59-66 audit da negação de capability com actor/action/resource/outcome/reason/correlation_id | Registro de auditoria em toda negação | Sim |
| TRUST-09 — deny-by-default | hub/policy.test.ts:30-33 `expect(decision).toEqual({allowed:false, reason:"no grant for capability 'module.install' in workspace 'ws_dev_a'"})`; :44 grant de outro workspace não vaza (`decision.allowed === false`); ponta a ponta: hub/registry.test.ts:213-218 sem grant → 403 `capability_denied` + audit `denied` | Capability sem grant explícito é negada | Sim |
| TRUST-10 — trace único correlacionado via correlationid | hub/telemetry.test.ts:69 `expect(consume!.spanContext().traceId).toBe(command!.spanContext().traceId)`; :72-73 `expect(command!.attributes["correlationid"]).toBe("req_otel_1")` e idem no span de consume; leg do cliente/UI: :95-96 traceparent W3C do cliente continua no comando e na projeção; outbox leg: :113 `expect(row.rows[0].traceparent).toContain(command!.spanContext().traceId)` | Spans de UI, API, outbox e projeção sob um único trace | Sim (ver precision gap 1) |
| TRUST-11 — workflow durável: checkpoint sobrevive e retoma sem repetir steps | hub/workflow.test.ts:57 `expect(resumed).toMatchObject({stepsExecuted:1, stepsSkipped:2, completed:[id]})`; :61-66 contadores `{runs_greet:1, runs_subject:1, runs_compose:1}` provam zero re-execução; :76-78 timestamps de `greet`/`subject` idênticos antes/depois da retomada; checkpoint persistido: :35 `expect(wf.rows[0].checkpoint).toMatchObject({message:"hello evolution"})` | Retomada do checkpoint sem repetir steps completados | Sim (ver precision gap 2) |
| TRUST-12 — enroll registra identidade e faz ack | hub/nodes.test.ts:49-52 ack `{nodeId:/^node_/, token:/^nodetok_/}`; :57-62 linha em `node_agents` com org/workspace/name; :64 só o hash do token persiste; CLI: node/cli.test.ts:110 `expect(enroll.out).toMatch(/enrolled: node_/)`, :114-115 identidade consultável no Hub | Hub registra identidade do Node e reconhece o enrollment | Sim |
| TRUST-13 — sync dummy grava referência com content digest | hub/nodes.test.ts:81 `expect(res.json()).toMatchObject({digest: DUMMY_DIGEST, recorded:true})`, :85 `expect(row.rows[0]).toEqual({name:"dummy.txt", digest: DUMMY_DIGEST})` (sha256 real do conteúdo); CLI: node/cli.test.ts:126 `expect(sync.out).toContain(\`digest ${expectedDigest}\`)`, :133 linha em `node_artifacts` com o digest exato; conteúdo≠digest → 422 `digest_mismatch` (nodes.test.ts:96-97) | Hub grava referência do artefato com seu content digest | Sim |
| TRUST-14 — sync sem enroll rejeitado | hub/nodes.test.ts:100-112 sem token e com token forjado → `expect(res.statusCode).toBe(401)` + `title === "node_unauthorized"`; :114-122 node desconhecido → 401; CLI: node/cli.test.ts:103-104 `expect(sync.code).not.toBe(0)`, `expect(sync.out).toContain("not enrolled")` | Hub rejeita sync de node não enrolled | Sim |
| TRUST-15 — 5 schemas v0 versionados | contracts/contracts.test.ts:27-29 `for (name of ["project","evidence","proposal","decision","event"]) expect(SCHEMA_VERSIONS[name]).toBe("v0")` | Schemas v0 de project, evidence, proposal, decision, event | Sim |
| TRUST-16 AC2 — validação rejeita payload inválido | contracts/contracts.test.ts:74-75 projeto sem `metadata.slug` → `ok:false` + erro contém "slug"; :94-95 proposal sem `optionRef` falha; :123-124 evidence sem `contentDigest` falha; :144 decision fora do enum falha; :179-180 evento sem `tenantid` falha; :184-185 type fora da taxonomia falha; hub aplica no comando: hub/registry.test.ts:130-132 manifest sem slug → 422 + erros citam "slug" + zero linhas; UI: console/register.spec.ts:42-44 `toContainText("invalid_manifest")` e nada registrado | Payloads que violam o schema são rejeitados | Sim |
| TRUST-16 AC3 — examples/ validam | contracts/contracts.test.ts:37-62 os 4 manifests de `examples/` (project, proposal, module, policy — todos os arquivos do diretório) → `expect(validateManifest(...)).toEqual({ok:true, errors:[]})` | Manifests de exemplo passam na validação v0 | Sim |
| Edge 1 — duplicate delivery → no-op (inbox) | hub/outbox-projection.test.ts:92 redelivery forçada → `expect(stats).toEqual({delivered:0, deduplicated:1, failed:0})`, :94 `projects_view` continua com 1 linha | Duplicata aplicada como no-op | Sim |
| Edge 2 — dispatcher down → pendente, entregue após recovery | hub/outbox-projection.test.ts:103 `expect(pending.rows[0].dispatched_at).toBeNull()`, :104 projeção vazia, :111-112 após `runDispatcherOnce` entregue e listado; consumer falhando mantém pendente p/ retry: :125-133 | Evento pendente sem perda, entregue após recuperação | Sim |
| Edge 3 — sessão sem workspace scope → request negada | **Sem asserção de teste.** A implementação cobre (apps/hub/src/identity/session.ts:36 `if (!scope.userId || !scope.orgId || !scope.workspaceId) return null;` → 401), mas nenhum teste constrói um token assinado sem `workspaceId`; `signSession` só é usado em teste com escopo completo (hub/identity.test.ts:55-58) | Qualquer request project-scoped negada | **Não** (gap G1) |
| Edge 4 — registros concorrentes → projectids distintos, nada perdido | hub/registry.test.ts:158-160 `Promise.all` de dois POSTs → ambos `statusCode === 201` e `expect(r1.json().projectId).not.toBe(r2.json().projectId)` | Ambos eventos com projectid distinto, nenhum registro perdido | Sim |

## Discrimination sensor

Baseline `git status --porcelain`: limpo. Backups em scratchpad (`verifier2/`), restauração por cópia (sem git stash).

| Mutação | Teste que matou | Resultado | Árvore restaurada |
| ------- | --------------- | --------- | ----------------- |
| (a) `policy.ts` — `checkCapability` sempre `{allowed:true}` | `test/policy.test.ts` + `test/registry.test.ts` | **Morto** — 4 failed / 12 passed, exit 1 | Sim (CLEAN) |
| (b) `session.ts` — `verifySession` sem verificação de assinatura | `test/identity.test.ts` ("tampered token is rejected") | **Morto** — 1 failed / 5 passed, exit 1 | Sim (CLEAN) |
| (c) `outbox.ts` — dedup do inbox removido (duplicata processa) | `test/outbox-projection.test.ts` ("duplicate delivery... no-op") | **Morto** — 1 failed / 5 passed, exit 1 | Sim (CLEAN) |
| (d) `registry.ts` — insert do evento no outbox removido | `test/registry.test.ts` | **Morto** — 2 failed / 9 passed, exit 1 | Sim (CLEAN) |
| (e) `workflow.ts` — sem registro em `workflow_steps` | `test/workflow.test.ts` ("resumes without repeating" + "checkpoint per step") | **Morto** — 2 failed / 1 passed, exit 1 | Sim (CLEAN) |

**5/5 mutantes mortos.** Verificação final: `git status --porcelain` vazio, `git diff` vazio, suite completa do hub re-executada verde (44 passed).

## Spec-precision gaps

1. **TRUST-10 (menor)** — a spec nomeia "UI, API, outbox and projection spans"; não há asserção de um span literal da UI. A leg da UI é provada por proxy: continuação do `traceparent` W3C enviado pelo cliente (telemetry.test.ts:76-97) + round-trip E2E real. As legs API, outbox (traceparent persistido na linha) e projeção têm asserções diretas.
2. **TRUST-11 (menor)** — "checkpoint survives a process restart" é simulado por runner com budget esgotado + nova invocação lendo o checkpoint persistido no Postgres (workflow.test.ts:44-57), não por kill literal do processo OS. A propriedade durável (estado exclusivamente no banco, timestamps intactos, contadores `runs_*` = 1) é assertada diretamente; simulação considerada fiel.

## Gaps — ranqueados

1. **G1 (P3 — edge case, não bloqueante)**: Edge Case "IF a session carries no workspace scope THEN any project-scoped request SHALL be denied" não tem asserção de teste. A guarda existe (session.ts:36) e é estruturalmente difícil de violar (dev-login sempre emite escopo completo; token sem workspaceId falharia HMAC se forjado externamente), mas evidence-or-zero: não coberto. Sugestão: teste que assina com o secret real um payload sem `workspaceId` e asserta 401 em `GET /projects`.

Nenhum AC P1 sem evidência. Veredito **PASS** ponderado: 16/16 requisitos TRUST cobertos com asserções localizadas, 3/4 edge cases cobertos, 5/5 mutantes mortos, todos os gates verdes.

## Addendum — fix do gap G1 (pós-verificação)

G1 fechado pelo orquestrador: `apps/hub/test/identity.test.ts` ganhou o teste
"a signed token without workspace scope is rejected (project-scoped requests denied)"
— token assinado com o segredo real e `workspaceId` vazio recebe 401 em `/me` e
`/projects` (asserções `expect(res.statusCode).toBe(401)`). Suite identity:
7 passed. Nenhum gap aberto restante.
