# Workflows and Forecasting

[Back to the specification overview](../../../SPEC.md)

## Trigger.dev tasks

### `seed-demo-data`

- Idempotently seed Postgres operational rows.
- Generate deterministic historical data in bounded chunks and batch insert ClickHouse events.
- Verify source counts, materialized aggregates, graph integrity, and forecast calibration.

### `sync-outbox`

- Claim undispatched events with `FOR UPDATE SKIP LOCKED`.
- Insert one stable ClickHouse batch using a deterministic deduplication token.
- Mark rows dispatched only after ClickHouse acknowledges the batch.
- Retry transient failures and retain permanent failures for inspection.
- Run after project mutations and on a one-minute recovery schedule.

### `forecast-release`

- Validate the graph, intent, and scenario.
- Read current state from Postgres and historical distributions from ClickHouse.
- Expand baseline plus eligible saved scenarios and fan out shards with `batchTriggerAndWait`.
- Aggregate samples from ClickHouse, persist the Postgres result snapshot and ClickHouse summary, and emit each progress stage.

### `simulate-scenario`

- Run 250 deterministic samples per shard and ten shards per scenario: 2,500 samples total.
- Limit queue concurrency to ten and retry transient failures three times.
- Write samples and item impacts directly to ClickHouse.
- Return only compact shard metadata to the parent task.

## Forecast algorithm

For each sample:

1. Completed nodes have zero remaining duration.
2. Todo nodes sample a triangular distribution from ClickHouse p25/p50/p90 cycle times for their kind and size.
3. In-progress duration is multiplied by `1 - progressPercent`.
4. Blocked nodes add a sampled blocked-duration penalty unless the scenario resolves the blocker.
5. CI/test gates add retry delay from ClickHouse-derived failure probability and duration quantiles.
6. A node starts only after every predecessor completes.
7. Sampled work hours are converted through the project's business calendar.
8. Milestone completion is the maximum predecessor finish time.
9. Record the longest path and each node's delay contribution.

Sparse-history fallback order is exact kind and size, then kind, then global seeded priors. All random choices derive from the investigation seed and stable sample identity.

## Interpretation

On-time probability is the fraction of samples completing by the target. Percentile dates come from the sample completion distribution. Criticality frequency and expected delay contribution drive blocker highlighting and evidence. Scenario comparisons use the same base seed so deltas reflect scenario changes rather than unrelated random variation.

The UI must state that this is a dependency-and-history scenario model, not a delivery commitment, and that individual assignment capacity is outside the MVP.
