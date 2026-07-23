ALTER TABLE delivery_events
UPDATE duration_hours = multiIf(
  size = 'xs', multiIf(duration_hours <= 39, 1, duration_hours <= 108, 3, 9),
  size = 's', multiIf(duration_hours <= 39, 3, duration_hours <= 108, 7, 22),
  size = 'm', multiIf(duration_hours <= 39, 5, duration_hours <= 108, 12, 34),
  size = 'l', multiIf(duration_hours <= 39, 8, duration_hours <= 108, 20, 50),
  size = 'xl', multiIf(duration_hours <= 39, 30, duration_hours <= 108, 55, 90),
  duration_hours
)
WHERE source = 'synthetic-atlas-generator'
  AND event_kind = 'completed'
  AND duration_hours IS NOT NULL
SETTINGS mutations_sync = 2;
-- statement-breakpoint
TRUNCATE TABLE cycle_time_aggregates;
-- statement-breakpoint
INSERT INTO cycle_time_aggregates
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
