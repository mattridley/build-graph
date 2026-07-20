CREATE TABLE IF NOT EXISTS delivery_events (
  event_id UUID,
  project_id UUID,
  item_id UUID,
  event_kind LowCardinality(String),
  status LowCardinality(Nullable(String)),
  size LowCardinality(Nullable(String)),
  progress_percent Nullable(UInt8),
  duration_hours Nullable(Float64),
  source LowCardinality(String),
  actor Nullable(String),
  properties JSON,
  occurred_at DateTime64(3, 'UTC'),
  ingested_at DateTime64(3, 'UTC') DEFAULT now64(3)
) ENGINE = MergeTree
PARTITION BY toYYYYMM(occurred_at)
ORDER BY (project_id, item_id, occurred_at, event_id);
-- statement-breakpoint
CREATE TABLE IF NOT EXISTS ci_run_events (
  run_id String,
  workflow LowCardinality(String),
  conclusion LowCardinality(String),
  duration_seconds UInt32,
  retry_count UInt16,
  project_id Nullable(UUID),
  item_id Nullable(UUID),
  properties JSON,
  started_at DateTime64(3, 'UTC'),
  completed_at DateTime64(3, 'UTC'),
  ingested_at DateTime64(3, 'UTC') DEFAULT now64(3)
) ENGINE = MergeTree
PARTITION BY toYYYYMM(started_at)
ORDER BY (workflow, started_at, run_id);
-- statement-breakpoint
CREATE TABLE IF NOT EXISTS forecast_samples (
  project_id UUID,
  investigation_id UUID,
  scenario_id UUID,
  sample_number UInt32,
  completion_at DateTime64(3, 'UTC'),
  sampled_critical_path Array(UUID),
  created_at DateTime64(3, 'UTC') DEFAULT now64(3)
) ENGINE = MergeTree
PARTITION BY toYYYYMM(created_at)
ORDER BY (project_id, investigation_id, scenario_id, sample_number);
-- statement-breakpoint
CREATE TABLE IF NOT EXISTS forecast_item_impacts (
  project_id UUID,
  investigation_id UUID,
  scenario_id UUID,
  item_id UUID,
  criticality_frequency Float64,
  expected_delay_hours Float64,
  sample_count UInt32,
  created_at DateTime64(3, 'UTC') DEFAULT now64(3)
) ENGINE = MergeTree
PARTITION BY toYYYYMM(created_at)
ORDER BY (project_id, investigation_id, scenario_id, item_id);
-- statement-breakpoint
CREATE TABLE IF NOT EXISTS forecast_summaries (
  project_id UUID,
  investigation_id UUID,
  scenario_id UUID,
  on_time_probability Float64,
  target_date Date,
  p50_completion_date Date,
  p80_completion_date Date,
  p95_completion_date Date,
  sample_count UInt32,
  created_at DateTime64(3, 'UTC') DEFAULT now64(3)
) ENGINE = ReplacingMergeTree(created_at)
PARTITION BY toYYYYMM(created_at)
ORDER BY (project_id, investigation_id, scenario_id);
-- statement-breakpoint
CREATE TABLE IF NOT EXISTS investigation_events (
  event_id UUID,
  project_id UUID,
  investigation_id UUID,
  intent_kind LowCardinality(String),
  selected_scenario_ids Array(UUID),
  latency_ms UInt32,
  outcome LowCardinality(String),
  properties JSON,
  occurred_at DateTime64(3, 'UTC'),
  ingested_at DateTime64(3, 'UTC') DEFAULT now64(3)
) ENGINE = MergeTree
PARTITION BY toYYYYMM(occurred_at)
ORDER BY (project_id, investigation_id, occurred_at, event_id);
