# Especificação — Evidence Record

## 1. Objetivo

Representar evidência com origem, integridade, classificação e lineage suficientes para sustentar claims e decisões.

## 2. Tipos

- `sourceSnapshot`: conteúdo/fact capturado de fonte.
- `measurement`: metric/observation quantificada.
- `testResult`: deterministic/eval result.
- `humanStatement`: declaração atribuída.
- `runtimeObservation`: telemetry/incident fact.
- `derivedEvidence`: transformação explícita de evidence anterior.
- `referenceOnly`: source não armazenada por licença/policy.

## 3. Campos

### Identity

- `id`, `tenantId`, `workspaceId`.
- `type`, `status`.
- `createdAt`, `observedAt`, `sourceUpdatedAt`.

### Source

- source ID/provider/type.
- external stable ID/URI.
- publisher/author when available.
- authority category.
- publication/retrieval dates.
- version/etag.

### Integrity

- content digest and algorithm.
- content artifact ref or reference-only reason.
- capture method/module/version.
- signature/timestamp when available.

### Content

- media type/language.
- structured extraction.
- safe derived excerpt/summary.
- raw content classification/ref.
- licenses/usage constraints.

### Lineage

- parent evidence IDs.
- transformation type.
- module/model/prompt/skill versions.
- human annotations.

### Quality

- freshness.
- source authority.
- extraction confidence.
- corroboration group/source independence.
- contradiction links.
- verifiedBy.

### Governance

- classification.
- residency.
- retention policy.
- allowed uses.
- redaction state.
- legal hold/deletion state.

## 4. Claims

Claim é separado e contém:

- precise statement;
- epistemic type: fact/inference/hypothesis;
- support evidence/locations;
- contradiction evidence;
- scope/time/version qualifiers;
- confidence breakdown;
- extraction author/version.

Uma evidence pode suportar várias claims; uma claim deve usar várias evidences quando necessário.

## 5. Corroboration

Fontes que copiam o mesmo press release compartilham `originGroup`. Corroboration strength aumenta por independência e autoridade, não apenas count.

## 6. Mutation

Raw snapshot é immutable/content-addressed. Metadata pode ser versionada. Correção cria nova version/annotation; não reescreve digest. Source deletion/unavailability atualiza status e dispara re-evaluation.

## 7. Segurança

- Active content isolated.
- No instruction channel.
- Secret/PII scan/redaction policy.
- External links treated untrusted.
- Retrieval respects classification before semantic search.
- Evidence content never grants tool capability.

## 8. Minimum for material proposal

- source and observedAt;
- authority/freshness;
- integrity/reference;
- exact claim linkage;
- classification;
- contradiction state;
- accessible provenance or explicit limitation.

