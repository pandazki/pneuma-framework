CREATE TABLE IF NOT EXISTS release_items (
  id text PRIMARY KEY,
  title text NOT NULL,
  owner text NOT NULL,
  priority text NOT NULL CONSTRAINT release_items_priority_check CHECK (priority IN ('P0', 'P1', 'P2', 'P3')),
  status text NOT NULL CONSTRAINT release_items_status_check CHECK (status IN ('triage', 'in_progress', 'blocked', 'ready_for_release', 'released')),
  sla_at timestamp,
  risk text NOT NULL CONSTRAINT release_items_risk_check CHECK (risk IN ('low', 'medium', 'high', 'critical')),
  notes text NOT NULL DEFAULT '',
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS release_events (
  id text PRIMARY KEY,
  item_id text NOT NULL REFERENCES release_items(id) ON DELETE CASCADE,
  kind text NOT NULL,
  message text NOT NULL,
  actor text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);
