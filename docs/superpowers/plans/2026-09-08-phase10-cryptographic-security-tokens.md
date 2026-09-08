# Phase 10: Cryptographic Security Model & Execution Tokens

## Overview
- **Spec Documentation:** `docs/01-MASTER-PRD.md` (NFR-03, NFR-04), `docs/02-SYSTEM-ARCHITECTURE.md` (Sections 16, 21, 22), `docs/11-TOOL-EXECUTION.md` (Section 17: EXECUTION TOKEN), `docs/06.5-ARCHITECTURAL-DECISIONS.md` (AD-003, AD-004, AD-005).
- **Core Package:** `@forge/security` (New package in workspace).
- **Storage Substrate:** `@forge/storage` Schema V4 (`audit_chain`, `revoked_tokens`) with `AuditChainRepository`.
- **Tool Integration:** `@forge/tool-engine` token verification & constant-time validation.
- **Operator Interface:** `forge security audit` & `forge security revoke` CLI commands, Paperclip Dashboard Telemetry view & APIs (`/api/security/status`, `/api/security/chain`, `/api/security/revoke`).

---

## Technical Specifications

### 1. Storage Schema V4
- **`audit_chain`**:
  - `block_height INTEGER PRIMARY KEY AUTOINCREMENT`
  - `id TEXT UNIQUE NOT NULL`
  - `prev_hash TEXT NOT NULL`
  - `block_hash TEXT NOT NULL`
  - `event_type TEXT NOT NULL`
  - `actor_id TEXT NOT NULL`
  - `payload TEXT NOT NULL`
  - `signature TEXT NOT NULL`
  - `created_at TEXT NOT NULL`
- **`revoked_tokens`**:
  - `token_id TEXT PRIMARY KEY`
  - `revoked_at TEXT NOT NULL`
  - `reason TEXT NOT NULL`
- **`AuditChainRepository`**:
  - Sequential block linkage: `block_hash = sha256(prev_hash + ":" + event_type + ":" + actor_id + ":" + payload + ":" + created_at)`.
  - HMAC-SHA256 signature on block hash.
  - Constant-time `crypto.timingSafeEqual` integrity verification across entire chain.
  - Token revocation and verification.

### 2. `@forge/security` Package
- **`ExecutionTokenManager`**:
  - Scoped execution tokens with `tokenId`, `taskId`, `agentId`, `allowedTools`, `maxInvocations`, `nonce`, `issuedAt`, `expiresAt`.
  - Constant-time signature verification (`crypto.timingSafeEqual`).
  - Strict scope validation: task, agent, workspace path, allowed tools (with `*` wildcard support).
  - Quota enforcement and invocation count tracking.
  - Revocation checking via in-memory set and `AuditChainRepository`.
  - Token serialization: `forge_sec_v1.<payload_b64>.<signature>`.
- **`AuditChain`**:
  - Standalone in-memory or SQLite repository-backed audit ledger.
  - Verifies hash continuity and detects any modification to payload, headers, or signatures.
- **`ProofAttestation`**:
  - Layer 1 cryptographic verification certificates containing `taskId`, `exitCode`, `gitCommitSha`, `testOutputHash`, `signature`.

### 3. Tool Engine & Verification Enforcement
- **`ToolExecutionEngine`**:
  - Validates `token` via `ExecutionTokenManager`.
  - Automatically records invocations against token quotas.
  - Emits immutable `TOOL_EXECUTED` or `TOOL_FAILED` records directly into `AuditChain`.

### 4. CLI & Dashboard Integration
- **CLI Commands**:
  - `forge security audit [--json]`: Computes and verifies entire audit chain integrity.
  - `forge security revoke <tokenId> [--reason "..."]`: Revokes an execution token immediately.
- **Paperclip Dashboard**:
  - Metrics strip: Chain Integrity, Total Blocks, Revoked Tokens, Latest Hash.
  - Real-time cryptographic audit trail table.
  - Token revocation modal with live SSE broadcasting (`TOKEN_REVOKED`).

---

## Verification Summary
- **Unit & Integration Suites:**
  - `packages/storage/tests/audit-chain-repository.test.ts` (5 tests)
  - `packages/security/tests/token-manager.test.ts` (9 tests)
  - `packages/security/tests/audit-chain.test.ts` (3 tests)
  - `packages/security/tests/proof-attestation.test.ts` (2 tests)
  - `packages/tool-engine/tests/tool-security-integration.test.ts` (4 tests)
  - `packages/cli/tests/cli-security.test.ts` (3 tests)
  - `packages/dashboard/tests/dashboard-security.test.ts` (4 tests)
- **Monorepo Pass Rate:** 152 / 152 tests passing (40 test files, 0 regressions).
