-- Initial Release Operations Board schema.
-- Tables live in a dedicated `release_board` namespace so this example owns its
-- schema and coexists with others on the same Neon instance. Statements are
-- idempotent so `db:migrate` can run repeatedly and after each applied version.

CREATE SCHEMA IF NOT EXISTS release_board;

CREATE TABLE IF NOT EXISTS release_board.release_items (
  id text PRIMARY KEY,
  title text NOT NULL,
  summary text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'queued',
  priority text NOT NULL DEFAULT 'medium',
  risk text NOT NULL DEFAULT 'low',
  owner text NOT NULL,
  sla_due_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS release_board.release_events (
  id text PRIMARY KEY,
  item_id text NOT NULL,
  kind text NOT NULL,
  message text NOT NULL DEFAULT '',
  from_status text,
  to_status text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS release_items_status_idx ON release_board.release_items (status);
CREATE INDEX IF NOT EXISTS release_events_item_idx ON release_board.release_events (item_id);
