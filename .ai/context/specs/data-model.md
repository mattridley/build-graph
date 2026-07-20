# Data Model

[Back to the specification overview](../../../SPEC.md)

## Neon Postgres

Create Drizzle migrations for these operational tables.

### `projects`

- UUID primary key, unique `slug`, `name`, and `description`.
- `timezone`, `target_date`, and `forecast_anchor_at`.
- Working-day start/end and enabled weekdays.
- Created and updated timestamps.

### `scope_groups`

- ID, project ID, unique project-scoped slug, name, description.
- Classification enum: `core` or `optional`.
- Display order.

### `work_items`

- ID, project ID, and optional scope-group ID.
- Kind: `requirement`, `task`, `pull_request`, `test`, or `milestone`.
- Status: `todo`, `in_progress`, `blocked`, or `done`.
- Title, description, and size: `xs`, `s`, `m`, `l`, or `xl`.
- Progress percentage constrained to 0-100.
- Optional source URL/reference, graph coordinates, and timestamps.

### `dependencies`

- Project ID, predecessor ID, and successor ID.
- Type fixed to `finish_to_start` for the MVP.
- Composite primary key over predecessor and successor.
- Reject self-dependencies, cross-project edges, and any graph that is not acyclic.

### `scenarios`

- ID, project ID, slug, name, and description.
- Excluded scope-group IDs and resolved blocker IDs as JSONB.
- Seeded scenarios are immutable for the MVP.

### `investigations`

- ID, project ID, original question, and parsed intent JSONB.
- Target date, selected scenario IDs, Trigger.dev run ID, and deterministic random seed.
- Status: `queued`, `running`, `completed`, or `failed`.
- Final result JSONB, normalized failure code/detail, and lifecycle timestamps.

### `outbox_events`

- UUID primary key, aggregate type/ID, event type, and typed payload JSONB.
- Occurred timestamp, dispatch timestamp, attempt count, and last error.

Every operational mutation must update Postgres and append its outbox event in the same transaction.

## ClickHouse

Use explicit typed columns for frequently queried fields and native `JSON` only for optional source-specific properties.

### Source tables

- `delivery_events`: project/item history, event kind, status, size, progress, duration, source, actor, properties, and timestamps.
- `ci_run_events`: workflow, conclusion, duration, retry count, linked project/item, properties, and timestamps.
- `forecast_samples`: investigation, scenario, sample number, completion timestamp, and sampled critical path.
- `forecast_item_impacts`: item criticality frequency and expected delay contribution by investigation/scenario.
- `forecast_summaries`: on-time probability, target date, p50/p80/p95 completion dates, and sample count.
- `investigation_events`: intent, selected scenarios, latency, outcome, and timestamps.

### Materialized analytical views

Back views with `AggregatingMergeTree` or `SummingMergeTree` tables:

- Cycle-time p25/p50/p90 by item kind, size, and starting status.
- Blocked-duration p25/p50/p90 by work-item kind.
- CI success rate, retry rate, and p50/p90 duration by workflow.
- Daily throughput by project and item kind.

Insert deterministic `JSONEachRow` batches. Every retry reuses the same `insert_deduplication_token`, with dependent-materialized-view deduplication enabled, so retries cannot inflate aggregates.
