export const SCHEMA_V3 = `
CREATE TABLE IF NOT EXISTS memory_records (
  id TEXT PRIMARY KEY,
  scope_type TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  category TEXT NOT NULL,
  title TEXT,
  content TEXT NOT NULL,
  tags TEXT,
  metadata TEXT,
  embedding TEXT,
  token_count INTEGER NOT NULL DEFAULT 0,
  access_count INTEGER NOT NULL DEFAULT 0,
  last_accessed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_memory_scope ON memory_records(scope_type, scope_id);
CREATE INDEX IF NOT EXISTS idx_memory_category ON memory_records(category, created_at);

CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
  id UNINDEXED,
  content,
  title,
  tags,
  scope_type,
  scope_id,
  tokenize = 'porter unicode61'
);
`;
