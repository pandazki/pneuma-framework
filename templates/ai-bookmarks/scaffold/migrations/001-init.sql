-- templates/ai-bookmarks/scaffold/migrations/001-init.sql

CREATE TABLE IF NOT EXISTS _migrations (
  name TEXT PRIMARY KEY,
  applied_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS bookmarks (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  url       TEXT    NOT NULL UNIQUE,
  title     TEXT,
  fetched_at INTEGER NOT NULL,
  raw_text  TEXT
);

CREATE TABLE IF NOT EXISTS interpretations (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  bookmark_id  INTEGER NOT NULL REFERENCES bookmarks(id) ON DELETE CASCADE,
  lens_name    TEXT    NOT NULL,
  body         TEXT    NOT NULL,
  embedding    BLOB    NOT NULL, -- Float32Array packed
  created_at   INTEGER NOT NULL,
  UNIQUE(bookmark_id, lens_name)
);

CREATE INDEX IF NOT EXISTS idx_bookmarks_fetched_at ON bookmarks(fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_interpretations_bookmark ON interpretations(bookmark_id);
