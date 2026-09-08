# Phase 11: Multi-Tenant Organization Persistence & Project Configuration (Doc 16)

## Overview
Phase 11 extends the Forge Autonomous Software Factory Operating System to support durable multi-tenant organizations, agent role governance, and project configurations in SQLite per [Doc 16: Multi-Tenant Organizations](../../16-MULTI-TENANT-ORGS.md).

Prior to Phase 11, the `OrganizationManager` kept organizations and agent rosters in memory, meaning restarts cleared configured org limits, quotas, and agent affiliations. In Phase 11, Schema V5 and dedicated SQLite repositories guarantee durable tenant isolation, persistent org structures, project budgeting, and live multi-tenant switching in the Paperclip Operator Dashboard.

---

## Key Components Implemented

### 1. Storage Layer (Schema V5 & Repositories)
- **Schema V5 ([packages/storage/src/migrations/schema-v5.ts](file:///c:/Users/user/Documents/FORGE%20WANZZ%200.1/packages/storage/src/migrations/schema-v5.ts))**:
  - `organizations`: Durable records with `id`, `project_id`, `name`, `max_agents`, `status`, `metadata`, `created_at`, `updated_at`.
  - `organization_members`: Persistent roster table with `id`, `organization_id` (foreign key with cascade delete), `role`, `capabilities` (JSON), `status`, `created_at`.
  - `project_configs`: Per-project configuration table with `project_id`, `default_org_id`, `security_policy` (JSON), `budget_limit_usd`, `model_routing_preferences` (JSON), timestamps.
- **Repositories**:
  - `OrganizationRepository` ([packages/storage/src/repositories/organization-repository.ts](file:///c:/Users/user/Documents/FORGE%20WANZZ%200.1/packages/storage/src/repositories/organization-repository.ts)): Create, query, update, delete orgs and manage member rosters with JSON serialization for metadata and capabilities.
  - `ProjectRepository` ([packages/storage/src/repositories/project-repository.ts](file:///c:/Users/user/Documents/FORGE%20WANZZ%200.1/packages/storage/src/repositories/project-repository.ts)): Retrieve and persist projects and `project_configs` with budget limits and routing preferences.

### 2. Organization Governance (`@forge/org-manager`)
- Dual-mode architecture in `OrganizationManager` ([packages/org-manager/src/services/organization-manager.ts](file:///c:/Users/user/Documents/FORGE%20WANZZ%200.1/packages/org-manager/src/services/organization-manager.ts)):
  - **In-Memory Mode**: Retains seamless backward compatibility for testing and lightweight runners without requiring an initialized database.
  - **Persistent SQLite Mode**: When initialized with `OrganizationRepository`, all org creations, roster assignments, quota checks, and member queries are durably backed by SQLite.
  - Enforces quota limits (`maxAgents`), tenant boundary isolation, and role capability matching.

### 3. CLI Management (`@forge/cli`)
- **`forge org` CLI ([packages/cli/src/commands/org.ts](file:///c:/Users/user/Documents/FORGE%20WANZZ%200.1/packages/cli/src/commands/org.ts))**:
  - `forge org list`: Lists all registered AI organizations, tenant IDs, and current member headcounts.
  - `forge org create <id> <name> [--max-agents <num>] [--project <id>]`: Creates a persistent organization.
  - `forge org members <orgId>`: Displays the agent roster and assigned roles for an organization.
- **`forge project` CLI ([packages/cli/src/commands/project.ts](file:///c:/Users/user/Documents/FORGE%20WANZZ%200.1/packages/cli/src/commands/project.ts))**:
  - `forge project list`: Lists active workspaces and project IDs.
  - `forge project config [projectId] [--budget <limit>] [--default-org <orgId>]`: Inspects or modifies project budgets and tenant defaults.

### 4. Paperclip Operator Dashboard Integration (`@forge/dashboard`)
- **REST APIs**:
  - `GET /api/org/list`: Returns all persistent organizations for the switcher dropdown.
  - `POST /api/org`: Creates a new organization and broadcasts `ORGANIZATION_CREATED` via SSE.
  - `GET /api/org?orgId=...`: Dynamically scopes company and org chart stats to the chosen organization.
  - `GET /api/project/config?projectId=...` & `POST /api/project/config`: Queries and updates project configuration with SSE broadcast (`PROJECT_CONFIG_UPDATED`).
- **UI Components**:
  - Topbar Organization Switcher dropdown (`#selectActiveOrg`) with quick "+ New Org" action modal.
  - Seamless re-rendering of live org charts, stats, and member rosters upon switching tenant contexts.

---

## Verification & Metrics
- **All 45 Test Suites Passed**: 168 tests passing with 0 failures, 0 warnings, 0 regressions.
- Storage tests:
  - `packages/storage/tests/organization-repository.test.ts` (4 tests)
  - `packages/storage/tests/project-repository.test.ts` (2 tests)
- Org Manager tests:
  - `packages/org-manager/tests/organization-manager.test.ts` (4 tests)
  - `packages/org-manager/tests/organization-persistence.test.ts` (4 tests)
- CLI tests:
  - `packages/cli/tests/cli-org.test.ts` (3 tests)
- Dashboard tests:
  - `packages/dashboard/tests/dashboard-org.test.ts` (3 tests)
  - Total dashboard suite: 19 tests passing
