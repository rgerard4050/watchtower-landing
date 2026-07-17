CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS dispatch_stops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id BIGINT REFERENCES dispatch_runs(id) ON DELETE CASCADE,
  manifest_id TEXT REFERENCES manifests(manifest_id),
  stop_order INTEGER NOT NULL,
  arrival_window TEXT,
  status TEXT NOT NULL DEFAULT 'WAITING',
  completed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dispatch_stops_run_id ON dispatch_stops(run_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_stops_manifest_id ON dispatch_stops(manifest_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_stops_status ON dispatch_stops(status);
