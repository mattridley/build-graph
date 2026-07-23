ALTER TABLE delivery_events
UPDATE duration_hours = multiIf(
  size = 'xs' AND duration_hours = 3 AND cityHash64(toString(event_id)) % 4 = 0, 1,
  size = 's' AND duration_hours = 7 AND cityHash64(toString(event_id)) % 4 = 0, 3,
  size = 'm' AND duration_hours = 12 AND cityHash64(toString(event_id)) % 4 = 0, 5,
  size = 'l' AND duration_hours = 20 AND cityHash64(toString(event_id)) % 4 = 0, 8,
  size = 'xl' AND duration_hours = 55 AND cityHash64(toString(event_id)) % 4 = 0, 30,
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
