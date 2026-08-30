# Autonomia e aprovações

## 1. Níveis

| Nível | Nome | Permitido |
|---:|---|---|
| A0 | Observe | Ler fontes autorizadas e criar observations |
| A1 | Analyze | Criar findings e drafts, sem external write |
| A2 | Prepare | Gerar plan, patch e experiment em sandbox |
| A3 | Propose externally | Criar issue, branch ou draft PR após policy |
| A4 | Execute reversible | Aplicar mudança reversível com gates |
| A5 | Operate constrained | Merge/deploy limitado a classes pré-aprovadas |

A5 não inclui delete irreversível ou alteração de política. Essas ações usam exceptional workflow separado.

## 2. Autonomy ceiling

O nível efetivo é o mínimo entre:

- organization ceiling;
- workspace/project ceiling;
- agent/module/tool ceiling;
- data/environment restriction;
- task decision grant;
- current trust/health state.

Nenhum componente pode calcular “máximo” usando união de permissões.

## 3. Risk dimensions

- Data sensitivity.
- Environment criticality.
- Blast radius.
- Reversibility.
- Determinism.
- Evidence strength.
- Eval coverage.
- Historical success.
- External side effect.
- Regulatory/financial impact.

Policy produz risk class R0–R5 e approval route.

## 4. Approval object

Approval liga-se a:

- exact proposal/plan/change digest;
- scope e capabilities;
- actor/role;
- expiry;
- conditions;
- required proof;
- separation-of-duties constraints.

Qualquer mudança material de plan, target ou capability invalida o approval.

## 5. Quatro olhos e segregação

Para classes altas:

- proposer não é único approver;
- module publisher não aprova sua instalação;
- coding agent não verifica sozinho a mudança que produziu;
- policy admin não aprova exceção própria sem segundo papel;
- production deployment pode exigir owner + risk/security.

## 6. Safe defaults

- Timeout de approval: expire/defer, não approve.
- Falha de policy service: deny material action.
- Evidence stale: request refresh.
- Node health uncertain: do not dispatch write task.
- Unknown side effect: reconcile.
- Model unqualified: no fallback para material task.

## 7. Autonomy promotion

Projeto pode solicitar aumento quando:

- eval coverage satisfaz threshold;
- volume mínimo de runs verificados;
- rollback demonstrado;
- incident/unauthorized rate dentro do limite;
- owner e security aprovam;
- promotion é limitada a action class e prazo.

Promoção não é automática por aceitação de propostas. Pode haver demotion automática por security signal, module revocation ou guardrail breach, seguida de revisão humana.

## 8. UI de aprovação

Mostrar:

- objetivo e diffs;
- evidence/impact;
- exact capabilities;
- target environment/resources;
- side effects e blast radius;
- proof plan;
- rollback;
- policy explanation;
- other approvers/conflicts;
- approval expiry.

Botões genéricos “Confirmar” são insuficientes para R3+.

## 9. Break glass

- identidade humana forte;
- motivo e incident/ticket obrigatório;
- time-bound capability;
- notification imediata;
- session recording/audit;
- post-action review;
- não disponível a agentes autônomos.

## 10. Exemplos

| Ação | Nível máximo padrão | Aprovação típica |
|---|---:|---|
| Ler manifest local | A0 | Setup policy |
| Criar finding | A1 | Nenhuma adicional |
| Gerar patch no sandbox | A2 | Proposal/experiment approval conforme data |
| Abrir draft PR | A3 | Project owner ou policy preapproval |
| Auto-merge patch dependency | A4 | Classe allowlisted + tests/proof |
| Deploy produção | A5 excepcional | Change owner + policy + environment gates |
| Alterar autonomy policy | Fora do agent ceiling | Human governance only |

