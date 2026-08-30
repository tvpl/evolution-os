# Especificação — Project Manifest

**Kind:** `EvolutionProject`  
**API version inicial:** `evolutionos.io/v1alpha1`

## 1. Objetivo

Oferecer identidade e contexto portáveis para ideia, produto, sistema, serviço, repo, harness ou portfólio. O manifest contém declarações humanas; observações agentic ficam em snapshots separados.

## 2. Estrutura

### `metadata`

- `id`: UUID/ULID imutável; pode ser omitido apenas antes do primeiro register.
- `name`: nome legível.
- `slug`: identificador de URL/workspace.
- `type`: enum inicial ou extension.
- `status`: lifecycle state.
- `labels`, `annotations`.
- `createdAt` quando conhecido.

### `spec.intent`

- `problem`.
- `audiences`.
- `valueProposition`.
- `outcomes[]`: ID, description, metric refs, horizon.
- `nonGoals[]`.

### `spec.hypotheses[]`

- ID, statement, type.
- evidence state.
- metric/threshold.
- status and review trigger.

### `spec.constraints[]`

- ID, category.
- statement.
- severity: mandatory/preferred.
- source/authority.
- validity/review.

### `spec.ownership`

- roles: product, business, architecture, engineering, security, AI, operations.
- subject references; no email required in portable manifest.

### `spec.sources[]`

- source type/provider/reference.
- authority.
- classification.
- sync mode.
- enabled sensors.

### `spec.artifacts[]`

- ID/type/title.
- path/URI/reference.
- authority and classification.

### `spec.relations[]`

- type: contains, implements, dependsOn, replaces, influences, sharesHarness, other extension.
- target project reference.
- direction and criticality.
- condition/environment when relevant.

### `spec.baselines`

- architecture model references.
- policy packs.
- organization standards.
- exception refs.

### `spec.harness`

- harness project reference or inline inventory source refs.
- allowed providers/models.
- skill/module profiles.
- eval suite references.

### `spec.evolution`

- cadence.
- signal profiles.
- autonomy ceiling.
- sync mode.
- review triggers.
- budgets.

## 3. Validation rules

- `idea` requer problem + audience ou explicit unknown.
- `repository` requer source reference.
- IDs dentro do manifest são únicos.
- Relation target não é resolvido apenas por name.
- Mandatory constraint precisa authority/source ou `unverified` flag.
- Autonomy ceiling não pode exceder organization policy; manifest apenas solicita.
- Secrets e raw tokens são proibidos.
- Local paths não são enviados ao Hub sem policy.
- Unknown é representado explicitamente, não string vazia ambígua.

## 4. Merge semantics

- Manifest declarativo vence inference, não observed facts.
- Hub e repo edits usam optimistic version.
- Arrays com ID são merged por ID; order quando semanticamente relevante.
- Delete explícito usa tombstone/change, não ausência silenciosa em partial update.
- Conflict gera reconciliation artifact.

## 5. Versioning

- `v1alpha1`: breaking changes permitidas com migration tooling.
- Stable `v1`: compatibility rules publicadas.
- Export sempre inclui apiVersion/kind.
- Node deve preservar unknown extension fields quando round-trip suportado.

## 6. Exemplo

Ver [`examples/evolution.project.example.yaml`](../../examples/evolution.project.example.yaml).

