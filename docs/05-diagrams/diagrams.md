# Atlas de diagramas

Todos os diagramas são fontes Mermaid versionáveis. Eles complementam, não substituem, contratos e ADRs.

## D01 — Contexto do ecossistema

```mermaid
flowchart TB
    People["Criadores, equipes e governança"] --> Console["EvolutionOS Console"]
    Agents["Coding agents e agentic apps"] --> Protocol["Evolution Protocol / MCP"]
    Console --> Hub["Evolution Hub"]
    Protocol --> Hub
    Hub <--> Nodes["Evolution Nodes"]
    Hub --> External["Mercado, docs, research, regulation"]
    Nodes --> Internal["Repos, CI, IaC, telemetry, harnesses"]
```

## D02 — Control Plane e Data Plane

```mermaid
flowchart TB
    subgraph CP["Control Plane"]
        Web["Next.js Console"]
        API["Domain API"]
        Orq["Durable Orchestrator"]
        KG["Twin, Evidence, Decision"]
        Gov["Policy and Module Registry"]
        Web --> API
        API --> Orq
        API --> KG
        Orq --> Gov
    end
    subgraph DP["Project Data Plane"]
        Node["Evolution Node"]
        Sensor["Sensors / analyzers"]
        Sandbox["Agent sandbox"]
        Broker["Capability broker"]
        Node --> Sensor
        Node --> Sandbox
        Sandbox --> Broker
    end
    Orq <--> Node
```

## D03 — Ciclo de evolução

```mermaid
stateDiagram-v2
    [*] --> Observe
    Observe --> Understand
    Understand --> Challenge
    Challenge --> Propose
    Propose --> Decide
    Decide --> Observe: watch/defer
    Decide --> Experiment: approve experiment
    Decide --> Execute: approve change
    Experiment --> Verify
    Execute --> Verify
    Verify --> Learn
    Learn --> Observe
```

## D04 — Evidence lineage

```mermaid
flowchart TB
    Source["Source snapshot"] --> Evidence["Evidence"]
    Evidence --> Claim["Claim"]
    Claim --> Finding["Contextual finding"]
    Finding --> Proposal["Evolution proposal"]
    Proposal --> Decision["Decision"]
    Decision --> Change["Experiment / change"]
    Change --> Proof["Verification proof"]
    Proof --> Outcome["Outcome and learning"]
```

## D05 — Estados de verdade

```mermaid
flowchart TB
    Declared["Declared: intent / ADR"] --> Compare["Comparison"]
    Observed["Observed: code / runtime"] --> Compare
    Expected["Expected: baseline / policy"] --> Compare
    Inferred["Inferred: agent analysis"] --> Compare
    Compare --> Aligned["Aligned"]
    Compare --> Drift["Drift finding"]
    Compare --> Unknown["Insufficient context"]
```

## D06 — Pacote modular

```mermaid
flowchart TB
    Manifest["Module manifest"] --> Package["Signed OCI module"]
    Skill["Skills"] --> Package
    Analyzer["Sensors / analyzers"] --> Package
    Connector["Connectors / MCP adapters"] --> Package
    Policy["Policies / schemas / evals"] --> Package
    Package --> Verify["Signature, SBOM, capability check"]
    Verify --> Install["Hub / Node installation"]
    Verify --> Quarantine["Reject / quarantine"]
```

## D07 — Tool/capability mediation

```mermaid
sequenceDiagram
    participant A as Agent
    participant G as Capability Gateway
    participant P as Policy Engine
    participant C as Connector
    A->>G: Request capability + structured input
    G->>P: Actor, task, resource, risk
    P-->>G: Permit with constraints / deny
    G->>C: Call with scoped credential + idempotency
    C-->>G: Classified result / status
    G-->>A: Redacted structured output
```

## D08 — Autonomia progressiva

```mermaid
flowchart TB
    A0["A0 Observe"] --> A1["A1 Analyze"]
    A1 --> A2["A2 Prepare in sandbox"]
    A2 --> A3["A3 Draft issue / PR"]
    A3 --> A4["A4 Reversible execution"]
    A4 --> A5["A5 Constrained operation"]
    Gate["Evals + proof + policy + approval"] -.controls.-> A2
    Gate -.controls.-> A3
    Gate -.controls.-> A4
    Gate -.controls.-> A5
```

## D09 — Evolution Proposal decision tree

```mermaid
flowchart TD
    F["Material finding"] --> C{"Context sufficient?"}
    C -->|No| I["Investigate / request evidence"]
    C -->|Yes| R{"Relevance and impact"}
    R -->|Low| W["Watch / dismiss with reason"]
    R -->|Material| P["Build proposal + alternatives"]
    P --> G{"Policy route"}
    G --> H["Human decision"]
    H -->|Reject| M["Remember reason + trigger"]
    H -->|Experiment| X["Sandbox and verify"]
    H -->|Adopt| E["Controlled change and proof"]
```

## D10 — Campaign enterprise

```mermaid
flowchart TB
    Common["Common finding"] --> Cohort["Verified cohort"]
    Cohort --> Pilot["Diverse canaries"]
    Pilot --> Learn["Recipe + failure taxonomy"]
    Learn --> Wave1["Wave 1"]
    Learn --> Exception["Exceptions / local decisions"]
    Wave1 --> Gate{"Guardrails healthy?"}
    Gate -->|Yes| WaveN["Next waves"]
    Gate -->|No| Pause["Pause / rollback / revise"]
```

## D11 — Harness observatory

```mermaid
flowchart TB
    Tasks["Task datasets and outcomes"] --> Evals["Eval suites"]
    Models["Models / providers"] --> Harness["Harness version"]
    Skills["Instructions / skills / MCPs"] --> Harness
    Policy["Hooks / sandbox / policies"] --> Harness
    Harness --> Evals
    Evals --> Compare["Cost, latency, quality, security"]
    Compare --> Proposal["Keep, remove, update or experiment"]
```

## D12 — Next.js experience boundary

```mermaid
flowchart TB
    Browser["Browser"] --> Next["Next.js App Router / BFF"]
    Next --> API["Control Plane API"]
    Next <-->|SSE progress| Stream["Event Stream Gateway"]
    API --> Workflow["Durable Workflows"]
    API --> Views["Authorized projections"]
    Workflow --> Workers["Agents / connectors / Nodes"]
```

## D13 — Deployment profiles

```mermaid
flowchart TB
    Contracts["Same manifests, modules and protocol"] --> Lite["Lite: local Node"]
    Contracts --> Team["Team: Hub + Nodes"]
    Contracts --> SaaS["Enterprise SaaS federated"]
    Contracts --> Self["Enterprise self-hosted / air-gapped"]
```

## D14 — EvolutionOS monitora a si próprio

```mermaid
flowchart TD
    Platform["EvolutionOS platform"] --> Project["EvolutionOS registered as Project"]
    Modules["Agents, modules, skills, models"] --> Project
    Telemetry["Evals, runs, incidents, costs"] --> Project
    External["Standards and ecosystem changes"] --> Project
    Project --> Proposal["Self-evolution proposal"]
    Proposal --> Governance["Independent approval and canary"]
```
