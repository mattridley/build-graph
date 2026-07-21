ALTER TABLE delivery_events
  ADD COLUMN IF NOT EXISTS item_kind LowCardinality(Nullable(String)) AFTER event_kind;
-- statement-breakpoint
ALTER TABLE delivery_events
  ADD COLUMN IF NOT EXISTS starting_status LowCardinality(Nullable(String)) AFTER status;
-- statement-breakpoint
CREATE TABLE IF NOT EXISTS cycle_time_aggregates (
  project_id UUID,
  item_kind LowCardinality(String),
  size LowCardinality(String),
  starting_status LowCardinality(String),
  duration_quantiles AggregateFunction(quantilesTDigest(0.25, 0.5, 0.9), Float64),
  sample_count AggregateFunction(count)
) ENGINE = AggregatingMergeTree
ORDER BY (project_id, item_kind, size, starting_status);
-- statement-breakpoint
CREATE MATERIALIZED VIEW IF NOT EXISTS cycle_time_aggregates_mv
TO cycle_time_aggregates AS
SELECT
  project_id,
  ifNull(item_kind, 'unknown') AS item_kind,
  ifNull(size, 'unknown') AS size,
  ifNull(starting_status, 'unknown') AS starting_status,
  quantilesTDigestState(0.25, 0.5, 0.9)(assumeNotNull(duration_hours)) AS duration_quantiles,
  countState() AS sample_count
FROM delivery_events
WHERE event_kind = 'completed' AND duration_hours IS NOT NULL
GROUP BY project_id, item_kind, size, starting_status;
-- statement-breakpoint
CREATE TABLE IF NOT EXISTS blocked_duration_aggregates (
  project_id UUID,
  item_kind LowCardinality(String),
  duration_quantiles AggregateFunction(quantilesTDigest(0.25, 0.5, 0.9), Float64),
  sample_count AggregateFunction(count)
) ENGINE = AggregatingMergeTree
ORDER BY (project_id, item_kind);
-- statement-breakpoint
CREATE MATERIALIZED VIEW IF NOT EXISTS blocked_duration_aggregates_mv
TO blocked_duration_aggregates AS
SELECT
  project_id,
  ifNull(item_kind, 'unknown') AS item_kind,
  quantilesTDigestState(0.25, 0.5, 0.9)(assumeNotNull(duration_hours)) AS duration_quantiles,
  countState() AS sample_count
FROM delivery_events
WHERE event_kind = 'blocked_duration' AND duration_hours IS NOT NULL
GROUP BY project_id, item_kind;
-- statement-breakpoint
CREATE TABLE IF NOT EXISTS ci_workflow_aggregates (
  workflow LowCardinality(String),
  success_rate AggregateFunction(avg, UInt8),
  retry_rate AggregateFunction(avg, UInt8),
  duration_quantiles AggregateFunction(quantilesTDigest(0.5, 0.9), Float64),
  run_count AggregateFunction(count)
) ENGINE = AggregatingMergeTree
ORDER BY workflow;
-- statement-breakpoint
CREATE MATERIALIZED VIEW IF NOT EXISTS ci_workflow_aggregates_mv
TO ci_workflow_aggregates AS
SELECT
  workflow,
  avgState(toUInt8(conclusion = 'success')) AS success_rate,
  avgState(toUInt8(retry_count > 0)) AS retry_rate,
  quantilesTDigestState(0.5, 0.9)(toFloat64(duration_seconds)) AS duration_quantiles,
  countState() AS run_count
FROM ci_run_events
GROUP BY workflow;
-- statement-breakpoint
CREATE TABLE IF NOT EXISTS daily_throughput_aggregates (
  project_id UUID,
  item_kind LowCardinality(String),
  day Date,
  completed_count UInt64
) ENGINE = SummingMergeTree
ORDER BY (project_id, item_kind, day);
-- statement-breakpoint
CREATE MATERIALIZED VIEW IF NOT EXISTS daily_throughput_aggregates_mv
TO daily_throughput_aggregates AS
SELECT
  project_id,
  ifNull(item_kind, 'unknown') AS item_kind,
  toDate(occurred_at) AS day,
  count() AS completed_count
FROM delivery_events
WHERE event_kind = 'completed'
GROUP BY project_id, item_kind, day;
