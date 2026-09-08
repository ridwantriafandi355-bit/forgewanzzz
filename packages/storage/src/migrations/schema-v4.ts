export const SCHEMA_V4 = `
CREATE TABLE IF NOT EXISTS audit_chain (
  block_height INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT UNIQUE NOT NULL,
  prev_hash TEXT NOT NULL,
  block_hash TEXT NOT NULL,
  event_type TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  signature TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_chain_event ON audit_chain(event_type, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_chain_actor ON audit_chain(actor_id, created_at);

CREATE TABLE IF NOT EXISTS revoked_tokens (
  token_id TEXT PRIMARY KEY,
  revoked_at TEXT NOT NULL,
  reason TEXT NOT NULL
);
`;
