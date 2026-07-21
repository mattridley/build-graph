CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- statement-breakpoint
DO $$ BEGIN
  CREATE TYPE scope_classification AS ENUM ('core', 'optional');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- statement-breakpoint
DO $$ BEGIN
  CREATE TYPE work_item_kind AS ENUM ('requirement', 'task', 'pull_request', 'test', 'milestone');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- statement-breakpoint
DO $$ BEGIN
  CREATE TYPE work_item_status AS ENUM ('todo', 'in_progress', 'blocked', 'done');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- statement-breakpoint
DO $$ BEGIN
  CREATE TYPE work_item_size AS ENUM ('xs', 's', 'm', 'l', 'xl');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- statement-breakpoint
DO $$ BEGIN
  CREATE TYPE dependency_type AS ENUM ('finish_to_start');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- statement-breakpoint
DO $$ BEGIN
  CREATE TYPE investigation_status AS ENUM ('queued', 'running', 'completed', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- statement-breakpoint
CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  timezone text NOT NULL DEFAULT 'UTC',
  target_date date NOT NULL,
  forecast_anchor_at timestamptz NOT NULL,
  working_day_start time NOT NULL DEFAULT '09:00:00',
  working_day_end time NOT NULL DEFAULT '17:00:00',
  enabled_weekdays integer[] NOT NULL DEFAULT ARRAY[1, 2, 3, 4, 5],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT projects_working_hours_check CHECK (working_day_start < working_day_end),
  CONSTRAINT projects_enabled_weekdays_check CHECK (
    cardinality(enabled_weekdays) > 0
    AND enabled_weekdays <@ ARRAY[1, 2, 3, 4, 5, 6, 7]::integer[]
  )
);
-- statement-breakpoint
CREATE TABLE IF NOT EXISTS scope_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  slug text NOT NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  classification scope_classification NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  CONSTRAINT scope_groups_project_slug_uq UNIQUE (project_id, slug),
  CONSTRAINT scope_groups_project_id_id_uq UNIQUE (project_id, id)
);
-- statement-breakpoint
CREATE INDEX IF NOT EXISTS scope_groups_project_order_idx ON scope_groups(project_id, display_order);
-- statement-breakpoint
CREATE TABLE IF NOT EXISTS work_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  scope_group_id uuid,
  kind work_item_kind NOT NULL,
  status work_item_status NOT NULL DEFAULT 'todo',
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  size work_item_size NOT NULL,
  progress_percent integer NOT NULL DEFAULT 0,
  source_url text,
  source_reference text,
  graph_x real,
  graph_y real,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT work_items_project_id_id_uq UNIQUE (project_id, id),
  CONSTRAINT work_items_scope_group_fk FOREIGN KEY (project_id, scope_group_id)
    REFERENCES scope_groups(project_id, id) ON DELETE RESTRICT,
  CONSTRAINT work_items_progress_check CHECK (progress_percent BETWEEN 0 AND 100)
);
-- statement-breakpoint
CREATE INDEX IF NOT EXISTS work_items_project_status_idx ON work_items(project_id, status);
-- statement-breakpoint
CREATE INDEX IF NOT EXISTS work_items_project_scope_idx ON work_items(project_id, scope_group_id);
-- statement-breakpoint
CREATE TABLE IF NOT EXISTS dependencies (
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  predecessor_id uuid NOT NULL,
  successor_id uuid NOT NULL,
  type dependency_type NOT NULL DEFAULT 'finish_to_start',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dependencies_pk PRIMARY KEY (predecessor_id, successor_id),
  CONSTRAINT dependencies_predecessor_fk FOREIGN KEY (project_id, predecessor_id)
    REFERENCES work_items(project_id, id) ON DELETE CASCADE,
  CONSTRAINT dependencies_successor_fk FOREIGN KEY (project_id, successor_id)
    REFERENCES work_items(project_id, id) ON DELETE CASCADE,
  CONSTRAINT dependencies_no_self_check CHECK (predecessor_id <> successor_id),
  CONSTRAINT dependencies_type_check CHECK (type = 'finish_to_start')
);
-- statement-breakpoint
CREATE INDEX IF NOT EXISTS dependencies_project_successor_idx ON dependencies(project_id, successor_id);
-- statement-breakpoint
CREATE TABLE IF NOT EXISTS scenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  slug text NOT NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  excluded_scope_group_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  resolved_blocker_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_seeded integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scenarios_project_slug_uq UNIQUE (project_id, slug),
  CONSTRAINT scenarios_project_id_id_uq UNIQUE (project_id, id),
  CONSTRAINT scenarios_seeded_check CHECK (is_seeded = 1),
  CONSTRAINT scenarios_excluded_ids_check CHECK (jsonb_typeof(excluded_scope_group_ids) = 'array'),
  CONSTRAINT scenarios_resolved_ids_check CHECK (jsonb_typeof(resolved_blocker_ids) = 'array')
);
-- statement-breakpoint
CREATE INDEX IF NOT EXISTS scenarios_project_idx ON scenarios(project_id);
-- statement-breakpoint
CREATE TABLE IF NOT EXISTS investigations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  original_question text NOT NULL,
  parsed_intent jsonb NOT NULL,
  target_date date NOT NULL,
  selected_scenario_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  trigger_run_id text,
  random_seed integer NOT NULL,
  status investigation_status NOT NULL DEFAULT 'queued',
  final_result jsonb,
  failure_code text,
  failure_detail text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT investigations_intent_object_check CHECK (jsonb_typeof(parsed_intent) = 'object'),
  CONSTRAINT investigations_scenario_ids_check CHECK (jsonb_typeof(selected_scenario_ids) = 'array'),
  CONSTRAINT investigations_final_result_check CHECK (final_result IS NULL OR jsonb_typeof(final_result) = 'object')
);
-- statement-breakpoint
CREATE INDEX IF NOT EXISTS investigations_project_created_idx ON investigations(project_id, created_at);
-- statement-breakpoint
CREATE INDEX IF NOT EXISTS investigations_project_status_idx ON investigations(project_id, status);
-- statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS investigations_trigger_run_uq ON investigations(trigger_run_id) WHERE trigger_run_id IS NOT NULL;
-- statement-breakpoint
CREATE TABLE IF NOT EXISTS outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_type text NOT NULL,
  aggregate_id text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  dispatched_at timestamptz,
  claimed_at timestamptz,
  claim_token uuid,
  attempt_count integer NOT NULL DEFAULT 0,
  last_error text,
  CONSTRAINT outbox_payload_check CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT outbox_attempt_count_check CHECK (attempt_count >= 0)
);
-- statement-breakpoint
CREATE INDEX IF NOT EXISTS outbox_undispatched_idx ON outbox_events(occurred_at) WHERE dispatched_at IS NULL;
-- statement-breakpoint
CREATE INDEX IF NOT EXISTS outbox_claim_token_idx ON outbox_events(claim_token);
