# Architecture and Flows

[Back to the specification overview](../../../SPEC.md)

## Components and ownership

- The Next.js application owns the public UI, API validation, intent classification, investigation creation, result reads, and scenario actions.
- Neon Postgres is the source of truth for current project state, scenarios, investigation lifecycle, and the transactional outbox.
- ClickHouse is the source of truth for synthetic historical analytics, simulation samples, item impacts, and forecast summaries.
- Trigger.dev owns durable seed, synchronization, simulation, retry, fan-out, aggregation, and run-progress orchestration.
- Vercel AI Gateway is used only to classify a question into an approved intent and generate a verdict of at most 40 words.

## Request and result flow

1. The user submits a question through the AI Elements prompt input.
2. `POST /api/chat` validates the typed UI message history and fixed demo project ID.
3. AI SDK structured output maps the final user message to an approved `InvestigationIntent`.
4. The route creates an investigation in Postgres and triggers `forecast-release`.
5. The route returns an AI SDK UI message stream with a short status line and persistent `data-investigation` part containing the investigation ID, Trigger.dev run ID, and run-scoped public token.
6. The browser subscribes to Trigger.dev Realtime and renders task metadata inside the investigation artifact.
7. The workflow loads the operational DAG from Postgres and historical distributions from ClickHouse, fans out deterministic Monte Carlo shards, and writes samples to ClickHouse.
8. The parent task aggregates the analytical result, writes the ClickHouse summary, and persists a result snapshot in Postgres.
9. The artifact loads the completed result and updates the graph, distribution, interventions, and evidence drawer in place.

Progress stages are `loading`, `validating`, `simulating`, `aggregating`, `rendering`, and `complete`. Progress must appear within two seconds of submission; the browser must not poll for workflow status.

## Consistency and failure behavior

- Current-state mutations and their outbox records share one Postgres transaction.
- Synchronization acknowledges outbox rows only after ClickHouse acknowledges the stable batch.
- Simulation randomness is derived from the investigation seed, scenario, shard, and sample number so retries are reproducible.
- A retry creates a new workflow run using the same intent and seed; the failed investigation remains inspectable.
- API and workflow failures use normalized codes and safe detail. User-facing errors preserve the question and offer retry.
- Unsupported questions return three relevant suggestions and do not create an investigation or start a workflow.

## Runtime constraints

Use Node.js 22 or newer. External clients must be created through lazy getters, never during module evaluation. Long-running and retryable work belongs in Trigger.dev, not a Vercel request. The API should return the stream and run identity promptly rather than wait for the forecast.
