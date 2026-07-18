CREATE TABLE IF NOT EXISTS manifests (
  id BIGSERIAL PRIMARY KEY,
  manifest_id TEXT UNIQUE,
  source TEXT NOT NULL,
  description TEXT NOT NULL,
  estimated_units NUMERIC,
  estimated_weight NUMERIC,
  estimated_recovery_value NUMERIC,
  pickup_cost NUMERIC,
  labor_cost NUMERIC,
  ai_confidence NUMERIC,
  opportunity_score NUMERIC,
  risk_flags TEXT[] DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'REVIEWING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS manifest_decisions (
  id BIGSERIAL PRIMARY KEY,
  manifest_id BIGINT REFERENCES manifests(id) ON DELETE CASCADE,
  decision TEXT NOT NULL,
  reason_code TEXT,
  operator_notes TEXT,
  operator_name TEXT,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS manifest_events (
  id BIGSERIAL PRIMARY KEY,
  manifest_id BIGINT REFERENCES manifests(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS passports (
  id BIGSERIAL PRIMARY KEY,
  passport_id TEXT UNIQUE,
  manufacturer TEXT,
  model TEXT,
  serial TEXT,
  asset_tag TEXT,
  incoming_weight NUMERIC,
  photo_url TEXT,
  disposition TEXT NOT NULL DEFAULT 'REUSE',
  status TEXT NOT NULL DEFAULT 'received',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS materials_recovered (
  id BIGSERIAL PRIMARY KEY,
  passport_id BIGINT REFERENCES passports(id) ON DELETE CASCADE,
  material_name TEXT NOT NULL,
  quantity NUMERIC,
  unit TEXT,
  sale_value_estimate NUMERIC,
  sale_status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transactions (
  id BIGSERIAL PRIMARY KEY,
  material_id BIGINT REFERENCES materials_recovered(id) ON DELETE CASCADE,
  buyer TEXT,
  sale_price NUMERIC,
  date_sold DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE manifests ADD COLUMN IF NOT EXISTS manifest_id TEXT;
ALTER TABLE manifests ADD COLUMN IF NOT EXISTS risk_flags TEXT[];
ALTER TABLE manifests ALTER COLUMN risk_flags SET DEFAULT '{}';

ALTER TABLE passports ADD COLUMN IF NOT EXISTS passport_id TEXT;
ALTER TABLE passports ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE passports ADD COLUMN IF NOT EXISTS disposition TEXT;
ALTER TABLE passports ALTER COLUMN disposition SET DEFAULT 'REUSE';

CREATE INDEX IF NOT EXISTS idx_manifests_status ON manifests(status);
CREATE INDEX IF NOT EXISTS idx_manifest_decisions_manifest_id ON manifest_decisions(manifest_id);
CREATE INDEX IF NOT EXISTS idx_manifest_events_manifest_id ON manifest_events(manifest_id);
CREATE INDEX IF NOT EXISTS idx_passports_status ON passports(status);
CREATE INDEX IF NOT EXISTS idx_materials_passport_id ON materials_recovered(passport_id);
CREATE INDEX IF NOT EXISTS idx_transactions_material_id ON transactions(material_id);
