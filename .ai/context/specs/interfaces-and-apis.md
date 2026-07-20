# Interfaces and APIs

[Back to the specification overview](../../../SPEC.md)

## Investigation intent

```ts
type InvestigationIntent =
  | { kind: "deadline_probability"; targetDate?: string }
  | { kind: "blocker_analysis"; targetDate?: string }
  | { kind: "scope_to_confidence"; targetDate?: string; confidence: number }
  | { kind: "compare_scenarios"; scenarioIds: string[]; targetDate?: string };
```

- A missing target date uses the project target.
- Relative dates resolve in the project timezone.
- Scope confidence defaults to `0.8`.
- Unsupported questions return three relevant suggestions without starting a workflow.

## Forecast result

```ts
interface ForecastResult {
  investigationId: string;
  verdict: {
    headline: string;
    targetDate: string;
    onTimeProbability: number;
    deltaPercentagePoints: number;
    modelDisclaimer: string;
  };
  graph: {
    nodes: DeliveryNode[];
    edges: DeliveryEdge[];
    criticalPathIds: string[];
    highlightedBlockerIds: string[];
    excludedNodeIds: string[];
  };
  distribution: {
    buckets: Array<{ date: string; count: number }>;
    p50: string;
    p80: string;
    p95: string;
  };
  interventions: Array<{
    scenarioId: string;
    label: string;
    probability: number;
    deltaPercentagePoints: number;
    excludedScopeGroups: string[];
  }>;
  evidence: Array<{
    label: string;
    value: string;
    source: "clickhouse" | "postgres" | "simulation";
    detail: string;
  }>;
}
```

Shared contracts must live in a server-safe module and have corresponding Zod schemas where data crosses a process or trust boundary.

## HTTP routes

- `POST /api/chat`: validate messages, classify a supported question, create an investigation, start Trigger.dev, and stream a typed investigation data part.
- `GET /api/projects/demo`: return Atlas, its graph, and saved scenarios.
- `GET /api/investigations/:id`: return the final result, current safe status, or normalized error.
- `POST /api/investigations/:id/retry`: create a new run using the same intent and seed.
- `POST /api/projects/demo/scenarios/:id/forecast`: start a scenario comparison without another model call.
- `GET /api/health`: report configuration and dependency reachability without leaking secrets.

All responses use explicit status codes and typed envelopes. Mutation routes reject requests outside the fixed demo project. The streamed `data-investigation` part contains only the investigation ID, run ID, and scoped public token needed by the artifact.
