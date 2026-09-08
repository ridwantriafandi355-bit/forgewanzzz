export const SCHEMA_V5 = `
CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  name TEXT NOT NULL,
  max_agents INTEGER NOT NULL DEFAULT 5,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  metadata TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_org_project ON organizations(project_id);

CREATE TABLE IF NOT EXISTS organization_members (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  capabilities TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_org_members_org_status ON organization_members(organization_id, status);

CREATE TABLE IF NOT EXISTS project_configs (
  project_id TEXT PRIMARY KEY,
  default_org_id TEXT,
  security_policy TEXT,
  budget_limit_usd REAL DEFAULT 100.0,
  model_routing_preferences TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;
