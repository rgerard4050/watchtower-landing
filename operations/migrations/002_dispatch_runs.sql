CREATE TABLE IF NOT EXISTS dispatch_runs (
  id BIGSERIAL PRIMARY KEY,
  driver_name TEXT NOT NULL,
  vehicle_name TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ,
  manifest_ids TEXT[] DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'queued',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE dispatch_runs ADD COLUMN IF NOT EXISTS driver_name TEXT;
ALTER TABLE dispatch_runs ADD COLUMN IF NOT EXISTS vehicle_name TEXT;
ALTER TABLE dispatch_runs ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;
ALTER TABLE dispatch_runs ADD COLUMN IF NOT EXISTS manifest_ids TEXT[];
ALTER TABLE dispatch_runs ADD COLUMN IF NOT EXISTS status TEXT;
ALTER TABLE dispatch_runs ALTER COLUMN status SET DEFAULT 'queued';

CREATE INDEX IF NOT EXISTS idx_dispatch_runs_status ON dispatch_runs(status);
