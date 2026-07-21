CREATE TABLE IF NOT EXISTS demo_data_provenance (
  id uuid PRIMARY KEY,
  dataset_slug text NOT NULL UNIQUE,
  seed integer NOT NULL,
  namespace_uuid uuid NOT NULL,
  generator_version text NOT NULL,
  fictional integer NOT NULL DEFAULT 1,
  notice text NOT NULL,
  manifest jsonb NOT NULL,
  recorded_at timestamptz NOT NULL,
  CONSTRAINT demo_data_provenance_fictional_check CHECK (fictional = 1),
  CONSTRAINT demo_data_provenance_manifest_check CHECK (jsonb_typeof(manifest) = 'object')
);
